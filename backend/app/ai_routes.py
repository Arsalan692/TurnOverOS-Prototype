"""AI endpoints (Gemini): listing writer, application reader, renter reply bot."""

import mimetypes
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .ai import applications as ai_apps
from .ai import listing as ai_listing
from .ai import reply_bot
from .ai.client import AIUnavailable
from .config import settings
from .db import get_db
from .models import Application
from .routers import get_turnover
from .serializers import turnover_detail
from .services.common import today
from .services.workflow import post_listings

router = APIRouter(prefix="/api", tags=["ai"])

SAMPLES = Path(__file__).resolve().parents[2] / "frontend" / "public" / "samples"
ALLOWED = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
MAX_BYTES = 10 * 1024 * 1024


def _active(db: Session, turnover_id: int):
    t = get_turnover(db, turnover_id)
    if t.status != "active":
        raise HTTPException(409, "This turnover is already finished.")
    return t


@router.get("/ai/status")
def ai_status():
    return {"configured": bool(settings.gemini_api_key),
            "models": [m.strip() for m in settings.gemini_models.split(",")]}


# ---------------------------------------------------------------- listing writer

class ListingRequest(BaseModel):
    tone: str = Field("warm", max_length=40)


@router.post("/turnovers/{turnover_id}/ai/listing")
def ai_listing_draft(turnover_id: int, body: ListingRequest, db: Session = Depends(get_db)):
    """Draft a Rentfaster ad and Facebook post from the unit facts and photos."""
    t = _active(db, turnover_id)
    try:
        return ai_listing.write_listing(t, body.tone)
    except AIUnavailable as e:
        return {**ai_listing.fallback_listing(t), "error": str(e)}


class ApplyListing(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    description: str = Field(min_length=20, max_length=4000)
    facebook_post: str = Field(min_length=10, max_length=2000)
    ai_generated: bool = True


@router.post("/turnovers/{turnover_id}/listings/apply")
def apply_listing(turnover_id: int, body: ApplyListing, db: Session = Depends(get_db)):
    """Publish the (edited) draft to the live Rentfaster and Facebook listings."""
    t = _active(db, turnover_id)
    if not any(li.status == "live" for li in t.listings):
        post_listings(db, t, today(), max(today(), t.move_out_date))
        db.flush()
        db.refresh(t)
    for li in t.listings:
        if li.status != "live":
            continue
        li.title = body.title
        li.description = body.description if li.channel != "facebook" else body.facebook_post
        li.ai_generated = body.ai_generated
    db.commit()
    return turnover_detail(get_turnover(db, turnover_id))


# ---------------------------------------------------------------- application reader

def _to_date(s: str | None) -> date | None:
    try:
        return date.fromisoformat(s) if s else None
    except ValueError:
        return None


def _screen(db: Session, turnover_id: int, data: bytes, mime: str, source: str):
    t = _active(db, turnover_id)
    try:
        result, model = ai_apps.read_application(t, data, mime)
    except AIUnavailable as e:
        raise HTTPException(503, str(e))
    x = result.extracted
    if not x.applicant_name:
        raise HTTPException(422, "Could not find an applicant name. Is this a rental application?")
    pets = (x.pets or "").strip().lower()
    app = Application(
        turnover_id=t.id, applicant_name=x.applicant_name,
        email=x.email or "", phone=x.phone or "", employer=x.employer,
        monthly_income=ai_apps.monthly_income(x), household_size=x.occupants,
        has_pets=None if not pets else pets not in ("none", "no", "n/a", "0"),
        desired_move_in=_to_date(x.desired_move_in), submitted_at=today(), status="submitted",
        ai_extracted={**x.model_dump(), "monthly_income": ai_apps.monthly_income(x), "strengths": result.strengths,
                      "follow_ups": result.follow_ups, "model": model, "source": source},
        ai_summary=result.summary,
    )
    db.add(app)
    db.commit()
    return {"application_id": app.id, "turnover": turnover_detail(get_turnover(db, turnover_id))}


@router.post("/turnovers/{turnover_id}/applications/upload")
async def upload_application(turnover_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a rental application (PDF, photo or scan); Gemini reads it."""
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if mime not in ALLOWED:
        raise HTTPException(415, "Upload a PDF, JPG, PNG or WebP file.")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 10 MB.")
    return _screen(db, turnover_id, data, mime, file.filename or "upload")


@router.get("/samples")
def list_samples():
    return sorted(p.name for p in SAMPLES.glob("*") if p.suffix in (".pdf", ".jpg", ".png"))


@router.post("/turnovers/{turnover_id}/applications/sample/{name}")
def sample_application(turnover_id: int, name: str, db: Session = Depends(get_db)):
    """Run the reader on one of the bundled sample applications."""
    path = (SAMPLES / name).resolve()
    if path.parent != SAMPLES.resolve() or not path.exists():
        raise HTTPException(404, "Sample not found.")
    mime = mimetypes.guess_type(path.name)[0] or "application/pdf"
    return _screen(db, turnover_id, path.read_bytes(), mime, f"sample:{name}")


# ---------------------------------------------------------------- reply bot

class ReplyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[reply_bot.ChatTurn] = Field(default_factory=list, max_length=20)


@router.post("/turnovers/{turnover_id}/ai/reply")
def ai_reply(turnover_id: int, body: ReplyRequest, db: Session = Depends(get_db)):
    """Instant answer to a renter's message about this listing."""
    t = _active(db, turnover_id)
    try:
        r, model = reply_bot.reply(t, body.message, body.history)
    except AIUnavailable as e:
        raise HTTPException(503, str(e))
    return {**r.model_dump(), "model": model}
