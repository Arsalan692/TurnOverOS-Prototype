"""Turn database objects into the JSON the frontend uses."""

from .models import Application, Listing, Task, Turnover, Unit
from .services.common import (
    daily_rent, days_in_stage, days_vacant, health, today, unit_label,
)
from .stages import STAGE_INFO


def unit_brief(u: Unit) -> dict:
    p = u.property
    return {
        "id": u.id, "label": unit_label(u), "unit_number": u.unit_number,
        "property_id": p.id, "property_name": p.name, "property_type": p.property_type,
        "address": p.address, "city": p.city, "neighbourhood": p.neighbourhood,
        "bedrooms": u.bedrooms, "bathrooms": float(u.bathrooms), "sqft": u.sqft,
        "market_rent": u.market_rent, "status": u.status, "photo": p.photo,
    }


def card(t: Turnover) -> dict:
    """One card on the Turnover Board."""
    rent = t.asking_rent or t.unit.market_rent
    vacant = days_vacant(t)
    leads = sum(len(li.leads) for li in t.listings if li.status == "live")
    return {
        "id": t.id,
        "unit": unit_brief(t.unit),
        "stage": t.current_stage.value,
        "stage_label": STAGE_INFO[t.current_stage]["label"],
        "days_in_stage": days_in_stage(t),
        "target_days": STAGE_INFO[t.current_stage]["target_days"],
        "health": health(t),
        "notice_date": t.notice_date,
        "move_out_date": t.move_out_date,
        "days_until_move_out": (t.move_out_date - today()).days,
        "days_vacant": vacant,
        "rent_lost": round(vacant * daily_rent(rent)),
        "asking_rent": t.asking_rent,
        "leads": leads,
        "autopilot": t.autopilot,
        "pre_marketed": t.pre_marketed,
        "has_approved_applicant": any(a.status == "approved" for a in t.applications),
    }


def task_json(k: Task) -> dict:
    return {
        "id": k.id, "type": k.task_type, "status": k.status, "scheduled_for": k.scheduled_for,
        "completed_at": k.completed_at, "cost": k.cost, "auto_created": k.auto_created,
        "vendor": {"id": k.vendor.id, "name": k.vendor.name, "rating": float(k.vendor.rating),
                   "avg_turnaround_days": float(k.vendor.avg_turnaround_days)} if k.vendor else None,
    }


def listing_json(li: Listing) -> dict:
    responded = [ld for ld in li.leads if ld.responded_at]
    avg_resp = (sum((ld.responded_at - ld.received_at).total_seconds() for ld in responded)
                / len(responded) / 3600) if responded else None
    return {
        "id": li.id, "channel": li.channel, "title": li.title, "description": li.description,
        "price": li.price, "posted_at": li.posted_at, "status": li.status,
        "ai_generated": li.ai_generated, "leads": len(li.leads),
        "avg_response_hours": round(avg_resp, 1) if avg_resp is not None else None,
    }


def application_json(a: Application, rent: int | None) -> dict:
    return {
        "id": a.id, "applicant_name": a.applicant_name, "email": a.email, "phone": a.phone,
        "employer": a.employer, "monthly_income": a.monthly_income,
        "income_to_rent": round(a.monthly_income / rent, 2) if a.monthly_income and rent else None,
        "household_size": a.household_size, "has_pets": a.has_pets,
        "desired_move_in": a.desired_move_in, "submitted_at": a.submitted_at,
        "decided_at": a.decided_at, "status": a.status,
        "ai_summary": a.ai_summary, "ai_extracted": a.ai_extracted,
    }


def turnover_detail(t: Turnover) -> dict:
    u = t.unit
    rent = t.asking_rent or u.market_rent
    return {
        **card(t),
        "status": t.status,
        "move_in_date": t.move_in_date,
        "previous_rent": t.previous_rent,
        "final_rent": t.final_rent,
        "unit_details": {
            **unit_brief(u),
            "pets_allowed": u.pets_allowed, "parking": u.parking,
            "utilities_included": u.utilities_included, "amenities": u.amenities,
            "year_built": u.property.year_built,
        },
        "outgoing_tenant": t.outgoing_lease.tenant.full_name if t.outgoing_lease else None,
        "incoming_tenant": t.incoming_lease.tenant.full_name if t.incoming_lease else None,
        "timeline": [
            {"stage": e.stage.value, "label": STAGE_INFO[e.stage]["label"],
             "entered_at": e.entered_at, "exited_at": e.exited_at,
             "days": ((e.exited_at or today()) - e.entered_at).days,
             "target_days": STAGE_INFO[e.stage]["target_days"]}
            for e in t.stage_events
        ],
        "tasks": [task_json(k) for k in sorted(t.tasks, key=lambda k: (k.scheduled_for or today(), k.id))],
        "listings": [listing_json(li) for li in t.listings],
        "applications": [application_json(a, rent) for a in
                         sorted(t.applications, key=lambda a: (a.status != "approved", a.submitted_at))],
    }
