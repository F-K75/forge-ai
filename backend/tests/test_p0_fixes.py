import pytest
from fastapi.testclient import TestClient


# Minimal smoke tests for P0 fixes.
# WebSocket and DB-level atomicity are covered by integration tests in a real
# test harness; here we validate key call patterns.


def test_credit_reservation_code_present():
    from pathlib import Path

    p = Path(__file__).resolve().parents[1] / "api" / "builds.py"
    s = p.read_text(encoding="utf-8")
    assert "find_one_and_update" in s
    assert "\"credits\": {\"$gte\"" in s

    assert "refund" in s or "Insufficient credits" in s



def test_ws_ownership_checks_present():
    from pathlib import Path

    p = Path(__file__).resolve().parents[1] / "services" / "ws_manager.py"
    s = p.read_text(encoding="utf-8")
    assert "Foreign build" in s

    pb = Path(__file__).resolve().parents[1] / "api" / "builds.py"
    sb = pb.read_text(encoding="utf-8")
    assert "authenticate_websocket(websocket, build_id=build_id)" in sb


def test_ws_manager_accept_is_separate():
    from pathlib import Path

    p = Path(__file__).resolve().parents[1] / "services" / "ws_manager.py"
    s = p.read_text(encoding="utf-8")

    # Ensure there is an explicit accept() and connect() no longer calls accept().
    connect_section = s.split("async def connect", 1)[1].split("async def accept", 1)[0]
    assert "await websocket.accept" not in connect_section


