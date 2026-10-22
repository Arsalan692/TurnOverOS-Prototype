"""Smart Price Suggestion.

Looks at similar units that leased recently and at how many enquiries this
listing is getting compared with normal. If the unit is priced above similar
units AND enquiries are slow, it suggests a lower rent and estimates how many
vacant days that saves.
"""

from statistics import median

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..models import Turnover, Unit
from .common import daily_rent, round25, today

LOOKBACK_DAYS = 180
OVERPRICED = 1.03  # more than 3% above similar units


def comparables(db: Session, unit: Unit) -> dict:
    """Recently leased units like this one (same city + bedrooms,
    same neighbourhood when there are enough)."""
    base = """
        SELECT t.final_rent, u.market_rent, (t.move_in_date - t.move_out_date) AS days_vacant
        FROM turnovers t
        JOIN units u ON u.id = t.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE t.status = 'completed' AND t.final_rent IS NOT NULL
          AND t.move_in_date >= :since
          AND p.city = :city AND u.bedrooms = :beds AND u.id <> :uid
    """
    params = {"since": today().fromordinal(today().toordinal() - LOOKBACK_DAYS),
              "city": unit.property.city, "beds": unit.bedrooms, "uid": unit.id}
    rows = db.execute(text(base + " AND p.neighbourhood = :hood"),
                      {**params, "hood": unit.property.neighbourhood}).all()
    scope = f"{unit.bedrooms}-bed units in {unit.property.neighbourhood}"
    if len(rows) < 4:
        rows = db.execute(text(base), params).all()
        scope = f"{unit.bedrooms}-bed units in {unit.property.city}"
    if not rows:
        return {"count": 0, "scope": scope}
    # How leased rents compare with each unit's market value -> apply to this unit
    ratio = median(r.final_rent / r.market_rent for r in rows)
    return {
        "count": len(rows),
        "scope": scope,
        "median_rent": round25(median(r.final_rent for r in rows)),
        "leased_vs_market": round(ratio, 3),
        "avg_days_vacant": round(sum(r.days_vacant for r in rows) / len(rows), 1),
        "recommended_rent": round25(unit.market_rent * ratio),
    }


def typical_leads_per_day(db: Session, city: str, beds: int) -> float:
    """Average enquiries per listing per day for finished turnovers."""
    row = db.execute(text("""
        SELECT sum(x.leads)::float / NULLIF(sum(x.days), 0) AS per_day
        FROM (
            -- listing is open until the lease is signed
            SELECT GREATEST(1, COALESCE(
                       (SELECT se.entered_at FROM stage_events se
                        WHERE se.turnover_id = t.id AND se.stage = 'lease_signed'),
                       t.move_in_date) - li.posted_at) AS days,
                   (SELECT count(*) FROM leads l WHERE l.listing_id = li.id) AS leads
            FROM listings li
            JOIN turnovers t ON t.id = li.turnover_id
            JOIN units u ON u.id = t.unit_id
            JOIN properties p ON p.id = u.property_id
            WHERE t.status = 'completed' AND p.city = :city AND u.bedrooms = :beds
        ) AS x
    """), {"today": today(), "city": city, "beds": beds}).first()
    return float(row.per_day or 0.5) if row else 0.5


def overpricing_effect(db: Session, city: str) -> float:
    """Extra vacant days, on average, for units listed >3% above market."""
    row = db.execute(text("""
        SELECT
          avg(t.move_in_date - t.move_out_date) FILTER (WHERE t.asking_rent > u.market_rent * :hi) AS over,
          avg(t.move_in_date - t.move_out_date) FILTER (WHERE t.asking_rent <= u.market_rent * :hi) AS fair
        FROM turnovers t JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id
        WHERE t.status = 'completed' AND p.city = :city AND NOT t.pre_marketed
    """), {"hi": OVERPRICED, "city": city}).first()
    if not row or row.over is None or row.fair is None:
        return 0.0
    return max(0.0, float(row.over) - float(row.fair))


def suggest_price(db: Session, t: Turnover) -> dict:
    unit = t.unit
    comps = comparables(db, unit)
    asking = t.asking_rent or unit.market_rent
    recommended = comps.get("recommended_rent", unit.market_rent)

    live = [li for li in t.listings if li.status == "live"]
    days_listed = max((today() - min(li.posted_at for li in live)).days, 0) if live else 0
    leads = sum(len(li.leads) for li in live)
    per_day = leads / max(days_listed, 1) / max(len(live), 1) if live else 0.0
    typical = typical_leads_per_day(db, unit.property.city, unit.bedrooms)
    extra_days = overpricing_effect(db, unit.property.city)

    over = asking > recommended * OVERPRICED
    slow = bool(live) and days_listed >= 5 and per_day < typical * 0.7
    pace = f"{per_day:.2f}/day vs {typical:.2f} normal"

    if slow and asking > recommended:
        action = "lower"
        message = (f"Asking ${asking} is {round((asking / recommended - 1) * 100, 1)}% above similar units "
                   f"and enquiries are slow ({pace}) after {days_listed} days. Lower to ${recommended}.")
    elif slow:
        action = "refresh_listing"
        message = (f"Price matches similar units but enquiries are slow ({pace}). "
                   "Refresh the listing: new photos, better description, post again.")
    elif over:
        action = "watch"
        message = (f"Asking ${asking} is above similar units (${recommended}). "
                   "Fine for now, but lower it if enquiries stay slow after 5 days.")
    elif live and days_listed >= 3 and per_day > typical * 1.5 and asking < recommended * 0.98:
        action = "raise"
        message = f"Strong demand ({per_day:.1f} enquiries/day). There is room to ask ${recommended}."
    else:
        action = "hold"
        message = "Price is in line with similar units."

    days_saved = round(extra_days, 1) if action == "lower" else 0.0
    # Lowering rent costs a little every month; empty days cost a lot at once.
    yearly_cost_of_drop = max(0, asking - recommended) * 12 if action == "lower" else 0
    vacancy_saved = round(days_saved * daily_rent(recommended))

    return {
        "action": action,
        "message": message,
        "asking_rent": asking,
        "recommended_rent": recommended,
        "market_rent": unit.market_rent,
        "comparables": comps,
        "listing": {"days_listed": days_listed, "leads": leads,
                    "leads_per_day": round(per_day, 2), "typical_leads_per_day": round(typical, 2)},
        "estimated_days_saved": days_saved,
        "estimated_vacancy_cost_saved": vacancy_saved,
        "yearly_rent_given_up": yearly_cost_of_drop,
    }
