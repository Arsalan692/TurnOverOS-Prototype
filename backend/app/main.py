import truststore
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .ai_routes import router as ai_router
from .config import settings
from .db import engine
from .routers import router

# Trust the OS certificate store (works behind antivirus HTTPS scanning / proxies)
truststore.inject_into_ssl()

app = FastAPI(title="TurnoverOS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(router)
app.include_router(ai_router)


@app.get("/api/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
