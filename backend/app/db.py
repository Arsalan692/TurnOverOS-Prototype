import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings

# Serverless (Vercel): every invocation may be a new process, so don't keep a pool;
# Neon's pooler handles that. prepare_threshold=None keeps psycopg compatible with it.
SERVERLESS = bool(os.environ.get("VERCEL"))

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"prepare_threshold": None},
    **({"poolclass": NullPool} if SERVERLESS else {}),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
