"""Tiny in-memory rate limit for the public demo's AI endpoints.

One server process, so memory is enough. Keyed by the visitor's IP
(first address in X-Forwarded-For when behind Render's proxy).
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from .config import settings

WINDOW = 3600  # seconds
_calls: dict[str, deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def limit_ai(request: Request) -> None:
    """FastAPI dependency: allow N AI calls per visitor per hour."""
    now = time.monotonic()
    q = _calls[client_ip(request)]
    while q and now - q[0] > WINDOW:
        q.popleft()
    if len(q) >= settings.ai_calls_per_hour:
        wait = int(WINDOW - (now - q[0])) // 60 + 1
        raise HTTPException(429, f"Demo AI limit reached. Please try again in about {wait} minutes.")
    q.append(now)


def reset() -> None:
    _calls.clear()
