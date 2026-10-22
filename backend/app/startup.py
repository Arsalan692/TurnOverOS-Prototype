"""Run at server start (see render.yaml):

    python -m app.startup

Re-seeds the demo data when the database is empty or was seeded on an earlier
day. All demo dates are relative to "today", so a daily refresh keeps the
board, dashboard and late/at-risk cards realistic.
"""

from sqlalchemy import select

from .db import SessionLocal
from .models import AppMeta
from .services.common import today


def needs_seed() -> bool:
    with SessionLocal() as db:
        row = db.scalar(select(AppMeta).where(AppMeta.key == "seeded_on"))
        return row is None or row.value != today().isoformat()


if __name__ == "__main__":
    if needs_seed():
        print("Demo data missing or stale: seeding...")
        from . import seed
        seed.seed()
    else:
        print("Demo data is current.")
