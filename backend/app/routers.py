"""API endpoints. Interactive docs: http://localhost:8000/docs"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from .db import get_db
from .models import Application, Lease, Listing, Property, Turnover, Unit
from .serializers import card, turnover_detail, unit_brief
from .services import metrics, pricing, workflow
from .services.common import default_move_out, today
from .stages import STAGE_INFO, STAGE_ORDER, Stage

router = APIRouter(prefix="/api")

TURNOVER_LOAD = (
    selectinload(Turnover.unit).selectinload(Unit.property),
    selectinload(Turnover.unit).selectinload(Unit.leases),
    selectinload(Turnover.listings).selectinload(Listing.leads),
    selectinload(Turnover.applications),
    selectinload(Turnover.stage_events),
    selectinload(Turnover.tasks),
    selectinload(Turnover.outgoing_lease).selectinload(Lease.tenant),
    selectinload(Turnover.incoming_lease).selectinload(Lease.tenant),
)


def get_turnover(db: Session, turnover_id: int) -> Turnover:
    t = db.scalars(select(Turnover).where(Turnover.id == turnover_id).options(*TURNOVER_LOAD)).first()
    if t is None:
        raise HTTPException(404, "Turnover not found.")
    return t


# ---------------------------------------------------------------- reference

@router.get("/stages", tags=["reference"])
def stages():
    """The 10 turnover stages, in order, with target days."""
    return [{"key": s.value, **STAGE_INFO[s]} for s in STAGE_ORDER]


# ---------------------------------------------------------------- board

@router.get("/board", tags=["board"])
def board(city: str | None = None, db: Session = Depends(get_db)):
    """Active turnovers grouped by stage, for the Kanban board."""
    q = select(Turnover).where(Turnover.status == "active").options(*TURNOVER_LOAD)
    if city:
        q = q.join(Turnover.unit).join(Unit.property).where(Property.city == city)
    cards = [card(t) for t in db.scalars(q).all()]
    order = {"late": 0, "warn": 1, "ok": 2}
    cards.sort(key=lambda c: (order[c["health"]], -c["days_in_stage"]))
    columns = [{"key": s.value, **STAGE_INFO[s], "cards": [c for c in cards if c["stage"] == s.value]}
               for s in STAGE_ORDER if s != Stage.MOVED_IN]
    return {
        "columns": columns,
        "summary": {
            "active": len(cards),
            "late": sum(c["health"] == "late" for c in cards),
            "warn": sum(c["health"] == "warn" for c in cards),
            "vacant": sum(c["days_vacant"] > 0 for c in cards),
            "rent_lost_so_far": sum(c["rent_lost"] for c in cards),
        },
    }


# ---------------------------------------------------------------- turnovers

@router.get("/turnovers/{turnover_id}", tags=["turnovers"])
def turnover(turnover_id: int, db: Session = Depends(get_db)):
    return turnover_detail(get_turnover(db, turnover_id))


class MoveStage(BaseModel):
    stage: Stage | None = Field(None, description="Target stage. Omit to go to the next stage.")


@router.post("/turnovers/{turnover_id}/move", tags=["turnovers"])
def move(turnover_id: int, body: MoveStage, db: Session = Depends(get_db)):
    """Move a unit forward on the board (drag & drop or 'Next step')."""
    t = get_turnover(db, turnover_id)
    target = body.stage
    if target is None:
        i = STAGE_ORDER.index(t.current_stage)
        # Pre-marketing already did the photos/listing/showings work
        nxt = STAGE_ORDER[i + 1]
        if t.current_stage == Stage.MAKE_READY and t.pre_marketed:
            approved = any(a.status == "approved" for a in t.applications)
            nxt = Stage.LEASE_SIGNED if approved else Stage.SHOWINGS
        target = nxt
    workflow.move_stage(db, t, target)
    db.commit()
    return turnover_detail(get_turnover(db, turnover_id))


@router.get("/turnovers/{turnover_id}/price-suggestion", tags=["turnovers"])
def price_suggestion(turnover_id: int, db: Session = Depends(get_db)):
    """Smart price suggestion from comparable leases and enquiry speed."""
    return pricing.suggest_price(db, get_turnover(db, turnover_id))


class SetPrice(BaseModel):
    price: int = Field(gt=0)


@router.post("/turnovers/{turnover_id}/price", tags=["turnovers"])
def set_price(turnover_id: int, body: SetPrice, db: Session = Depends(get_db)):
    """Change the asking rent (updates live listings too)."""
    t = get_turnover(db, turnover_id)
    t.asking_rent = body.price
    for li in t.listings:
        if li.status == "live":
            li.price = body.price
    db.commit()
    return turnover_detail(get_turnover(db, turnover_id))


class Decision(BaseModel):
    approve: bool


@router.post("/applications/{application_id}/decision", tags=["turnovers"])
def decide(application_id: int, body: Decision, db: Session = Depends(get_db)):
    app = db.get(Application, application_id)
    if app is None:
        raise HTTPException(404, "Application not found.")
    t = get_turnover(db, app.turnover_id)
    app = next(a for a in t.applications if a.id == application_id)
    workflow.decide_application(db, app, body.approve)
    db.commit()
    return turnover_detail(get_turnover(db, t.id))


# ---------------------------------------------------------------- units + Notice Autopilot

@router.get("/units", tags=["units"])
def units(q: str | None = None, city: str | None = None, status: str | None = None,
          limit: int = Query(25, le=100), offset: int = 0, db: Session = Depends(get_db)):
    """Search units (used by 'Log notice')."""
    stmt = select(Unit).join(Unit.property).options(
        selectinload(Unit.property), selectinload(Unit.leases).selectinload(Lease.tenant))
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Property.name.ilike(like), Property.address.ilike(like),
                              Property.neighbourhood.ilike(like), Unit.unit_number.ilike(like)))
    if city:
        stmt = stmt.where(Property.city == city)
    if status:
        stmt = stmt.where(Unit.status == status)
    rows = db.scalars(stmt.order_by(Property.name, Unit.unit_number).offset(offset).limit(limit)).all()
    out = []
    for u in rows:
        lease = workflow.active_lease(u)
        out.append({**unit_brief(u),
                    "tenant": lease.tenant.full_name if lease else None,
                    "lease_end": lease.end_date if lease else None,
                    "current_rent": lease.monthly_rent if lease else None})
    return out


@router.get("/units/{unit_id}", tags=["units"])
def unit(unit_id: int, db: Session = Depends(get_db)):
    u = db.scalars(select(Unit).where(Unit.id == unit_id).options(
        selectinload(Unit.property), selectinload(Unit.leases).selectinload(Lease.tenant),
        selectinload(Unit.turnovers))).first()
    if u is None:
        raise HTTPException(404, "Unit not found.")
    lease = workflow.active_lease(u)
    return {
        **unit_brief(u),
        "pets_allowed": u.pets_allowed, "parking": u.parking,
        "utilities_included": u.utilities_included, "amenities": u.amenities,
        "tenant": lease.tenant.full_name if lease else None,
        "current_rent": lease.monthly_rent if lease else None,
        "lease_end": lease.end_date if lease else None,
        "default_move_out": default_move_out(today()),
        "turnovers": [{"id": t.id, "status": t.status, "stage": t.current_stage.value,
                       "move_out_date": t.move_out_date, "move_in_date": t.move_in_date,
                       "days_vacant": (t.move_in_date - t.move_out_date).days if t.move_in_date else None,
                       "pre_marketed": t.pre_marketed}
                      for t in sorted(u.turnovers, key=lambda t: t.notice_date, reverse=True)],
    }


class Notice(BaseModel):
    notice_date: date | None = None
    move_out_date: date | None = None
    autopilot: bool = True


@router.post("/units/{unit_id}/notice", tags=["units"])
def log_notice(unit_id: int, body: Notice, db: Session = Depends(get_db)):
    """Tenant gave notice. With autopilot, the whole turnover is planned at once:
    price set, vendors booked, unit listed before the tenant moves out."""
    u = db.scalars(select(Unit).where(Unit.id == unit_id).options(
        selectinload(Unit.property), selectinload(Unit.leases), selectinload(Unit.turnovers))).first()
    if u is None:
        raise HTTPException(404, "Unit not found.")
    t, actions = workflow.log_notice(db, u, body.notice_date, body.move_out_date, body.autopilot)
    db.commit()
    return {"turnover": turnover_detail(get_turnover(db, t.id)), "actions": actions}


# ---------------------------------------------------------------- dashboard

@router.get("/dashboard", tags=["dashboard"])
def dashboard(city: str | None = None, db: Session = Depends(get_db)):
    """Vacancy KPIs, where the days go, trend, city and pre-marketing comparisons."""
    return metrics.dashboard(db, city)
