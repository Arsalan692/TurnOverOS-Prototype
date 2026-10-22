"""AI endpoint tests with Gemini mocked out (no network, no cost)."""

import pytest

from app.ai import applications as ai_apps
from app.ai import reply_bot
from app.ai.client import AIUnavailable


def active_turnover(client, stage="showings"):
    board = client.get("/api/board").json()
    return next(c for col in board["columns"] if col["key"] == stage for c in col["cards"])


def extracted(**kw):
    base = dict(applicant_name="Test Person", email="t@example.com", phone="(403) 555-0000",
                current_address=None, current_landlord=None, years_at_current_address=None,
                employer="Acme", job_title=None, employment_length_years=None,
                income_amount=60000, income_period="year", hours_per_week=None, occupants=1,
                pets="none", desired_move_in="2026-12-01", references=[], signed=True,
                missing_fields=[], handwriting_or_scan_quality="typed")
    return ai_apps.ExtractedApplication(**{**base, **kw})


@pytest.mark.parametrize("amount,period,hours,expected", [
    (78000, "year", None, 6500), (27, "hour", 40, 4680), (2100, "biweekly", None, 4550),
    (900, "week", None, 3900), (27, "hour", None, None), (None, None, None, None),
])
def test_monthly_income_is_computed_in_code(amount, period, hours, expected):
    x = extracted(income_amount=amount, income_period=period, hours_per_week=hours)
    assert ai_apps.monthly_income(x) == expected


def test_listing_falls_back_to_template_when_ai_down(client, monkeypatch):
    def down(*a, **k):
        raise AIUnavailable("AI is busy")
    monkeypatch.setattr("app.ai.listing.generate", down)
    card = active_turnover(client)
    d = client.post(f"/api/turnovers/{card['id']}/ai/listing", json={"tone": "warm"}).json()
    assert d["ai"] is False and d["title"] and "busy" in d["error"]


def test_apply_listing_updates_live_channels(client):
    card = active_turnover(client)
    d = client.post(f"/api/turnovers/{card['id']}/listings/apply", json={
        "title": "Bright 2 bed in Kensington", "description": "A" * 40,
        "facebook_post": "FB version of the ad", "ai_generated": True}).json()
    live = [li for li in d["listings"] if li["status"] == "live"]
    assert live and all(li["title"] == "Bright 2 bed in Kensington" and li["ai_generated"] for li in live)
    fb = next(li for li in live if li["channel"] == "facebook")
    assert fb["description"] == "FB version of the ad"


def test_sample_application_creates_scored_application(client, monkeypatch):
    result = ai_apps.Screening(extracted=extracted(), summary="Looks complete.",
                               strengths=["Stable job"], follow_ups=["Call employer"])
    monkeypatch.setattr("app.ai_routes.ai_apps.read_application", lambda *a, **k: (result, "fake-model"))
    card = active_turnover(client, "screening")
    r = client.post(f"/api/turnovers/{card['id']}/applications/sample/application-typed.pdf")
    assert r.status_code == 200
    app = next(a for a in r.json()["turnover"]["applications"] if a["id"] == r.json()["application_id"])
    assert app["monthly_income"] == 5000 and app["income_to_rent"] is not None
    assert app["ai_summary"] == "Looks complete." and app["status"] == "submitted"


def test_upload_rejects_wrong_type_and_bad_sample_names(client):
    card = active_turnover(client)
    r = client.post(f"/api/turnovers/{card['id']}/applications/upload",
                    files={"file": ("notes.txt", b"hello", "text/plain")})
    assert r.status_code == 415
    assert client.post(f"/api/turnovers/{card['id']}/applications/sample/..%2F..%2Fbackend%2F.env").status_code == 404


def test_reply_bot_returns_503_when_ai_down(client, monkeypatch):
    def down(*a, **k):
        raise AIUnavailable("AI is busy")
    monkeypatch.setattr("app.ai_routes.reply_bot.reply", down)
    card = active_turnover(client)
    r = client.post(f"/api/turnovers/{card['id']}/ai/reply", json={"message": "Still available?"})
    assert r.status_code == 503


def test_reply_bot_passes_reply_through(client, monkeypatch):
    fake = reply_bot.BotReply(reply="Yes, still available.", intent="question",
                              suggested_slots=[], needs_human=False)
    monkeypatch.setattr("app.ai_routes.reply_bot.reply", lambda *a, **k: (fake, "fake-model"))
    card = active_turnover(client)
    d = client.post(f"/api/turnovers/{card['id']}/ai/reply",
                    json={"message": "Still available?", "history": []}).json()
    assert d["reply"] == "Yes, still available." and d["model"] == "fake-model"


def test_showing_slots_are_future_and_four():
    from types import SimpleNamespace
    from app.services.common import today
    t = SimpleNamespace(move_out_date=today())
    slots = reply_bot.showing_slots(t)
    assert len(slots) == 4


def test_ai_endpoints_are_rate_limited(client, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "ai_calls_per_hour", 2)
    fake = reply_bot.BotReply(reply="ok", intent="question", suggested_slots=[], needs_human=False)
    monkeypatch.setattr("app.ai_routes.reply_bot.reply", lambda *a, **k: (fake, "fake"))
    card = active_turnover(client)
    codes = [client.post(f"/api/turnovers/{card['id']}/ai/reply", json={"message": "hi"}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]
