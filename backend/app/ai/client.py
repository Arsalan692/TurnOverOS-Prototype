"""Gemini wrapper: one place for retries, model fallback and structured output.

- Uses the Windows/macOS certificate store (truststore) so it works behind
  antivirus HTTPS scanning (e.g. Avast) and corporate proxies.
- Tries each model in GEMINI_MODELS; retries dropped connections and
  "busy" errors, then falls back to the next model.
- Always asks for JSON matching a Pydantic schema, so results are typed.
"""

import logging
import ssl
import time
from functools import lru_cache
from typing import TypeVar

import httpx
import truststore
from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from ..config import settings

log = logging.getLogger("turnoveros.ai")
# Unstable networks can reset TLS handshakes to Google; those fail fast, so retry a few times.
CONNECT_RETRIES = 4
T = TypeVar("T", bound=BaseModel)


class AIUnavailable(Exception):
    """Every model failed (no key, network down, or all models busy)."""


@lru_cache
def _client() -> genai.Client:
    if not settings.gemini_api_key:
        raise AIUnavailable("Gemini API key is not set.")
    ctx = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    return genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(client_args={"verify": ctx}, timeout=60_000),
    )


def _models() -> list[str]:
    return [m.strip() for m in settings.gemini_models.split(",") if m.strip()]


def _thinking(model: str) -> types.ThinkingConfig:
    # Keep answers fast: these are short, well-defined tasks.
    if model.startswith("gemini-2.5"):
        return types.ThinkingConfig(thinking_budget=0)
    return types.ThinkingConfig(thinking_level="low")


def image_part(data: bytes, mime: str) -> types.Part:
    return types.Part.from_bytes(data=data, mime_type=mime)


def generate(schema: type[T], prompt: str, *, system: str, parts: list | None = None,
             temperature: float = 0.4) -> tuple[T, str]:
    """Run one structured Gemini call. Returns (parsed result, model used)."""
    client = _client()
    contents = [*(parts or []), prompt]
    last_error: Exception | None = None

    for model in _models():
        for attempt in range(CONNECT_RETRIES):
            try:
                resp = client.models.generate_content(
                    model=model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system,
                        response_mime_type="application/json",
                        response_schema=schema,
                        temperature=temperature,
                        thinking_config=_thinking(model),
                    ),
                )
                parsed = resp.parsed
                if parsed is None:
                    parsed = schema.model_validate_json(resp.text or "{}")
                return parsed, model
            except errors.APIError as e:
                last_error = e
                log.warning("Gemini %s failed (%s): %s", model, e.code, str(e)[:200])
                # Busy/overloaded or bad request: move straight to the next model.
                # Only flaky connections are worth retrying on the same model.
                break
            except (httpx.TransportError, ssl.SSLError) as e:
                last_error = e  # dropped connection: retry
                log.warning("Gemini %s connection error: %s", model, e)
            except ValueError as e:
                last_error = e  # unparseable output: try again
                log.warning("Gemini %s returned invalid JSON: %s", model, e)
            time.sleep(0.6 * (attempt + 1))

    raise AIUnavailable(f"AI is busy or unreachable right now. ({type(last_error).__name__})")
