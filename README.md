# TurnoverOS

A prototype that cuts **days vacant between tenants** for a property manager
running ~800 rental units in Calgary and Edmonton.

It tracks every unit from *"tenant gave notice"* to *"new tenant moved in"*,
shows where days are lost, and automates the slow steps.

> Prototype with fake demo data. Work in progress — see [PLAN.md](PLAN.md).

## Stack
FastAPI · PostgreSQL · SQLAlchemy/Alembic · React + TypeScript + Tailwind · Gemini API

## Run locally
```bash
docker compose up -d                      # PostgreSQL on port 5433

cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
cp .env.example .env
.venv/Scripts/alembic upgrade head        # create tables
.venv/Scripts/python -m app.seed          # 800 fake units + 12 months history
.venv/Scripts/uvicorn app.main:app --reload --port 8000

cd ../frontend
npm install && npm run dev                # http://localhost:5173
```
