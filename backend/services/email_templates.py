"""Onboarding email templates for Resend.

Each ``render_*`` function returns an :class:`EmailContent` with a subject, an
HTML body and a plain-text body, ready to pass to ``resend.Emails.send``::

    content = render_welcome(name=user.name, credits=user.credits)
    resend.Emails.send({
        "from": settings.from_email,
        "to": [user.email],
        **content.as_resend_params(),
    })

The onboarding sequence:

1. ``welcome``           -- right after the user verifies their email.
2. ``first_build_nudge`` -- ~2 days later, only if they have not started a build.
3. ``first_build_done``  -- after their first successful build.
4. ``planning_tips``     -- ~5 days after signup, introduces Initiatives.

These are templates only: nothing here sends mail or schedules the sequence.
User-supplied values (names, project names) are HTML-escaped.
"""

from __future__ import annotations

from dataclasses import dataclass
from html import escape
from typing import Optional

from core.config import get_settings

BRAND = "Forge"


@dataclass(frozen=True)
class EmailContent:
    subject: str
    html: str
    text: str

    def as_resend_params(self) -> dict:
        return {"subject": self.subject, "html": self.html, "text": self.text}


def _app_url(path: str) -> str:
    return get_settings().app_url.rstrip("/") + path


def _greeting(name: Optional[str]) -> str:
    first = (name or "").strip().split(" ")[0]
    return f"Hi {first}," if first else "Hi there,"


def _layout(
    *,
    preheader: str,
    greeting: str,
    paragraphs: list[str],
    cta_label: str,
    cta_url: str,
    unsubscribe_url: Optional[str],
) -> str:
    """Wrap pre-escaped paragraph HTML in a simple, email-client-safe layout."""
    body = "".join(
        f'<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">{p}</p>'
        for p in paragraphs
    )
    footer = f"You're receiving this because you signed up for {BRAND}."
    if unsubscribe_url:
        footer += f' <a href="{escape(unsubscribe_url, quote=True)}" style="color:#6b7280;">Unsubscribe</a>'
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;">{escape(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
<tr><td>
<p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#111827;">{BRAND}</p>
<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">{escape(greeting)}</p>
{body}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:#111827;">
<a href="{escape(cta_url, quote=True)}" style="display:inline-block;padding:12px 20px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">{escape(cta_label)}</a>
</td></tr></table>
<p style="margin:0;font-size:14px;line-height:20px;color:#6b7280;">&mdash; The {BRAND} team</p>
</td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:18px;color:#9ca3af;">{footer}</p>
</td></tr>
</table>
</body>
</html>"""


def _text(
    greeting: str, paragraphs: list[str], cta_label: str, cta_url: str, unsubscribe_url: Optional[str]
) -> str:
    parts = [greeting, *paragraphs, f"{cta_label}: {cta_url}", f"-- The {BRAND} team"]
    footer = f"You're receiving this because you signed up for {BRAND}."
    if unsubscribe_url:
        footer += f" Unsubscribe: {unsubscribe_url}"
    parts.append(footer)
    return "\n\n".join(parts) + "\n"


def _build(
    *,
    subject: str,
    preheader: str,
    name: Optional[str],
    paragraphs_text: list[str],
    paragraphs_html: Optional[list[str]] = None,
    cta_label: str,
    cta_path: str,
    unsubscribe_url: Optional[str],
) -> EmailContent:
    greeting = _greeting(name)
    cta_url = _app_url(cta_path)
    html_paragraphs = paragraphs_html or [escape(p) for p in paragraphs_text]
    return EmailContent(
        subject=subject,
        html=_layout(
            preheader=preheader,
            greeting=greeting,
            paragraphs=html_paragraphs,
            cta_label=cta_label,
            cta_url=cta_url,
            unsubscribe_url=unsubscribe_url,
        ),
        text=_text(greeting, paragraphs_text, cta_label, cta_url, unsubscribe_url),
    )


def render_welcome(
    *, name: Optional[str] = None, credits: Optional[int] = None, unsubscribe_url: Optional[str] = None
) -> EmailContent:
    """Sent right after email verification."""
    credits = get_settings().free_credits if credits is None else credits
    return _build(
        subject=f"Welcome to {BRAND} - your AI engineering team is ready",
        preheader="Describe an app and watch a team of AI agents plan, design and build it.",
        name=name,
        paragraphs_text=[
            f"Welcome to {BRAND}. Your account is verified and you have {credits} credits to start with.",
            "Forge works like a small engineering team: an architect plans your app, a designer "
            "shapes the UI, developers write the code, and QA checks it. You describe what you "
            "want; they do the building.",
            "The fastest way to see it work: open Projects, start a new project, and describe "
            "your app in a sentence or two. You can follow every agent's progress live.",
        ],
        cta_label="Start your first project",
        cta_path="/projects",
        unsubscribe_url=unsubscribe_url,
    )


def render_first_build_nudge(
    *, name: Optional[str] = None, unsubscribe_url: Optional[str] = None
) -> EmailContent:
    """Sent ~2 days after signup if the user has not started a build."""
    return _build(
        subject="Your first Forge build takes a couple of minutes",
        preheader="A one-sentence description is enough to get started.",
        name=name,
        paragraphs_text=[
            "You haven't started a build yet, so here's the short version of how it works.",
            "1. Create a project and describe your app, for example: \"A habit tracker with "
            "streaks, reminders and a weekly summary.\"",
            "2. Forge's agents plan the architecture, design the screens and write the code. "
            "You can watch each step as it happens.",
            "3. Preview the result, then ask for changes in plain language.",
            "Not sure what to build? Start with something small you'd actually use - it's the "
            "quickest way to see what the agents can do.",
        ],
        cta_label="Build something now",
        cta_path="/projects",
        unsubscribe_url=unsubscribe_url,
    )


def render_first_build_done(
    *,
    name: Optional[str] = None,
    project_name: Optional[str] = None,
    project_id: Optional[str] = None,
    unsubscribe_url: Optional[str] = None,
) -> EmailContent:
    """Sent after the user's first successful build."""
    label = project_name.strip() if project_name and project_name.strip() else "your project"
    cta_path = f"/p/{project_id}/workspace" if project_id else "/projects"
    return _build(
        subject=f"{label} is built - here's what to do next"
        if project_name
        else "Your first Forge build is done - here's what to do next",
        preheader="Preview it, iterate on it, and ship it.",
        name=name,
        paragraphs_text=[
            f"Your first build finished: {label} is ready.",
            "A few things worth trying next:",
            "- Preview it and click through every screen.",
            "- Ask for changes in plain language (\"add dark mode\", \"make the sign-up form "
            "shorter\"). The agents update the existing code rather than starting over.",
            "- Check the QA and review tabs to see what the agents tested and flagged.",
        ],
        cta_label="Open your project",
        cta_path=cta_path,
        unsubscribe_url=unsubscribe_url,
    )


def render_planning_tips(
    *, name: Optional[str] = None, unsubscribe_url: Optional[str] = None
) -> EmailContent:
    """Sent ~5 days after signup. Introduces Initiatives for bigger work."""
    return _build(
        subject="Planning something bigger? Try an Initiative",
        preheader="Turn a product idea into a PRD, epics, stories and sprints.",
        name=name,
        paragraphs_text=[
            "Projects are great for a single app. For bigger product work, Forge has Initiatives.",
            "Describe the product you want, and Forge's product manager agent writes a PRD, then "
            "breaks it into epics, user stories, tasks and sprints. You review and approve the "
            "plan before any code gets written, and agents pick up tasks from the board.",
            "It's the closest thing to handing a spec to an engineering team and getting a "
            "roadmap back.",
        ],
        cta_label="Create an Initiative",
        cta_path="/initiatives",
        unsubscribe_url=unsubscribe_url,
    )


ONBOARDING_TEMPLATES = {
    "welcome": render_welcome,
    "first_build_nudge": render_first_build_nudge,
    "first_build_done": render_first_build_done,
    "planning_tips": render_planning_tips,
}
