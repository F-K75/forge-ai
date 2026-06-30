"""Parallel agent fan-out with retries, JSON parsing, and cost tracking.

The runner is deliberately crash-proof: any single agent failure is captured
as an ``AgentReport`` with ``status=failed`` (acceptance criterion #3), so a
run with a broken agent still produces a consolidated report from the rest.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from typing import Awaitable, Callable, Optional

from .config import get_settings
from .context import build_context, match_triggers
from .models import (
    AgentConfig,
    AgentReport,
    AgentStatus,
    Issue,
    TokenUsage,
)
from .providers import (
    TRANSIENT_ERRORS,
    estimate_cost,
    llm_complete_with_usage,
)

EventEmitter = Callable[[dict], Awaitable[None]]

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)

_JSON_INSTRUCTION = (
    "Respond with a single JSON object ONLY — no prose, no markdown fences. "
    "It must conform to this output schema (keys are required where shown):\n"
)


# --------------------------------------------------------------------------- #
# Defensive JSON parsing
# --------------------------------------------------------------------------- #
def strip_and_parse_json(text: str) -> dict:
    """Pull a JSON object out of an LLM response, tolerating fences/prose."""
    if not text or not text.strip():
        raise ValueError("empty model response")

    cleaned = text.strip()
    cleaned = _JSON_FENCE_RE.sub("", cleaned).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Fall back to the first balanced {...} span.
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        return json.loads(cleaned[start : end + 1])
    raise ValueError("no JSON object found in model response")


def _coerce_report_payload(data: dict) -> tuple[Optional[int], list[Issue]]:
    score = data.get("score")
    if isinstance(score, str):
        m = re.search(r"-?\d+", score)
        score = int(m.group()) if m else None
    elif isinstance(score, float):
        score = int(score)
    elif not isinstance(score, int):
        score = None
    if isinstance(score, int):
        score = max(0, min(10, score))

    raw_issues = data.get("issues") or []
    issues: list[Issue] = []
    if isinstance(raw_issues, list):
        for item in raw_issues:
            if isinstance(item, dict):
                try:
                    issues.append(Issue.model_validate(item))
                except Exception:
                    issues.append(
                        Issue(title=str(item.get("title", ""))[:200])
                    )
    return score, issues


# --------------------------------------------------------------------------- #
# Single agent execution
# --------------------------------------------------------------------------- #
async def _call_with_retries(
    model: str, system: str, messages: list[dict], max_tokens: int
):
    settings = get_settings()
    last_exc: Exception | None = None
    for attempt in range(settings.max_retries):
        try:
            return await llm_complete_with_usage(model, system, messages, max_tokens)
        except TRANSIENT_ERRORS as exc:
            last_exc = exc
            if attempt == settings.max_retries - 1:
                break
            await asyncio.sleep(settings.retry_base_delay * (2 ** attempt))
        # Non-transient errors (auth, NotImplementedError, ProviderError)
        # propagate immediately — retrying won't help.
    raise last_exc if last_exc else RuntimeError("agent call failed")


async def run_agent(
    agent: AgentConfig,
    repo_path: str,
    diff: Optional[str],
    matched_files: list[str],
    semaphore: asyncio.Semaphore,
) -> AgentReport:
    settings = get_settings()
    started = time.monotonic()
    report = AgentReport(
        agent_id=agent.id,
        stage=agent.stage,
        model=agent.model,
        matched_files=matched_files,
    )

    async with semaphore:
        try:
            bundle = build_context(repo_path, matched_files, diff)
            schema_text = json.dumps(agent.output_schema, indent=2)
            system = f"{agent.system_prompt}\n\n{_JSON_INSTRUCTION}{schema_text}"
            user_msg = (
                "Review the following codebase context and return your findings "
                "as JSON.\n\n" + bundle.to_prompt()
            )
            messages = [{"role": "user", "content": user_msg}]

            result = await _call_with_retries(
                agent.model, system, messages, settings.agent_max_output_tokens
            )
            report.usage = result.usage
            report.cost_usd = estimate_cost(agent.model, result.usage)
            report.raw_output = result.text

            data = strip_and_parse_json(result.text)
            score, issues = _coerce_report_payload(data)
            report.score = score
            report.issues = issues
            report.status = AgentStatus.success
        except Exception as exc:  # never let one agent crash the run
            report.status = AgentStatus.failed
            report.error = f"{type(exc).__name__}: {exc}"

    report.duration_s = round(time.monotonic() - started, 3)
    return report


# --------------------------------------------------------------------------- #
# Fan-out
# --------------------------------------------------------------------------- #
def select_triggered_agents(
    agents: list[AgentConfig], candidate_files: list[str]
) -> list[tuple[AgentConfig, list[str]]]:
    """Pair each triggered agent with the files that matched its triggers."""
    selected: list[tuple[AgentConfig, list[str]]] = []
    for agent in agents:
        matched = match_triggers(agent.triggers, candidate_files)
        if matched:
            selected.append((agent, matched))
    return selected


async def run_agents(
    agents: list[AgentConfig],
    repo_path: str,
    candidate_files: list[str],
    diff: Optional[str] = None,
    emit: Optional[EventEmitter] = None,
) -> list[AgentReport]:
    """Run every triggered agent concurrently under a semaphore."""
    settings = get_settings()
    semaphore = asyncio.Semaphore(settings.max_concurrency)
    triggered = select_triggered_agents(agents, candidate_files)

    async def _wrapped(agent: AgentConfig, matched: list[str]) -> AgentReport:
        if emit:
            await emit(
                {
                    "type": "agent_started",
                    "agent_id": agent.id,
                    "stage": agent.stage,
                    "matched_files": matched[:50],
                }
            )
        report = await run_agent(agent, repo_path, diff, matched, semaphore)
        if emit:
            await emit(
                {
                    "type": "agent_done",
                    "agent_id": agent.id,
                    "status": report.status.value,
                    "score": report.score,
                    "issues": len(report.issues),
                    "cost_usd": round(report.cost_usd, 4),
                    "error": report.error,
                }
            )
        return report

    if not triggered:
        return []

    tasks = [asyncio.create_task(_wrapped(a, m)) for a, m in triggered]
    return await asyncio.gather(*tasks)


def aggregate_usage(reports: list[AgentReport]) -> tuple[TokenUsage, float]:
    total = TokenUsage()
    cost = 0.0
    for r in reports:
        total = total + r.usage
        cost += r.cost_usd
    return total, round(cost, 6)
