"""Security tests for the /metrics scrape endpoint (M5: token auth)."""

import os

os.environ.setdefault("CI_TEST_MODE", "true")
os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "0101010101010101010101010101010101010101010101010101010101010101")

import pytest
from fastapi.testclient import TestClient

import main as main_module


@pytest.fixture
def client():
    return TestClient(main_module.app)


def test_metrics_disabled_when_no_token_configured(client, monkeypatch):
    monkeypatch.setattr(main_module.settings, "metrics_token", "")
    resp = client.get("/metrics")
    assert resp.status_code == 404


def test_metrics_requires_bearer_token(client, monkeypatch):
    monkeypatch.setattr(main_module.settings, "metrics_token", "scrape-secret")
    resp = client.get("/metrics")
    assert resp.status_code == 401
    resp = client.get("/metrics", headers={"Authorization": "Bearer wrong"})
    assert resp.status_code == 401


def test_metrics_accepts_correct_token(client, monkeypatch):
    monkeypatch.setattr(main_module.settings, "metrics_token", "scrape-secret")
    resp = client.get("/metrics", headers={"Authorization": "Bearer scrape-secret"})
    assert resp.status_code == 200