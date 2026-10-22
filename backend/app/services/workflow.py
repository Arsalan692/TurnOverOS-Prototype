"""Turnover workflow: Notice Autopilot, moving between stages, approving applicants."""

from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    Application, Lease, Listing, StageEvent, Task, Tenant, Turnover, Unit, Vendor,
)
from ..stages import STAGE_INFO, Stage
from .common import default_move_out, stage_index, today
from .pricing import comparables


# ---------------------------------------------------------------- helpers

# Which stage each kind of task belongs to
TASK_STAGE = {
    "photos": Stage.PHOTOS,
    "move_out_inspection": Stage.MOVE_OUT_INSPECTION,
    "cleaning": Stage.MAKE_READY,
    "repairs": Stage.MAKE_READY,
    "painting": Stage.MAKE_READY,
}

def best_vendor(db: Session, city: str, trade: str) -> Vendor | None:
    """Fastest good vendor: highest rating per day of turnaround."""
    vendors = db.scalars(select(Vendor).where(Vendor.city == city, Vendor.trade == trade)).all()
    return max(vendors, key=lambda v: float(v.rating) / float(v.avg_turnaround_days), default=None)


def template_listing(unit: Unit, price: int, available: date) -> tuple[str, str]:
    """Plain listing text. Phase 4 replaces this with the Gemini listing writer."""
    p = unit.property
    beds = "Studio" if unit.bedrooms == 0 else f"{unit.bedrooms} Bed"
    title = f"{beds} {p.property_type.title()} in {p.neighbourhood} - ${price}/mo - Available {available:%b %d}"
    desc = (f"{beds}, {unit.bathrooms} bath {p.property_type} in {p.neighbourhood}, {p.city}. "
            f"{unit.sqft} sq ft. Features: {', '.join(unit.amenities)}. Parking: {unit.parking}. "
            f"{'Pets considered.' if unit.pets_allowed else 'No pets.'} Available {available:%B %d}.")
    return title, desc


def open_stage(db: Session, t: Turnover, stage: Stage, when: date):
    t.current_stage = stage
    t.stage_entered_at = when
    db.add(StageEvent(turnover=t, stage=stage, entered_at=when))


def close_current_stage(t: Turnover, when: date):
    for ev in t.stage_events:
        if ev.exited_at is None:
            ev.exited_at = when


def active_lease(unit: Unit) -> Lease | None:
    return next((le for le in unit.leases if le.status == "active"), None)


def post_listings(db: Session, t: Turnover, when: date, available: date):
    title, desc = template_listing(t.unit, t.asking_rent, available)
    for channel in ("rentfaster", "facebook"):
        db.add(Listing(turnover=t, channel=channel, title=title, description=desc,
                       price=t.asking_rent, posted_at=when, status="live"))


# ---------------------------------------------------------------- Notice Autopilot

def log_notice(db: Session, unit: Unit, notice_date: date | None, move_out: date | None,
               autopilot: bool) -> tuple[Turnover, list[dict]]:
    """Tenant gave notice. With autopilot ON, the whole turnover is planned
    immediately so the next tenant can be found before this one leaves."""
    if any(t.status == "active" for t in unit.turnovers):
        raise HTTPException(409, "This unit already has a turnover in progress.")
    lease = active_lease(unit)
    if lease is None:
        raise HTTPException(409, "This unit has no active lease to end.")

    notice_date = notice_date or today()
    move_out = move_out or default_move_out(notice_date)
    if move_out <= notice_date:
        raise HTTPException(422, "Move-out date must be after the notice date.")

    comps = comparables(db, unit)
    asking = comps.get("recommended_rent", unit.market_rent)
    city = unit.property.city

    lease.end_date = move_out
    t = Turnover(unit=unit, outgoing_lease=lease, notice_date=notice_date, move_out_date=move_out,
                 current_stage=Stage.NOTICE, stage_entered_at=notice_date, status="active",
                 autopilot=autopilot, pre_marketed=autopilot,
                 previous_rent=lease.monthly_rent, asking_rent=asking)
    db.add(t)
    unit.status = "notice"
    open_stage(db, t, Stage.NOTICE, notice_date)

    actions: list[dict] = [{"when": notice_date, "action": f"Notice logged. Move-out {move_out:%b %d}."}]
    if not autopilot:
        return t, actions

    # 1. Price from recent comparable leases
    actions.append({"when": notice_date,
                    "action": f"Set asking rent ${asking} from {comps.get('count', 0)} similar leases "
                              f"({comps.get('scope', 'no comparables')})."})

    # 2. Plan the make-ready work for move-out day, with the fastest good vendors
    plan = [
        ("photos", "photography", notice_date + timedelta(days=2),
         "Photos of the occupied unit (24h entry notice to tenant)", 150),
        ("move_out_inspection", "inspection", move_out, "Move-out inspection (required in Alberta)", 0),
        ("cleaning", "cleaning", move_out + timedelta(days=1), "Turnover cleaning", 350),
        ("repairs", "repairs", move_out + timedelta(days=1), "Repairs from inspection", None),
    ]
    for kind, trade, when, label, cost in plan:
        v = best_vendor(db, city, trade)
        db.add(Task(turnover=t, task_type=kind, vendor=v, scheduled_for=when,
                    status="scheduled", cost=cost, auto_created=True))
        actions.append({"when": when, "action": f"{label}: booked {v.name if v else 'vendor'}."})

    # 3. Go to market now, not after move-out
    close_current_stage(t, notice_date)
    open_stage(db, t, Stage.PRE_MARKETING, notice_date)
    available = move_out + timedelta(days=2)
    post_listings(db, t, notice_date, available)
    actions.append({"when": notice_date,
                    "action": f"Listed on Rentfaster and Facebook at ${asking}, available {available:%b %d}."})
    return t, actions


# ---------------------------------------------------------------- moving stages

def move_stage(db: Session, t: Turnover, new_stage: Stage) -> Turnover:
    if t.status != "active":
        raise HTTPException(409, "This turnover is already finished.")
    if stage_index(new_stage) <= stage_index(t.current_stage):
        raise HTTPException(422, "A unit can only move forward.")
    when = today()
    unit = t.unit
    crossed = lambda s: stage_index(t.current_stage) < stage_index(s) <= stage_index(new_stage)  # noqa: E731

    close_current_stage(t, when)

    # Old tenant has left
    if crossed(Stage.MOVE_OUT_INSPECTION):
        if t.move_out_date > when:
            t.move_out_date = when
        if t.outgoing_lease:
            t.outgoing_lease.status = "ended"
            t.outgoing_lease.end_date = t.move_out_date
        unit.status = "vacant"

    # Listing goes live if it isn't already
    if crossed(Stage.LISTED) and not any(li.status == "live" for li in t.listings):
        post_listings(db, t, when, max(when, t.move_out_date) + timedelta(days=1))

    # Tasks belonging to stages we just left are done; if the tenant left early,
    # pull the remaining make-ready work forward.
    for task in t.tasks:
        if task.status != "scheduled":
            continue
        task_stage = TASK_STAGE.get(task.task_type)
        photos_taken = task.task_type == "photos" and task.scheduled_for and task.scheduled_for <= when
        if photos_taken or (task_stage and stage_index(task_stage) < stage_index(new_stage)):
            task.status, task.completed_at = "done", when
        elif task.scheduled_for and task.scheduled_for > when and crossed(Stage.MOVE_OUT_INSPECTION):
            task.scheduled_for = when + timedelta(days=0 if task.task_type == "move_out_inspection" else 1)

    # New tenant signed
    if crossed(Stage.LEASE_SIGNED):
        if t.incoming_lease is None:
            pending = [a for a in t.applications if a.status in ("submitted", "approved")]
            best = max(pending, key=lambda a: a.monthly_income or 0, default=None)
            if best:
                decide_application(db, best, approve=True)
            else:
                _create_incoming_lease(db, t, None)
        for li in t.listings:
            li.status = "closed"

    # New tenant moved in -> turnover done
    if new_stage == Stage.MOVED_IN:
        t.move_in_date = max(when, t.move_out_date)
        t.status = "completed"
        if t.incoming_lease:
            t.incoming_lease.status = "active"
            t.incoming_lease.start_date = t.move_in_date
        unit.status = "occupied"
        open_stage(db, t, Stage.MOVED_IN, when)
        close_current_stage(t, when)
        return t

    if unit.status == "vacant" and new_stage in (Stage.NOTICE, Stage.PRE_MARKETING):
        unit.status = "notice"
    open_stage(db, t, new_stage, when)
    return t


# ---------------------------------------------------------------- applications

def _create_incoming_lease(db: Session, t: Turnover, app: Application | None) -> Lease:
    unit = t.unit
    tenant = Tenant(full_name=app.applicant_name if app else "New tenant",
                    email=app.email if app else "new.tenant@example.com",
                    phone=app.phone if app else "")
    rent = t.asking_rent or unit.market_rent
    start = max(today(), t.move_out_date) + timedelta(days=1)
    lease = Lease(unit=unit, tenant=tenant, start_date=start, end_date=start + timedelta(days=365),
                  monthly_rent=rent, status="upcoming")
    db.add_all([tenant, lease])
    t.incoming_lease = lease
    t.final_rent = rent
    return lease


def decide_application(db: Session, app: Application, approve: bool) -> Application:
    t = app.turnover
    if t.status != "active":
        raise HTTPException(409, "This turnover is already finished.")
    if app.status not in ("submitted",) and not (approve and app.status == "approved"):
        raise HTTPException(409, f"Application is already {app.status}.")
    app.decided_at = today()
    if not approve:
        app.status = "declined"
        return app
    if t.incoming_lease is not None and app.status != "approved":
        raise HTTPException(409, "Another applicant is already approved for this unit.")
    app.status = "approved"
    if t.incoming_lease is None:
        _create_incoming_lease(db, t, app)
    for other in t.applications:
        if other is not app and other.status == "submitted":
            other.status, other.decided_at = "declined", today()
    return app


def stage_summary(stage: Stage) -> dict:
    return {"key": stage.value, **STAGE_INFO[stage]}

