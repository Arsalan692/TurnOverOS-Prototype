"""Make sure the database has tables and today's demo data.

Runs on the first API request of each server process (and again at most once
an hour), because serverless hosting has no "on start" command. A Postgres
advisory lock stops two cold starts from seeding at the same time.
"""

import time

from sqlalchemy import text

from .config import settings
from .db import Base, engine

LOCK_ID = 7_310_042
RECHECK_SECONDS = 3600
_last_check = 0.0


def ensure_ready(force: bool = False) -> None:
    global _last_check
    if not settings.auto_seed:
        return
    if not force and time.monotonic() - _last_check < RECHECK_SECONDS:
        return
    from . import models  # noqa: F401  (register tables)
    from .startup import needs_seed

    with engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(:id)"), {"id": LOCK_ID})
        try:
            Base.metadata.create_all(engine)  # no-op when tables exist
            if needs_seed():
                from . import seed
                seed.seed()
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": LOCK_ID})
            conn.commit()
    _last_check = time.monotonic()
