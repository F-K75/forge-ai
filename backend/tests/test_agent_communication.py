"""Developer -> Architect clarifications (core/agent_communication.py and
Orchestrator._run_developer_clarifications).

Before generating files, the Developer may ask the Architect about
ambiguities in the blueprint. The orchestrator owns the routing: it
authorizes the route, enforces the per-build question limit, charges each
answered question against the build's upfront credit reservation, times out
a slow Architect, persists every exchange on build.agent_messages, and on a
resumed build reuses exchanges a crashed attempt already paid for.

Uses the same stub-agent pattern as test_orchestrator_resume.py.
"""

import asyncio
import json

import pytest

import core.orchestrator as orchestrator_module
from core.agent_communication import CommunicationPolicy, InProcessAgentCommunication
from core.models import (
    AgentMessage,
    AgentMessageStatus,
    AgentStep,
    AgentType,
    Build,
    BuildStatus,
    WSEventType,
)
from core.orchestrator import Orchestrator

BLUEPRINT = {"integrations": [], "features": ["login"], "auth_required": True}
DESIGN = {"theme": "default"}

# Credits charged by the stages that run before the clarification phase in a
# fresh build with no integrations: architect 3 + business model 2 +
# designer 2 + developer 5 (core/config.py defaults).
CREDITS_BEFORE_CLARIFY = 12

# Worst case of everything after the developer, which clarifications may
# never eat into: PM 1 + 3 debug iterations x (debug 2 + PM 1).
SET_ASIDE = 1 + 3 * (2 + 1)

RESERVED_AMPLE = 40


class _StubAgent:
    def __init__(self, questions=None, answer_delay=0.0, answer_error=None):
        self.calls = []
        self.questions = questions or []
        self.answer_delay = answer_delay
        self.answer_error = answer_error

    async def blueprint(self, *a, **kw):
        return dict(BLUEPRINT)

    async def clarify(self, *a, **kw):
        return []

    async def improve(self, *a, **kw):
        return {"summary": "ok"}

    async def design(self, *a, **kw):
        return dict(DESIGN)

    async def identify_questions(self, blueprint, design, max_questions, **kw):
        self.calls.append(("identify_questions", (blueprint, design, max_questions), kw))
        return list(self.questions)

    async def answer(self, question, blueprint, design=None, **kw):
        self.calls.append(("answer", (question, blueprint, design), kw))
        if self.answer_delay:
            await asyncio.sleep(self.answer_delay)
        if self.answer_error:
            raise self.answer_error
        return f"answer to: {question}"

    async def generate_files(self, *a, **kw):
        self.calls.append(("generate_files", a, kw))
        return {"files": {"src/App.tsx": "// v1"}}

    async def integrate(self, *a, **kw):
        return {"files": {}, "instructions": ""}

    async def validate(self, *a, **kw):
        return {"passed": True}

    async def patch_files(self, *a, **kw):
        return {"files": {}}


def _make_orchestrator(monkeypatch, *, byok=False, questions=None, **architect_kw):
    async def _byok(self, user_id):
        return byok

    monkeypatch.setattr(Orchestrator, "_is_byok_active", _byok)
    orchestrator = Orchestrator()
    stubs = {}
    for attr in ("architect", "business_model", "designer", "developer", "integration", "pm"):
        kw = architect_kw if attr == "architect" else {}
        stub = _StubAgent(questions=questions if attr == "developer" else None, **kw)
        stubs[attr] = stub
        setattr(orchestrator, attr, stub)
    return orchestrator, stubs


def _make_build(agents=None, agent_messages=None, credits_used=0):
    return Build(
        id="build-1",
        project_id="p1",
        user_id="u1",
        prompt="Build an app with login",
        status=BuildStatus.PENDING,
        agents=agents or [],
        agent_messages=agent_messages or [],
        credits_used=credits_used,
    )


async def _run(orchestrator, build, reserved_credits):
    emitted = []

    async def emit(event):
        emitted.append(event)

    build, files = await orchestrator.run_build(
        build, emit=emit, sandbox_runner=None, reserved_credits=reserved_credits,
    )
    return build, files, emitted


def _generate_kwargs(stubs):
    calls = [c for c in stubs["developer"].calls if c[0] == "generate_files"]
    assert len(calls) == 1
    return calls[0][2]


def _answers(stubs):
    return [c for c in stubs["architect"].calls if c[0] == "answer"]


# --------------------------------------------------------------------------- #
# Happy path
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_developer_question_is_answered_by_architect_and_reaches_generation(monkeypatch):
    question = "What should happen when API authentication expires?"
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=[question])

    build, _, emitted = await _run(orchestrator, _make_build(), reserved_credits=RESERVED_AMPLE)

    assert build.status == BuildStatus.SUCCESS
    # Architect got the question with the build's blueprint and design.
    (_, (asked, blueprint, design), kw) = _answers(stubs)[0]
    assert asked == question
    assert blueprint == BLUEPRINT
    assert design == DESIGN
    assert kw["build_id"] == "build-1"
    # The answer flows back into the Developer's generation call.
    assert _generate_kwargs(stubs)["clarifications"] == [
        {"question": question, "answer": f"answer to: {question}"}
    ]
    # Persisted on the build record with participants, answer and cost.
    (msg,) = build.agent_messages
    assert (msg.sender, msg.recipient) == ("developer", "architect")
    assert msg.status == AgentMessageStatus.ANSWERED
    assert msg.credits_charged == 1
    assert msg.duration_ms is not None
    # PM (1 credit) runs after the clarification.
    assert build.credits_used == CREDITS_BEFORE_CLARIFY + 1 + 1
    # Request then response streamed over the WebSocket.
    types = [e.type for e in emitted]
    req = types.index(WSEventType.AGENT_MESSAGE_REQUEST)
    resp = types.index(WSEventType.AGENT_MESSAGE_RESPONSE)
    assert req < resp
    assert emitted[resp].data["answer"] == f"answer to: {question}"
    assert emitted[resp].data["credits_used"] == CREDITS_BEFORE_CLARIFY + 1
    json.dumps(emitted[resp].data)  # WS payload must be JSON-serializable


@pytest.mark.asyncio
async def test_no_questions_means_no_clarification_traffic(monkeypatch):
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=[])

    build, _, emitted = await _run(orchestrator, _make_build(), reserved_credits=RESERVED_AMPLE)

    assert build.status == BuildStatus.SUCCESS
    assert build.agent_messages == []
    assert _answers(stubs) == []
    assert "clarifications" not in _generate_kwargs(stubs)
    assert not any(e.type == WSEventType.AGENT_MESSAGE_REQUEST for e in emitted)


@pytest.mark.asyncio
async def test_unknown_reservation_skips_phase_for_metered_builds(monkeypatch):
    """Callers that don't pass reserved_credits (the pre-existing signature)
    get exactly the old sequential pipeline: no question pass at all."""
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=["q?"])

    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=None)

    assert build.status == BuildStatus.SUCCESS
    assert not any(c[0] == "identify_questions" for c in stubs["developer"].calls)
    assert build.agent_messages == []
    assert "clarifications" not in _generate_kwargs(stubs)


@pytest.mark.asyncio
async def test_disabled_by_zero_question_limit(monkeypatch):
    monkeypatch.setattr(orchestrator_module.settings, "developer_clarification_max_questions", 0)
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=["q?"])

    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=100)

    assert not any(c[0] == "identify_questions" for c in stubs["developer"].calls)
    assert build.agent_messages == []


# --------------------------------------------------------------------------- #
# Limits and credits
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_question_limit_is_enforced(monkeypatch):
    monkeypatch.setattr(orchestrator_module.settings, "developer_clarification_max_questions", 2)
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=["q1?", "q2?", "q3?", "q4?"])

    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=100)

    # The developer is told the limit, and only that many reach the architect.
    (ident,) = [c for c in stubs["developer"].calls if c[0] == "identify_questions"]
    assert ident[1][2] == 2
    assert [c[1][0] for c in _answers(stubs)] == ["q1?", "q2?"]
    assert len(build.agent_messages) == 2
    assert len(_generate_kwargs(stubs)["clarifications"]) == 2


@pytest.mark.asyncio
async def test_comms_rejects_questions_past_the_limit():
    build = _make_build()

    async def emit(_):
        pass

    async def responder(q, ctx):
        return "a"

    comms = InProcessAgentCommunication(
        build, emit, {"architect": responder},
        CommunicationPolicy(max_questions=1, credit_cost=1, credit_ceiling=None, timeout_seconds=1),
    )
    first = await comms.ask("developer", "architect", "q1?", {})
    second = await comms.ask("developer", "architect", "q2?", {})

    assert first["status"] == "answered"
    assert second["status"] == "rejected"
    assert second["reason"] == "question_limit"


@pytest.mark.asyncio
async def test_budget_exhaustion_rejects_remaining_questions_without_exceeding_reservation(monkeypatch):
    # Ceiling = reserved 23 - set-aside 10 = 13: room for exactly one
    # 1-credit answer on top of the 12 credits already charged.
    reserved = CREDITS_BEFORE_CLARIFY + 1 + SET_ASIDE
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=["q1?", "q2?", "q3?"])

    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=reserved)

    assert build.status == BuildStatus.SUCCESS
    statuses = [(m.question, m.status, m.reason) for m in build.agent_messages]
    assert statuses == [
        ("q1?", AgentMessageStatus.ANSWERED, None),
        ("q2?", AgentMessageStatus.REJECTED, "budget_exhausted"),
        ("q3?", AgentMessageStatus.REJECTED, "budget_exhausted"),
    ]
    assert len(_answers(stubs)) == 1
    assert build.credits_used <= reserved
    assert len(_generate_kwargs(stubs)["clarifications"]) == 1


@pytest.mark.asyncio
async def test_integration_credits_are_set_aside(monkeypatch):
    """With integrations in the blueprint, their stage cost is also set
    aside: a reservation that would allow one answer without integrations
    (24 - 10 = 14 >= 13) allows none with them (24 - 12 = 12 < 13)."""
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=["q1?"])
    blueprint = dict(BLUEPRINT, integrations=["stripe"])

    async def _bp(*a, **kw):
        return blueprint

    orchestrator.architect.blueprint = _bp
    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=24)

    assert not any(c[0] == "identify_questions" for c in stubs["developer"].calls)
    assert build.agent_messages == []
    # Only the pipeline's own stages were charged (+ integration 2 + PM 1).
    assert build.credits_used == CREDITS_BEFORE_CLARIFY + 2 + 1


@pytest.mark.asyncio
async def test_free_first_build_with_zero_reservation_skips_phase(monkeypatch):
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=["q1?"])

    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=0)

    assert not any(c[0] == "identify_questions" for c in stubs["developer"].calls)
    assert build.agent_messages == []


@pytest.mark.asyncio
async def test_byok_builds_are_not_charged(monkeypatch):
    orchestrator, stubs = _make_orchestrator(monkeypatch, byok=True, questions=["q1?", "q2?"])

    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=0)

    assert [m.status for m in build.agent_messages] == [AgentMessageStatus.ANSWERED] * 2
    assert all(m.credits_charged == 0 for m in build.agent_messages)
    assert build.credits_used == 0


# --------------------------------------------------------------------------- #
# Failure handling
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_architect_timeout_is_recorded_and_build_continues_uncharged(monkeypatch):
    monkeypatch.setattr(orchestrator_module.settings, "agent_message_timeout_seconds", 0.05)
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=["slow?"], answer_delay=1.0)

    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=RESERVED_AMPLE)

    assert build.status == BuildStatus.SUCCESS
    (msg,) = build.agent_messages
    assert msg.status == AgentMessageStatus.TIMEOUT
    assert msg.credits_charged == 0
    assert build.credits_used == CREDITS_BEFORE_CLARIFY + 1  # + PM only
    assert "clarifications" not in _generate_kwargs(stubs)


@pytest.mark.asyncio
async def test_architect_error_is_recorded_and_build_continues(monkeypatch):
    orchestrator, stubs = _make_orchestrator(
        monkeypatch, questions=["q?"], answer_error=RuntimeError("llm down"),
    )

    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=RESERVED_AMPLE)

    assert build.status == BuildStatus.SUCCESS
    (msg,) = build.agent_messages
    assert msg.status == AgentMessageStatus.FAILED
    assert "llm down" in msg.reason
    assert msg.credits_charged == 0


@pytest.mark.asyncio
async def test_developer_question_pass_failure_degrades_to_plain_build(monkeypatch):
    orchestrator, stubs = _make_orchestrator(monkeypatch)

    async def _boom(*a, **kw):
        raise RuntimeError("parse error")

    orchestrator.developer.identify_questions = _boom
    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=RESERVED_AMPLE)

    assert build.status == BuildStatus.SUCCESS
    assert build.agent_messages == []
    assert "clarifications" not in _generate_kwargs(stubs)


@pytest.mark.asyncio
async def test_slow_question_pass_times_out(monkeypatch):
    monkeypatch.setattr(orchestrator_module.settings, "agent_message_timeout_seconds", 0.05)
    orchestrator, stubs = _make_orchestrator(monkeypatch)

    async def _slow(*a, **kw):
        await asyncio.sleep(1.0)
        return ["q?"]

    orchestrator.developer.identify_questions = _slow
    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=RESERVED_AMPLE)

    assert build.status == BuildStatus.SUCCESS
    assert build.agent_messages == []


# --------------------------------------------------------------------------- #
# Authorization
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_unauthorized_route_and_unknown_recipient_are_rejected():
    build = _make_build()
    events = []

    async def emit(e):
        events.append(e)

    called = []

    async def responder(q, ctx):
        called.append(q)
        return "a"

    comms = InProcessAgentCommunication(
        build, emit, {"architect": responder},
        CommunicationPolicy(max_questions=5, credit_cost=1, credit_ceiling=100, timeout_seconds=1),
    )
    wrong_sender = await comms.ask("qa", "architect", "q?", {})
    no_responder = await comms.ask("developer", "security", "q?", {})
    empty = await comms.ask("developer", "architect", "   ", {})

    assert wrong_sender["reason"] == "route_not_allowed"
    assert no_responder["reason"] == "route_not_allowed"
    assert empty["reason"] == "invalid_question"
    assert called == []
    assert build.credits_used == 0
    # Rejections are still recorded and streamed, for observability.
    assert len(build.agent_messages) == 3
    assert [e.type for e in events] == [WSEventType.AGENT_MESSAGE_RESPONSE] * 3


# --------------------------------------------------------------------------- #
# Recovery
# --------------------------------------------------------------------------- #


def _recovered_build():
    """A build that crashed during the developer stage after one of its two
    clarifications was answered (and charged) and the other was recorded
    but not yet delivered."""
    prior = [
        AgentStep(agent=AgentType.ARCHITECT, status=BuildStatus.SUCCESS, output=json.dumps(BLUEPRINT)),
        AgentStep(agent=AgentType.BUSINESS_IMPROVER, status=BuildStatus.SUCCESS, output=json.dumps({"summary": "ok"})),
        AgentStep(agent=AgentType.DESIGNER, status=BuildStatus.SUCCESS, output=json.dumps(DESIGN)),
        AgentStep(agent=AgentType.DEVELOPER, status=BuildStatus.RUNNING),
    ]
    messages = [
        AgentMessage(
            conversation_id="c1", sender="developer", recipient="architect",
            question="already answered?", answer="yes", status=AgentMessageStatus.ANSWERED,
            credits_charged=1,
        ),
        AgentMessage(conversation_id="c1", sender="developer", recipient="architect", question="still pending?"),
    ]
    # Round-trip through model_dump, as the Mongo build document does.
    build = _make_build(agents=prior, agent_messages=messages, credits_used=CREDITS_BEFORE_CLARIFY + 1)
    return Build(**build.model_dump())


@pytest.mark.asyncio
async def test_resume_reuses_answered_exchanges_without_recharging(monkeypatch):
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=["a brand new question?"])
    build = _recovered_build()
    credits_before = build.credits_used

    build, _, _ = await _run(orchestrator, build, reserved_credits=40)

    # No fresh question pass, the answered one is not re-asked.
    assert not any(c[0] == "identify_questions" for c in stubs["developer"].calls)
    assert [c[1][0] for c in _answers(stubs)] == ["still pending?"]
    assert [m.status for m in build.agent_messages] == [AgentMessageStatus.ANSWERED] * 2
    assert _generate_kwargs(stubs)["clarifications"] == [
        {"question": "already answered?", "answer": "yes"},
        {"question": "still pending?", "answer": "answer to: still pending?"},
    ]
    # Charges for this attempt: developer restart (5, pre-existing resume
    # behaviour for a step that never reached SUCCESS) + the one newly
    # answered question (1) + PM (1). The recovered answer is not re-charged.
    assert build.credits_used == credits_before + 5 + 1 + 1


@pytest.mark.asyncio
async def test_completed_developer_step_skips_clarifications_on_resume(monkeypatch):
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=["q?"])
    build = _recovered_build()
    for step in build.agents:
        if step.agent == AgentType.DEVELOPER:
            step.status = BuildStatus.SUCCESS
            step.output = "Generated 1 files"

    async def emit(_):
        pass

    build, _ = await orchestrator.run_build(
        build, emit=emit, existing_files={"src/App.tsx": "// v1"}, reserved_credits=40,
    )

    assert _answers(stubs) == []
    assert not any(c[0] in ("identify_questions", "generate_files") for c in stubs["developer"].calls)


# --------------------------------------------------------------------------- #
# Prompt variants actually reach the prompt builder
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_prompt_template_variant_survives_context_engineering(monkeypatch):
    """BaseAgent used to drop prompt_template_version whenever context
    engineering was on (the default), so variants like the architect's
    "answer-v1" silently ran under the blueprint prompt."""
    from agents.architect import ArchitectAgent
    from prompt_builder import PromptContext

    agent = ArchitectAgent()

    async def _assemble(**kw):
        return PromptContext(agent_role="architect", task=kw["task"])

    monkeypatch.setattr(agent.context_assembler, "assemble", _assemble)

    answer_prompt = await agent._resolve_system_prompt(
        [{"role": "user", "content": "Question?"}], "", "answer-v1",
    )
    default_prompt = await agent._resolve_system_prompt(
        [{"role": "user", "content": "Question?"}], "", None,
    )

    assert "clarifying question" in answer_prompt
    assert "clarifying question" not in default_prompt


@pytest.mark.asyncio
async def test_clarifications_never_push_a_full_debug_loop_past_the_reservation(monkeypatch):
    """Worst case: every question is answered AND PM fails every pass, so all
    MAX_DEBUG_ITERATIONS debug iterations run. The build must still end
    within its reservation -- clarifications only used headroom the debug
    loop could not need."""
    reserved = CREDITS_BEFORE_CLARIFY + 3 + SET_ASIDE  # exactly enough
    orchestrator, stubs = _make_orchestrator(monkeypatch, questions=["q1?", "q2?", "q3?"])

    async def _always_fail(*a, **kw):
        return {"passed": False, "issues": [{"severity": "high", "file": "a", "description": "bad"}]}

    orchestrator.pm.validate = _always_fail
    build, _, _ = await _run(orchestrator, _make_build(), reserved_credits=reserved)

    assert build.status == BuildStatus.FAILED
    assert build.debug_iterations == 3
    assert [m.status for m in build.agent_messages] == [AgentMessageStatus.ANSWERED] * 3
    assert build.credits_used == reserved

    # One credit less and the third question is refused rather than
    # overspending.
    orchestrator2, _ = _make_orchestrator(monkeypatch, questions=["q1?", "q2?", "q3?"])
    orchestrator2.pm.validate = _always_fail
    build2, _, _ = await _run(orchestrator2, _make_build(), reserved_credits=reserved - 1)
    assert [m.status for m in build2.agent_messages][-1] == AgentMessageStatus.REJECTED
    assert build2.credits_used <= reserved - 1


@pytest.mark.asyncio
async def test_delivery_marker_is_persisted_before_the_recipient_is_called():
    build = _make_build()
    snapshots = []

    async def emit(event):
        snapshots.append((event.type, [m.model_dump() for m in build.agent_messages]))

    async def responder(q, ctx):
        # By the time the (paid) call runs, an emit -- i.e. a persisted
        # build-document write in production -- has recorded the attempt.
        marker_writes = [
            msgs for t, msgs in snapshots
            if t == WSEventType.AGENT_PROGRESS and msgs[0]["delivery_attempts"] == 1
        ]
        assert marker_writes
        return "a"

    comms = InProcessAgentCommunication(
        build, emit, {"architect": responder},
        CommunicationPolicy(max_questions=3, credit_cost=1, credit_ceiling=None, timeout_seconds=1),
    )
    result = await comms.ask("developer", "architect", "q?", {})
    assert result["status"] == "answered"


@pytest.mark.asyncio
async def test_message_interrupted_mid_delivery_is_not_sent_again():
    """A PENDING message whose delivery had already started on a previous
    attempt may have been paid for at the provider: don't pay twice."""
    interrupted = AgentMessage(
        conversation_id="c1", sender="developer", recipient="architect",
        question="q?", delivery_attempts=1,
    )
    build = _make_build(agent_messages=[interrupted])
    called = []

    async def emit(_):
        pass

    async def responder(q, ctx):
        called.append(q)
        return "a"

    comms = InProcessAgentCommunication(
        build, emit, {"architect": responder},
        CommunicationPolicy(max_questions=3, credit_cost=1, credit_ceiling=None, timeout_seconds=1),
    )
    msg = await comms.resolve(build.agent_messages[0], {})

    assert called == []
    assert msg.status == AgentMessageStatus.FAILED
    assert msg.reason == "interrupted"
    assert build.credits_used == 0
