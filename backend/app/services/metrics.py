"""Vacancy dashboard numbers. Everything is computed from the database."""

from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..stages import STAGE_INFO, STAGE_ORDER, VACANT_STAGES
from .common import today

# Completed turnovers, optionally filtered by city. Days vacant = move-out -> move-in.
BASE = """
    FROM turnovers t
    JOIN units u ON u.id = t.unit_id
    JOIN properties p ON p.id = u.property_id
    WHERE t.status = 'completed' AND (CAST(:city AS text) IS NULL OR p.city = :city)
"""
DAYS = "(t.move_in_date - t.move_out_date)"
DAILY = "(t.final_rent * 12.0 / 365)"


def _one(db, sql, **p):
    return db.execute(text(sql), p).mappings().first()


def _all(db, sql, **p):
    return [dict(r) for r in db.execute(text(sql), p).mappings().all()]


def dashboard(db: Session, city: str | None = None) -> dict:
    d0 = today()
    p = {"city": city, "d0": d0, "d90": d0 - timedelta(days=90),
         "d180": d0 - timedelta(days=180), "d365": d0 - timedelta(days=365)}

    k = _one(db, f"""
        SELECT
          avg({DAYS}) FILTER (WHERE t.move_in_date >= :d90)                          AS avg_90,
          avg({DAYS}) FILTER (WHERE t.move_in_date >= :d180 AND t.move_in_date < :d90) AS avg_prev_90,
          avg({DAYS}) FILTER (WHERE t.move_in_date >= :d365)                          AS avg_12m,
          count(*)    FILTER (WHERE t.move_in_date >= :d365)                          AS turnovers_12m,
          sum({DAYS} * {DAILY}) FILTER (WHERE t.move_in_date >= :d365)                AS cost_12m,
          avg(t.final_rent) FILTER (WHERE t.move_in_date >= :d365)                    AS avg_rent
        {BASE}""", **p)

    vacant_now = _one(db, """
        SELECT count(*) AS units,
               coalesce(sum(coalesce(t.asking_rent, u.market_rent) * 12.0 / 365), 0) AS daily_cost,
               coalesce(avg(:d0 - t.move_out_date), 0) AS avg_days_so_far
        FROM turnovers t JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id
        WHERE t.status = 'active' AND t.current_stage = ANY(CAST(:stages AS stage[]))
          AND (CAST(:city AS text) IS NULL OR p.city = :city)
    """, stages=[s.value for s in VACANT_STAGES], **p)

    totals = _one(db, """
        SELECT count(*) AS units,
               count(*) FILTER (WHERE u.status = 'occupied') AS occupied
        FROM units u JOIN properties p ON p.id = u.property_id
        WHERE CAST(:city AS text) IS NULL OR p.city = :city
    """, **p)

    # Where the vacant days go: average days per stage, spread over ALL turnovers,
    # so the bars add up to the average days vacant.
    stage_rows = _all(db, f"""
        SELECT se.stage::text AS stage, sum(se.exited_at - se.entered_at)::float / NULLIF(
                 (SELECT count(*) {BASE} AND t.move_in_date >= :d365), 0) AS avg_days
        {BASE.replace('FROM turnovers t', 'FROM stage_events se JOIN turnovers t ON t.id = se.turnover_id')}
          AND t.move_in_date >= :d365 AND se.exited_at IS NOT NULL
        GROUP BY se.stage
    """, **p)
    per_stage = {r["stage"]: r["avg_days"] or 0 for r in stage_rows}
    stage_breakdown = [
        {"stage": s.value, "label": STAGE_INFO[s]["label"],
         "avg_days": round(per_stage.get(s.value, 0), 1),
         "target_days": STAGE_INFO[s]["target_days"]}
        for s in STAGE_ORDER if s in VACANT_STAGES
    ]

    trend = _all(db, f"""
        SELECT to_char(date_trunc('month', t.move_in_date), 'YYYY-MM') AS month,
               round(avg({DAYS}), 1)::float AS avg_days_vacant,
               count(*) AS turnovers,
               round(sum({DAYS} * {DAILY}))::int AS vacancy_cost
        {BASE} AND t.move_in_date >= :d365
        GROUP BY 1 ORDER BY 1
    """, **p)

    by_city = _all(db, f"""
        SELECT p.city, round(avg({DAYS}), 1)::float AS avg_days_vacant, count(*) AS turnovers,
               round(sum({DAYS} * {DAILY}))::int AS vacancy_cost
        {BASE} AND t.move_in_date >= :d365 GROUP BY 1 ORDER BY 1
    """, **p)

    pre = _all(db, f"""
        SELECT t.pre_marketed, round(avg({DAYS}), 1)::float AS avg_days_vacant, count(*) AS turnovers
        {BASE} AND t.move_in_date >= :d365 GROUP BY 1
    """, **p)
    pre_map = {r["pre_marketed"]: r for r in pre}

    pricing = _all(db, f"""
        SELECT (t.asking_rent > u.market_rent * 1.03) AS overpriced,
               round(avg({DAYS}), 1)::float AS avg_days_vacant, count(*) AS turnovers
        {BASE} AND t.move_in_date >= :d365 AND NOT t.pre_marketed GROUP BY 1
    """, **p)
    price_map = {r["overpriced"]: r for r in pricing}

    leads = _one(db, """
        SELECT percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY extract(epoch FROM (l.responded_at - l.received_at)) / 3600) AS median_hours,
               avg((l.responded_at IS NULL)::int)::float AS unanswered_share,
               count(*) AS total
        FROM leads l JOIN listings li ON li.id = l.listing_id
        JOIN turnovers t ON t.id = li.turnover_id JOIN units u ON u.id = t.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE l.received_at >= :d90 AND (CAST(:city AS text) IS NULL OR p.city = :city)
    """, **p)

    f = lambda x, n=1: round(float(x), n) if x is not None else None  # noqa: E731
    avg_rent = float(k["avg_rent"] or 0)
    return {
        "city": city or "All",
        "kpis": {
            "avg_days_vacant_90d": f(k["avg_90"]),
            "avg_days_vacant_prev_90d": f(k["avg_prev_90"]),
            "avg_days_vacant_12m": f(k["avg_12m"]),
            "turnovers_12m": k["turnovers_12m"],
            "vacancy_cost_12m": round(float(k["cost_12m"] or 0)),
            "avg_rent": round(avg_rent),
            "avg_daily_rent": f(avg_rent * 12 / 365, 2),
            "vacant_now": vacant_now["units"],
            "vacant_now_daily_cost": round(float(vacant_now["daily_cost"])),
            "vacant_now_avg_days": f(vacant_now["avg_days_so_far"]),
            "total_units": totals["units"],
            "occupancy_rate": f(100 * totals["occupied"] / totals["units"]) if totals["units"] else None,
        },
        "stage_breakdown": stage_breakdown,
        "monthly_trend": trend,
        "by_city": by_city,
        "pre_marketing": {
            "with": pre_map.get(True), "without": pre_map.get(False),
        },
        "pricing": {"overpriced": price_map.get(True), "fair": price_map.get(False)},
        "lead_response": {
            "median_hours": f(leads["median_hours"]),
            "unanswered_pct": f(100 * (leads["unanswered_share"] or 0)),
            "leads_90d": leads["total"],
        },
    }
