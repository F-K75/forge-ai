"""Offline tests for the Review Board orchestrator.

No network and no MongoDB are required: the provider is monkeypatched and
DB-touching code paths are avoided. Run with::

    pytest orchestrator/tests -q
"""
import json

import pytest

from orchestrator.consolidator import _fallback_consolidation
import orchestrator.consolidator as consolidator
import orchestrator.runner as runner
from orchestrator.context import (
    build_context,
    candidate_files,
    changed_files,
    match_triggers,
    parse_diff,
)
from orchestrator.loader import load_agents
from orchestrator.models import (
    AgentConfig,
    AgentReport,
    AgentStatus,
    Issue,
    Severity,
    TokenUsage,
)
from orchestrator.providers import LLMResult, estimate_cost
from orchestrator.runner import run_agents, select_triggered_agents, strip_and_parse_json
from orchestrator.store import build_backlog_items


# --------------------------------------------------------------------------- #
# Loader
# --------------------------------------------------------------------------- #
def test_loader_reads_example_agent():
    agents = load_agents()
    assert any(a.id == "security_engineer" for a in agents)


def test_loader_rejects_bad_schema(tmp_path):
    (tmp_path / "broken.json").write_text(json.dumps({"id": "x"}))  # missing fields
    from orchestrator.loader import AgentConfigError

    with pytest.raises(AgentConfigError):
        load_agents(str(tmp_path))


# --------------------------------------------------------------------------- #
# Trigger scoping (acceptance criterion #2)
# --------------------------------------------------------------------------- #
def test_trigger_matching_globs():
    files = ["backend/api/auth.py", "frontend/src/App.tsx", "auth/login.py", "README.md"]
    matched = match_triggers(["*.py", "**/api/**"], files)
    assert "backend/api/auth.py" in matched
    assert "auth/login.py" in matched
    assert "frontend/src/App.tsx" not in matched


def test_empty_triggers_match_everything():
    files = ["a.py", "b.tsx"]
    assert match_triggers([], files) == files


def test_diff_mode_scopes_out_nonmatching_agents():
    diff = "--- a/frontend/src/App.tsx\n+++ b/frontend/src/App.tsx\n@@ -1 +1 @@\n-a\n+b\n"
    agents = load_agents()
    cf = candidate_files(".", diff)
    triggered = select_triggered_agents(agents, cf)
    assert all(a.id != "security_engineer" for a, _ in triggered)


# --------------------------------------------------------------------------- #
# Diff parsing
# --------------------------------------------------------------------------- #
def test_parse_diff_extracts_files_and_hunks():
    diff = (
        "diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n"
        "@@ -1 +1 @@\n-old\n+new_secret\n"
    )
    assert changed_files(diff) == ["x.py"]
    assert "new_secret" in parse_diff(diff)["x.py"]


# --------------------------------------------------------------------------- #
# Context builder + token guard
# --------------------------------------------------------------------------- #
def test_context_excludes_vendor_dirs(tmp_path):
    (tmp_path / "a.py").write_text("x = 1\n")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "junk.py").write_text("ignored\n")
    files = candidate_files(str(tmp_path), None)
    assert files == ["a.py"]
    bundle = build_context(str(tmp_path), files)
    assert "x = 1" in bundle.body


def test_context_token_budget_truncates(tmp_path):
    big = "line\n" * 100_000
    (tmp_path / "big.py").write_text(big)
    bundle = build_context(str(tmp_path), ["big.py"], max_input_tokens=2_000)
    assert bundle.estimated_tokens <= 2_000
    assert "big.py" in (bundle.files_truncated + bundle.files_omitted)


# --------------------------------------------------------------------------- #
# Defensive JSON parsing
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "text,expected",
    [
        ('```json\n{"score": 7}\n```', 7),
        ('Sure! {"score": 3} done', 3),
        ('{"score": 5, "issues": []}', 5),
    ],
)
def test_strip_and_parse_json(text, expected):
    assert strip_and_parse_json(text)["score"] == expected


def test_strip_and_parse_json_empty():
    with pytest.raises(ValueError):
        strip_and_parse_json("")


# --------------------------------------------------------------------------- #
# Cost estimation
# --------------------------------------------------------------------------- #
def test_estimate_cost_by_model_tier():
    usage = TokenUsage(input_tokens=1_000_000, output_tokens=0)
    assert estimate_cost("claude-haiku-4-5", usage) == pytest.approx(0.80)
    assert estimate_cost("claude-opus-4-8", usage) == pytest.approx(15.0)


# --------------------------------------------------------------------------- #
# Runner fan-out + graceful degradation (acceptance criterion #3)
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_runner_isolates_failures_and_consolidates(tmp_path, monkeypatch):
    async def fake_llm(model, system, messages, max_tokens=None):
        if "FAILING" in system:
            raise RuntimeError("deliberate failure")
        if "CTO" in system:
            body = json.dumps(
                {
                    "overall_score": 6,
                    "recommendation": "GO_WITH_FIXES",
                    "summary": "ok",
                    "deduplicated_issues": [],
                    "top_10_critical": [],
                    "top_25_improvements": [],
                }
            )
            return LLMResult(text=body, usage=TokenUsage(input_tokens=10, output_tokens=5), model=model)
        body = json.dumps(
            {"score": 7, "issues": [{"severity": "high", "title": "X", "fix": "f", "files": ["a.py"]}]}
        )
        return LLMResult(text=body, usage=TokenUsage(input_tokens=20, output_tokens=8), model=model)

    monkeypatch.setattr(runner, "llm_complete_with_usage", fake_llm)
    monkeypatch.setattr(consolidator, "llm_complete_with_usage", fake_llm)

    (tmp_path / "a.py").write_text("print(1)\n")
    good = AgentConfig(id="good", stage=1, model="claude-haiku-4-5", system_prompt="review", triggers=["*.py"])
    bad = AgentConfig(id="bad", stage=2, model="claude-haiku-4-5", system_prompt="FAILING", triggers=["*.py"])

    events = []

    async def emit(ev):
        events.append(ev)

    reports = await run_agents([good, bad], str(tmp_path), ["a.py"], emit=emit)
    by_id = {r.agent_id: r for r in reports}

    assert by_id["good"].status == AgentStatus.success
    assert by_id["good"].score == 7
    assert by_id["bad"].status == AgentStatus.failed
    assert by_id["good"].cost_usd > 0

    cons, _ = await consolidator.consolidate(reports)
    assert cons.recommendation.value == "GO_WITH_FIXES"

    types = [e["type"] for e in events]
    assert types.count("agent_started") == 2
    assert types.count("agent_done") == 2


# --------------------------------------------------------------------------- #
# Consolidator fallback + backlog
# --------------------------------------------------------------------------- #
def test_fallback_consolidation_flags_critical():
    reports = [
        AgentReport(
            agent_id="sec",
            stage=4,
            model="m",
            status=AgentStatus.success,
            score=3,
            issues=[Issue(severity=Severity.critical, title="SQLi", fix="param")],
        )
    ]
    cons = _fallback_consolidation(reports)
    assert cons.recommendation.value == "NO_GO"
    items = build_backlog_items("run1", cons)
    assert items and items[0].severity == Severity.critical
    assert items[0].effort.value in {"S", "M", "L"}
