"""Regression test for BE-008: no request/correlation ID existed anywhere --
there was no way to tie a single request's log lines together, or match a
client-reported error back to the exact server-side request that caused it.
Found 2026-07-03.

Fixed by adding request_id_middleware (sets a contextvar for the duration
of the request, echoes it back as X-Request-ID) and RequestIdLogFilter
(injects that contextvar into every LogRecord passing through the root
logger's handlers, not just ones logged directly through it).
"""

import logging

import pytest

from core.security import (
    request_id_middleware,
    request_id_var,
    RequestIdLogFilter,
)


class _FakeRequest:
    def __init__(self, headers=None):
        self.headers = headers or {}


class _FakeResponse:
    def __init__(self):
        self.headers = {}


@pytest.mark.asyncio
async def test_generates_a_request_id_when_none_provided():
    captured = {}

    async def call_next(request):
        captured["id_during_request"] = request_id_var.get()
        return _FakeResponse()

    response = await request_id_middleware(_FakeRequest(), call_next)

    assert "X-Request-ID" in response.headers
    assert response.headers["X-Request-ID"] == captured["id_during_request"]
    assert response.headers["X-Request-ID"] != "-"


@pytest.mark.asyncio
async def test_reuses_an_incoming_request_id_for_cross_service_correlation():
    async def call_next(request):
        return _FakeResponse()

    response = await request_id_middleware(
        _FakeRequest(headers={"X-Request-ID": "upstream-abc123"}), call_next
    )

    assert response.headers["X-Request-ID"] == "upstream-abc123"


@pytest.mark.asyncio
async def test_contextvar_resets_after_request_completes():
    async def call_next(request):
        return _FakeResponse()

    assert request_id_var.get() == "-"
    await request_id_middleware(_FakeRequest(), call_next)
    assert request_id_var.get() == "-"


def test_log_filter_injects_current_request_id_into_records():
    record = logging.LogRecord(
        name="test", level=logging.INFO, pathname=__file__, lineno=1,
        msg="hello", args=(), exc_info=None,
    )
    token = request_id_var.set("req-xyz")
    try:
        RequestIdLogFilter().filter(record)
    finally:
        request_id_var.reset(token)

    assert record.request_id == "req-xyz"


def test_log_filter_falls_back_to_dash_outside_a_request():
    record = logging.LogRecord(
        name="test", level=logging.INFO, pathname=__file__, lineno=1,
        msg="hello", args=(), exc_info=None,
    )
    RequestIdLogFilter().filter(record)
    assert record.request_id == "-"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
