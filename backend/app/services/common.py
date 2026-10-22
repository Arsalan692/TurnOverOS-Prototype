"""Small helpers shared by the services."""

import calendar
from datetime import date, timedelta

from ..models import Turnover, Unit
from ..stages import STAGE_INFO, STAGE_ORDER, VACANT_STAGES, Stage


def today() -> date:
    return date.today()


def daily_rent(monthly: float | int | None) -> float:
    """Monthly rent -> rent per day (12 months / 365 days)."""
    return float(monthly or 0) * 12 / 365


def round25(x: float) -> int:
    return int(round(x / 25) * 25)


def month_end(d: date) -> date:
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def default_move_out(notice: date) -> date:
    """Alberta monthly tenancy: notice must cover one full rental month,
    so the earliest move-out is the end of the following month."""
    first_next = month_end(notice) + timedelta(days=1)
    return month_end(first_next)


def unit_label(unit: Unit) -> str:
    p = unit.property
    return p.name if unit.unit_number == "Main" else f"{p.name} #{unit.unit_number}"


def stage_index(stage: Stage) -> int:
    return STAGE_ORDER.index(stage)


def days_in_stage(t: Turnover) -> int:
    return max(0, (today() - t.stage_entered_at).days)


def is_vacant(t: Turnover) -> bool:
    return t.status == "active" and t.current_stage in VACANT_STAGES


def days_vacant(t: Turnover) -> int:
    """Days the unit has been (or was) empty in this turnover."""
    if t.move_in_date:
        return max(0, (t.move_in_date - t.move_out_date).days)
    if is_vacant(t):
        return max(0, (today() - t.move_out_date).days)
    return 0


def health(t: Turnover) -> str:
    """ok / warn / late, based on time in the current stage vs its target."""
    if t.status != "active":
        return "ok"
    stage = t.current_stage
    elapsed = days_in_stage(t)
    if stage == Stage.PRE_MARKETING:
        # Being marketed before move-out is good; only worry if move-out is close
        # and nobody has applied yet.
        days_left = (t.move_out_date - today()).days
        approved = any(a.status == "approved" for a in t.applications)
        if approved:
            return "ok"
        return "late" if days_left < 3 else "warn" if days_left < 10 else "ok"
    target = STAGE_INFO[stage]["target_days"]
    if elapsed <= target:
        return "ok"
    if elapsed <= target + max(1, target // 2):
        return "warn"
    return "late"
