"""Tests for the Phase 1 specialist-suggestion addition to
`RepositoryMonitor._escalate()` (backend/agent_registry/monitoring.py).

See docs/architecture/specialist-agent-execution-plan.md, Phase 1 (section
5): the point of this addition is proving a resolved `Assignment.role`
meaningfully changes what gets *generated* (a real, role-framed LLM call),
not just what gets logged. These tests exercise that against a fake
`AIGateway` (never a real provider) injected directly into
`RepositoryMonitor`, and prove the addition is fully fail-open: nothing here
can break `record_finding()`/`_escalate()`, even when the LLM call raises or
returns something unusable.
"""

from __future__ import annotations

from typing import List, Optional

import pytest

from agent_registry.monitoring import FindingCategory, FindingSeverity, RepositoryMonitor, MonitoringRepository
from agent_registry.ownership import CodeOwnership
from agent_registry.pr_workflow import PRWorkflow, PRWorkflowRepository
from agent_registry.registry import AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from agent_registry.task_router import TaskRouter
from agent_registry.team_chat import TeamChat, TeamChatRepository
from gateway.models import GatewayRequest, GatewayResponse

# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in (same shape as tests/test_monitoring.py)
# --------------------------------------------------------------------------- #


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, field, direction=1):
        self._docs.sort(key=lambda d: d.get(field), reverse=(direction == -1))
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length=None):
        docs = self._docs
        if length is not None:
            docs = docs[:length]
        return [dict(d) for d in docs]


def _matches(doc, query):
    for k, v in query.items():
        if k == "$or":
            if not any(_matches(doc, sub) for sub in v):
                return False
            continue
        if k == "to_agent_ids":
            if v not in (doc.get(k) or []):
                return False
            continue
        if doc.get(k) != v:
            return False
    return True


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                out = dict(d)
                out.pop("_id", None)
                return out
        return None

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _matches(d, query):
                d.update(update["$set"])
                return
        if upsert:
            new_doc = dict(query)
            new_doc.update(update["$set"])
            self.docs.append(new_doc)

    def find(self, query, projection=None):
        matched = [d for d in self.docs if _matches(d, query)]
        return FakeCursor(matched)


class FakeDB:
    def __init__(self):
        self.engineering_orgs = FakeCollection()
        self.agent_profiles = FakeCollection()
        self.team_messages = FakeCollection()
        self.change_requests = FakeCollection()
        self.monitoring_findings = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


# --------------------------------------------------------------------------- #
# Fake AIGateway -- captures every GatewayRequest it's asked to generate for,
# so tests can assert on exactly what was constructed (system prompt, agent
# name/role, etc.) without ever touching a real provider.
# --------------------------------------------------------------------------- #


class FakeGateway:
    def __init__(self, *, content: str = "Suggested fix from the specialist.", should_raise: bool = False):
        self.content = content
        self.should_raise = should_raise
        self.requests: List[GatewayRequest] = []

    async def generate(self, request: GatewayRequest) -> GatewayResponse:
        self.requests.append(request)
        if self.should_raise:
            raise RuntimeError("simulated LLM/provider failure")
        return GatewayResponse(
            content=self.content,
            provider="fake",
            model="fake-model",
            request_id="fake-request-id",
        )


def _patched_monitor(monkeypatch, *, gateway: Optional[FakeGateway] = None, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.monitoring as monitoring_module
    import agent_registry.pr_workflow as pr_module
    import agent_registry.repository as repo_module
    import agent_registry.team_chat as chat_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(chat_module, "get_db", _get_db)
    monkeypatch.setattr(pr_module, "get_db", _get_db)
    monkeypatch.setattr(monitoring_module, "get_db", _get_db)

    registry = AgentRegistry(repo=AgentRegistryRepository())
    ownership = CodeOwnership(registry=registry)
    chat = TeamChat(registry=registry, repo=TeamChatRepository())
    workflow = PRWorkflow(registry=registry, ownership=ownership, chat=chat, repo=PRWorkflowRepository())
    router = TaskRouter(registry=registry)
    monitor = RepositoryMonitor(
        registry=registry,
        router=router,
        ownership=ownership,
        chat=chat,
        workflow=workflow,
        repo=MonitoringRepository(),
        gateway=gateway or FakeGateway(),
    )
    return monitor, registry, chat, workflow, db


# --------------------------------------------------------------------------- #
# (1) escalation now posts BOTH the existing "Auto-escalated" message AND a
#     new FINDING-type message with real role-influenced content.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_escalation_posts_both_escalation_and_specialist_finding_message(monkeypatch):
    gateway = FakeGateway(content="As the API engineer, I'd add input validation on this route.")
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch, gateway=gateway)
    await registry.get_or_create_org("proj1")

    finding = await monitor.record_finding(
        "proj1", FindingCategory.CI_FAILURE, FindingSeverity.HIGH,
        "API endpoint returning 500", description="The /orders REST endpoint fails intermittently",
    )

    messages = await chat.list_messages("proj1")
    escalations = [m for m in messages if m.message_type.value == "escalation"]
    findings = [m for m in messages if m.message_type.value == "finding"]

    assert len(escalations) == 1
    assert escalations[0].content == f"Auto-escalated: {finding.title}"

    assert len(findings) == 1
    assert findings[0].content == gateway.content
    assert findings[0].context["finding_id"] == finding.id
    assert "role" in findings[0].context

    # The captured GatewayRequest is genuinely framed by the resolved role.
    assert len(gateway.requests) == 1
    request = gateway.requests[0]
    assert request.agent_name == findings[0].context["role"]
    assert request.agent_name in request.system_prompt
    assert finding.title in request.messages[0]["content"]
    assert request.max_tokens == 512
    assert request.project_id == "proj1"

    # The specialist FINDING message is posted from the same real, already-
    # resolved specialist agent as the escalation message -- not a new
    # identity.
    assert findings[0].from_agent_id == escalations[0].from_agent_id


# --------------------------------------------------------------------------- #
# (2) Two different resolved roles produce genuinely different prompts --
#     the actual thing Phase 1 needs to prove.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_different_roles_produce_different_role_framed_prompts(monkeypatch):
    gateway = FakeGateway()
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch, gateway=gateway)
    await registry.get_or_create_org("proj1")

    # Deliberately worded so TaskRouter's keyword classifier resolves each
    # to a different role/department (see agent_registry/task_router.py's
    # ROLE_KEYWORDS).
    await monitor.record_finding(
        "proj1", FindingCategory.PERFORMANCE_REGRESSION, FindingSeverity.HIGH,
        "React dashboard component re-renders excessively",
        description="The frontend dashboard page component renders too often, hurting UI responsiveness",
    )
    await monitor.record_finding(
        "proj1", FindingCategory.SECURITY, FindingSeverity.CRITICAL,
        "Potential SQL injection in query builder",
        description="A database query is built via string concatenation, vulnerable to sql injection",
    )

    assert len(gateway.requests) == 2
    request_a, request_b = gateway.requests

    # Different roles were actually resolved for the two findings...
    assert request_a.agent_name != request_b.agent_name
    # ...and each system prompt is framed by its OWN role, not a shared
    # generic template -- i.e. the role genuinely changes what gets asked.
    assert request_a.agent_name in request_a.system_prompt
    assert request_b.agent_name in request_b.system_prompt
    assert request_a.agent_name not in request_b.system_prompt
    assert request_b.agent_name not in request_a.system_prompt
    assert request_a.system_prompt != request_b.system_prompt


# --------------------------------------------------------------------------- #
# (3) LLM call raising never breaks record_finding()/_escalate().
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_llm_failure_is_swallowed_and_escalation_still_completes(monkeypatch):
    gateway = FakeGateway(should_raise=True)
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch, gateway=gateway)
    await registry.get_or_create_org("proj1")

    finding = await monitor.record_finding(
        "proj1", FindingCategory.SECURITY, FindingSeverity.CRITICAL, "SQL injection found",
    )

    # The finding itself is still saved, with its change request set --
    # nothing about the (failed) LLM call propagated as an exception.
    assert finding.change_request_id is not None

    changes = await workflow.list_for_project("proj1")
    assert len(changes) == 1

    messages = await chat.list_messages("proj1")
    escalations = [m for m in messages if m.message_type.value == "escalation"]
    findings = [m for m in messages if m.message_type.value == "finding"]

    assert len(escalations) == 1
    assert findings == []

    # The gateway was still called (and raised) -- proving the failure was
    # actually swallowed, not just skipped.
    assert len(gateway.requests) == 1


# --------------------------------------------------------------------------- #
# (4) AIGateway.generate() succeeding with empty/unusable content is handled
#     gracefully -- no crash, no bogus chat message posted.
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_empty_llm_content_is_handled_gracefully(monkeypatch):
    gateway = FakeGateway(content="   ")
    monitor, registry, chat, workflow, db = _patched_monitor(monkeypatch, gateway=gateway)
    await registry.get_or_create_org("proj1")

    finding = await monitor.record_finding(
        "proj1", FindingCategory.TEST_FAILURE, FindingSeverity.HIGH, "Flaky test suite",
    )

    assert finding.change_request_id is not None

    messages = await chat.list_messages("proj1")
    escalations = [m for m in messages if m.message_type.value == "escalation"]
    findings = [m for m in messages if m.message_type.value == "finding"]

    assert len(escalations) == 1
    assert findings == []
    assert len(gateway.requests) == 1
