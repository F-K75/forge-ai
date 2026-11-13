"""Tests for onboarding email templates (services/email_templates.py)."""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")

import pytest

from core.config import get_settings
from services.email_templates import (
    ONBOARDING_TEMPLATES,
    render_first_build_done,
    render_welcome,
)


@pytest.mark.parametrize("key", sorted(ONBOARDING_TEMPLATES))
def test_every_template_has_subject_html_text_and_app_link(key):
    content = ONBOARDING_TEMPLATES[key](name="Ada Lovelace")
    app_url = get_settings().app_url.rstrip("/")
    assert content.subject
    assert content.html.startswith("<!DOCTYPE html>")
    assert "Hi Ada," in content.html and content.text.startswith("Hi Ada,")
    assert app_url in content.html and app_url in content.text
    assert set(content.as_resend_params()) == {"subject", "html", "text"}


def test_user_values_are_html_escaped():
    content = render_first_build_done(
        name="<script>x</script>", project_name="<img src=x onerror=alert(1)>", project_id="p1"
    )
    assert "<script>" not in content.html
    assert "<img src=x" not in content.html
    assert "/p/p1/workspace" in content.html


def test_welcome_defaults_to_free_credits_and_handles_missing_name():
    content = render_welcome()
    assert content.text.startswith("Hi there,")
    assert f"{get_settings().free_credits} credits" in content.text


def test_unsubscribe_link_only_when_given():
    assert "Unsubscribe" not in render_welcome().html
    content = render_welcome(unsubscribe_url="https://example.com/u?t=1&x=2")
    assert 'href="https://example.com/u?t=1&amp;x=2"' in content.html
    assert "Unsubscribe: https://example.com/u?t=1&x=2" in content.text
