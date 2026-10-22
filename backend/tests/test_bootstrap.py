from app import bootstrap


def test_first_call_always_checks_even_on_a_fresh_machine(monkeypatch):
    """Regression: on serverless, time.monotonic() can be tiny right after boot."""
    calls = []
    monkeypatch.setattr(bootstrap.settings, "auto_seed", True)
    monkeypatch.setattr(bootstrap, "_last_check", None)
    monkeypatch.setattr(bootstrap.time, "monotonic", lambda: 5.0)  # machine booted 5s ago
    monkeypatch.setattr("app.startup.needs_seed", lambda: calls.append("checked") or False)
    bootstrap.ensure_ready()
    assert calls == ["checked"]
    bootstrap.ensure_ready()  # within the hour: skipped
    assert calls == ["checked"]
