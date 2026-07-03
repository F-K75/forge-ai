"""Regression tests for PROD-002: a project's `template` field was stored on
creation but never read back anywhere in the build pipeline, and the
frontend never sent it either. Found 2026-07-03 while working PROD-002.

Fixed by: threading `template` from the project doc, through
tasks/build_tasks.py's Celery task, through core/orchestrator.py's
run_build(), into ArchitectAgent.blueprint() as system-prompt context (not
folded into the stored/displayed prompt, so it doesn't show up as text the
user never typed).

A second, more serious bug was found in the same area: WorkspacePage.tsx's
handling of `/build/new` (used by Onboarding.tsx) tried to GET a project
with id "new", which always 404s, and silently fell back to a fake
placeholder object -- so the very first build a new user ever tried to run
after onboarding would itself fail with "Project not found". That's a
frontend-only fix (no test infra exists for the frontend --confirmed
zero test files/tooling elsewhere in this audit), verified instead via a
successful `tsc --noEmit` and production `vite build`.
"""

import pytest

from agents.architect import ArchitectAgent


class _FakeAgent(ArchitectAgent):
    def __init__(self):
        # Skip BaseAgent.__init__'s real anthropic.AsyncAnthropic() client.
        self.model = "claude-sonnet-4-6"
        self.captured_extra_system = None

    async def run(self, messages, extra_system="", **kwargs):
        self.captured_extra_system = extra_system
        return '{"app_name": "test", "pages": [], "data_models": [], "api_endpoints": [], "features": [], "integrations": [], "auth_required": true, "clarifications": []}'


@pytest.mark.asyncio
async def test_blueprint_passes_template_as_extra_system_context():
    agent = _FakeAgent()
    await agent.blueprint("Build me an app", template="SaaS dashboard")

    assert agent.captured_extra_system is not None
    assert "SaaS dashboard" in agent.captured_extra_system


@pytest.mark.asyncio
async def test_blueprint_has_no_template_context_when_none_given():
    agent = _FakeAgent()
    await agent.blueprint("Build me an app", template=None)

    assert agent.captured_extra_system == ""


@pytest.mark.asyncio
async def test_blueprint_still_works_without_template_arg_at_all():
    """Backwards compatible -- template is optional with a None default."""
    agent = _FakeAgent()
    result = await agent.blueprint("Build me an app")

    assert result["app_name"] == "test"
    assert agent.captured_extra_system == ""


def test_orchestrator_passes_template_through_to_architect():
    """Lightweight source check (matching test_p0_fixes.py's convention) for
    the plumbing between build_tasks.py -> orchestrator.py -> architect.py --
    full end-to-end mocking of all 6 agents is disproportionate to this
    small wiring change."""
    from pathlib import Path

    orchestrator_src = (Path(__file__).resolve().parents[1] / "core" / "orchestrator.py").read_text()
    assert "template: Optional[str] = None" in orchestrator_src
    assert "template=template" in orchestrator_src

    build_tasks_src = (Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py").read_text()
    assert 'db.projects.find_one(' in build_tasks_src
    assert "template=template" in build_tasks_src


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
