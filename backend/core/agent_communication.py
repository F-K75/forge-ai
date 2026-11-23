"""Agent-to-agent request/reply for the build pipeline.

Agents never call each other directly. The orchestrator builds one
``InProcessAgentCommunication`` per build and routes every message through
it. That object is the single place that decides:

* authorization -- default deny. Protocol v1 (the legacy flow) delivers only
  ``(sender, recipient)`` pairs in ``CommunicationPolicy.allowed_routes``;
  protocol v2 delivers only ``(sender, recipient, message_type)`` routes in
  ``CommunicationPolicy.routes``, and a message that expects a reply only to
  a recipient whose ``AGENT_CAPABILITIES`` entry says it answers that type
  and for which the orchestrator registered a responder;
* limits -- at most ``max_questions`` delivered messages per build;
* accounting -- each answered message adds ``credit_cost`` to
  ``build.credits_used`` (the same counter ``_start_agent`` charges and
  ``tasks/build_tasks.py`` settles against the upfront reservation), and is
  refused if that would push ``credits_used`` past ``credit_ceiling``;
* crash safety -- before invoking a recipient the message's
  ``delivery_attempts`` is bumped and persisted. If the worker dies after the
  provider call but before the answer is saved, the retried build sees the
  attempt and closes the message as ``failed``/``interrupted`` rather than
  silently paying for the same call a second time;
* timeouts -- a responder gets ``timeout_seconds`` (v2: never past the
  build's time budget) and the exchange is recorded as ``timeout`` instead
  of blocking the build;
* untrusted content (v2) -- content and answers are length-capped, cleaned
  and run through the moderation scan, with blocking lines redacted, before
  they are persisted, broadcast or shown to another agent;
* persistence/observability -- every exchange is an ``AgentMessage`` on
  ``build.agent_messages`` and is announced via ``emit``, whose callback in
  ``tasks/build_tasks.py`` writes the build document before broadcasting.
  The charge and the ANSWERED record therefore reach Mongo in the same
  write, so a resumed build that finds an ANSWERED message reuses it
  without re-asking or re-charging.

Every message goes through ``dispatch()``; ``ask``, ``send``,
``publish_finding`` and ``broadcast`` are typed wrappers around it, and
``submit``/``resolve`` are its two halves for batches. ``escalate`` and
``record_decision`` write the Escalations and Decisions lanes (v2), which
are orchestrator records rather than deliveries.

This is deliberately in-process: every agent of a build runs in the same
coroutine, so a request is just an awaited call. ``AgentCommunication`` is
the seam a broker-backed implementation would replace later.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, FrozenSet, Iterable, List, Optional, Tuple

from core import collaboration as collab
from core.collaboration import AGENT_CAPABILITIES, AgentCapability, REPLY_EXPECTED, Route
from core.models import (
    AgentMessage,
    AgentMessageState,
    AgentMessageStatus,
    AgentMessageType,
    BlackboardEntry,
    BlackboardEntryKind,
    Build,
    Escalation,
    MessageTransition,
    WSEvent,
    WSEventType,
    utcnow,
)

logger = logging.getLogger(__name__)

# (question, context) -> answer text. Raises on failure. A responder may
# also return {"answer": str, "token_usage": {...}, "provider_request_ids": [...]}.
Responder = Callable[[str, Dict[str, Any]], Awaitable[Any]]

# Statuses that mean the recipient was actually invoked (and so may have
# cost an LLM call) -- these count against max_questions.
_DELIVERED = collab.DELIVERED_STATUSES

DEFAULT_ALLOWED_ROUTES: FrozenSet[Tuple[str, str]] = frozenset({("developer", "architect")})

# Keys of a v1 agent_message_* payload. Legacy (flag-off) builds emit exactly
# these, as before protocol v2 existed.
_LEGACY_PAYLOAD_FIELDS = frozenset({
    "message_id", "conversation_id", "correlation_id", "sender", "recipient",
    "message_type", "question", "answer", "status", "reason", "credits_charged",
    "delivery_attempts", "delivery_started_at", "created_at", "resolved_at",
    "duration_ms",
})

def _is_fenced(exc: BaseException) -> bool:
    """An attempt that lost its lease must stop, not record a failure."""
    return type(exc).__name__ == "AttemptSuperseded"


# Below this much time left in the build's budget, a v2 message is not sent.
_MIN_DELIVERY_SECONDS = 1.0
_MAX_SUBJECT_CHARS = 200
_MAX_DETAIL_CHARS = 2000


@dataclass
class CommunicationPolicy:
    max_questions: int
    credit_cost: int
    # Highest build.credits_used an answered question may leave behind.
    # None means unmetered (BYOK): nothing is charged and only the question
    # limit applies.
    credit_ceiling: Optional[int]
    timeout_seconds: float
    allowed_routes: FrozenSet[Tuple[str, str]] = field(default_factory=lambda: DEFAULT_ALLOWED_ROUTES)
    max_question_chars: int = 1000
    # --- Collaboration protocol v2 ---
    protocol_version: int = 1
    # (sender, recipient, message_type) routes; consulted only for v2.
    routes: FrozenSet[Route] = frozenset()
    max_answer_chars: Optional[int] = None
    # time.monotonic() after which no v2 message is delivered.
    deadline: Optional[float] = None
    # A1 ledger builds: core.build_ledger.LedgerCommsHooks. Each
    # reply-expecting message is then its own ledger operation, authorized
    # out of the reservation's headroom and charged at W7 only for a
    # non-empty answer; ``credit_ceiling``/``credit_cost`` are not used.
    ledger: Optional[Any] = None

    @property
    def v2(self) -> bool:
        return self.protocol_version >= 2

    def can_afford(self, credits_used: int) -> bool:
        if self.ledger is not None:
            return self.ledger.can_afford()
        if self.credit_ceiling is None:
            return True
        return credits_used + self.credit_cost <= self.credit_ceiling

    def allows(self, sender: str, recipient: str, message_type: str) -> bool:
        if self.v2:
            return Route(sender, recipient, AgentMessageType(message_type).value) in self.routes
        return (sender, recipient) in self.allowed_routes


class AgentCommunication(ABC):
    """Transport-independent interface for agent-to-agent requests."""

    @abstractmethod
    async def ask(
        self,
        sender: str,
        recipient: str,
        question: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Deliver ``question`` from ``sender`` to ``recipient`` and wait for
        the reply. Never raises for routing/budget/timeout/responder
        failures: the returned dict (an ``AgentMessage``) carries ``status``
        and, when not answered, ``reason``."""


class InProcessAgentCommunication(AgentCommunication):
    def __init__(
        self,
        build: Build,
        emit: Callable[[WSEvent], Awaitable[None]],
        responders: Dict[str, Responder],
        policy: CommunicationPolicy,
        capabilities: Optional[Dict[str, AgentCapability]] = None,
        persist_lanes: Optional[Callable[[], Awaitable[Any]]] = None,
    ):
        self.build = build
        self.emit = emit
        self.responders = responders
        self.policy = policy
        self.capabilities = capabilities if capabilities is not None else AGENT_CAPABILITIES
        # Writes build.blackboard / build.escalations before a lane event is
        # broadcast (tasks/build_tasks.py's emit does not persist them).
        self.persist_lanes = persist_lanes

    # ------------------------------------------------------------------ #
    # The single delivery path
    # ------------------------------------------------------------------ #

    async def dispatch(
        self,
        sender: str,
        recipient: str,
        message_type: Any = AgentMessageType.CLARIFICATION,
        content: str = "",
        *,
        context: Optional[Dict[str, Any]] = None,
        subject: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        artifact_refs: Optional[List[str]] = None,
        parent_message_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        deliver: bool = True,
    ) -> AgentMessage:
        """Record a message (QUEUED, or REJECTED if it fails authorization
        or validation), announce it and, when ``deliver`` is set, deliver it
        now. ``sender`` is always the stage the orchestrator is running,
        never a value chosen by a model."""
        message = await self._record(
            sender, recipient, AgentMessageType(message_type), content,
            subject=subject, payload=payload, artifact_refs=artifact_refs,
            parent_message_id=parent_message_id, conversation_id=conversation_id,
        )
        if deliver and message.status == AgentMessageStatus.PENDING:
            await self.resolve(message, context or {})
        return message

    # ------------------------------------------------------------------ #
    # Typed wrappers
    # ------------------------------------------------------------------ #

    async def ask(
        self,
        sender: str,
        recipient: str,
        question: str,
        context: Dict[str, Any],
        conversation_id: Optional[str] = None,
        **options: Any,
    ) -> Dict[str, Any]:
        message = await self.dispatch(
            sender, recipient, AgentMessageType.CLARIFICATION, question,
            context=context, conversation_id=conversation_id, **options,
        )
        return message.model_dump(mode="json")

    async def send(
        self,
        sender: str,
        recipient: str,
        content: str,
        message_type: Any = AgentMessageType.INFORMATION,
        **options: Any,
    ) -> AgentMessage:
        """One-way message: delivered without invoking the recipient, never
        charged. Still needs a route."""
        return await self.dispatch(sender, recipient, message_type, content, **options)

    async def publish_finding(
        self,
        sender: str,
        recipient: str,
        content: str,
        payload: Optional[Dict[str, Any]] = None,
        **options: Any,
    ) -> AgentMessage:
        return await self.dispatch(
            sender, recipient, AgentMessageType.FINDING, content, payload=payload, **options,
        )

    async def broadcast(
        self,
        sender: str,
        recipients: Iterable[str],
        content: str,
        message_type: Any = AgentMessageType.INFORMATION,
        context: Optional[Dict[str, Any]] = None,
        **options: Any,
    ) -> List[AgentMessage]:
        """Fan-out under one conversation: one message per recipient, each
        authorized, limited and (if answered) charged on its own. The whole
        batch is recorded before any of it is delivered."""
        conversation_id = options.pop("conversation_id", None) or str(uuid.uuid4())
        messages = [
            await self.dispatch(
                sender, recipient, message_type, content,
                conversation_id=conversation_id, deliver=False, **options,
            )
            for recipient in recipients
        ]
        for message in messages:
            await self.resolve(message, context or {})
        return messages

    async def submit(
        self,
        sender: str,
        recipient: str,
        question: str,
        conversation_id: Optional[str] = None,
        **options: Any,
    ) -> AgentMessage:
        """Record a question without delivering it. Lets the orchestrator
        persist a whole batch before answering any of them, so a crash
        mid-batch loses no questions on resume."""
        message_type = options.pop("message_type", AgentMessageType.CLARIFICATION)
        return await self.dispatch(
            sender, recipient, message_type, question,
            conversation_id=conversation_id, deliver=False, **options,
        )

    # ------------------------------------------------------------------ #
    # Lanes (v2): Escalations and Decisions
    # ------------------------------------------------------------------ #

    async def escalate(
        self,
        raised_by: str,
        decision_owner: str,
        subject: str,
        detail: str,
        options: List[str],
        conflict: Optional[Dict[str, Any]] = None,
    ) -> Escalation:
        """Open an escalation. Escalations are opened by the orchestrator when
        it detects a disagreement; they are resolved by the decision owner or
        the user, not delivered as messages, so the route table does not
        apply to them."""
        detail, _ = await collab.screen_text(detail, _MAX_DETAIL_CHARS)
        cleaned = []
        for option in options:
            text, _ = await collab.screen_text(option, self._answer_cap())
            if text and not any(collab.same_value(text, o) for o in cleaned):
                cleaned.append(text)
        escalation = collab.open_escalation(
            self.build, raised_by, decision_owner, subject, detail, cleaned, conflict,
        )
        await self.publish_lanes(opened=[escalation])
        return escalation

    async def record_decision(
        self,
        key: str,
        value: str,
        owner_agent: str,
        rationale: str = "",
        source_message_id: Optional[str] = None,
        kind: BlackboardEntryKind = BlackboardEntryKind.DECISION,
    ) -> BlackboardEntry:
        """Add a new blackboard key. Raises if the key already has a value:
        conflicting values go through ``escalate``."""
        entry = collab.add_entry(
            self.build, key, value, owner_agent, rationale=rationale,
            source_message_id=source_message_id, kind=kind,
        )
        await self.publish_lanes(entries=[entry])
        return entry

    async def publish_lanes(
        self,
        entries: Iterable[BlackboardEntry] = (),
        opened: Iterable[Escalation] = (),
        resolved: Iterable[Escalation] = (),
    ) -> None:
        """Persist the lanes once, then announce each changed record. Callers
        make all related changes first so they reach Mongo in one write."""
        entries, opened, resolved = list(entries), list(opened), list(resolved)
        if self.persist_lanes is not None:
            await self.persist_lanes()
        for entry in entries:
            await self.emit(WSEvent(
                type=WSEventType.COLLAB_DECISION_RECORDED,
                build_id=self.build.id,
                data={"entry": entry.model_dump(mode="json")},
            ))
        for escalation in opened:
            await self.emit(WSEvent(
                type=WSEventType.COLLAB_ESCALATION_OPENED,
                build_id=self.build.id,
                data={"escalation": escalation.model_dump(mode="json")},
            ))
        for escalation in resolved:
            await self.emit(WSEvent(
                type=WSEventType.COLLAB_ESCALATION_RESOLVED,
                build_id=self.build.id,
                data={"escalation": escalation.model_dump(mode="json")},
            ))

    # ------------------------------------------------------------------ #
    # Delivery
    # ------------------------------------------------------------------ #

    async def resolve(self, message: AgentMessage, context: Dict[str, Any]) -> AgentMessage:
        """Deliver a PENDING message to its recipient and record the outcome."""
        if message.status != AgentMessageStatus.PENDING:
            return message

        ledger = self.policy.ledger
        if ledger is not None and message.delivery_attempts > 0:
            # A1: a message an earlier attempt dispatched. An answer
            # journaled before the crash is committed (charged once, no new
            # call); otherwise its operation is closed INTERRUPTED (§8.6) and
            # the message is closed below without re-sending it.
            journaled = await ledger.recover(message)
            if journaled:
                return await self._complete_answer(message, journaled, None)

        if self.delivered_count() >= self.policy.max_questions:
            reason = "message_limit" if self.policy.v2 else "question_limit"
            return await self._reject(message, reason)

        if self.policy.v2 and message.message_type.value not in REPLY_EXPECTED:
            # One-way: nothing to invoke, nothing to charge.
            self._close(message, AgentMessageState.COMPLETED)
            await self._emit_response(message)
            return message

        if not self.policy.can_afford(self.build.credits_used):
            return await self._reject(message, "budget_exhausted")

        if message.delivery_attempts > 0:
            # A previous attempt of this build invoked the recipient and then
            # died before recording the outcome. That call may already have
            # been paid for at the provider; don't pay for it twice.
            logger.warning(
                "Build %s: agent message %s was interrupted mid-delivery on a "
                "previous attempt; not re-sending it.",
                self.build.id, message.message_id,
            )
            self._close(message, AgentMessageState.INTERRUPTED, reason="interrupted")
            await self._emit_response(message)
            return message

        timeout = self.policy.timeout_seconds
        if self.policy.deadline is not None:
            timeout = min(timeout, self.policy.deadline - time.monotonic())
            if timeout < _MIN_DELIVERY_SECONDS:
                return await self._reject(message, "time_budget")

        if ledger is not None and await ledger.authorize(message) is None:
            # W1 refused (no headroom left after the mandatory worst case),
            # or an interrupted operation: no provider call.
            return await self._reject(message, "budget_exhausted")

        message.delivery_attempts += 1
        message.delivery_started_at = utcnow()
        message.set_state(AgentMessageState.DISPATCHED)
        # emit() persists the build document (tasks/build_tasks.py) before
        # broadcasting, so this is the durable "call in flight" marker.
        await self.emit(WSEvent(
            type=WSEventType.AGENT_PROGRESS,
            build_id=self.build.id,
            data={
                "agent": message.recipient,
                "message": f"Answering {message.sender}'s question",
                "message_id": message.message_id,
            },
        ))

        responder = self.responders[message.recipient]
        call_context = context
        if self.policy.v2:
            call_context = dict(context, asker=message.sender, message_id=message.message_id,
                                message_type=message.message_type.value)
        started = time.monotonic()
        scope = ledger.scope(message) if ledger is not None else contextlib.nullcontext()
        try:
            with scope:
                reply = await asyncio.wait_for(responder(message.question, call_context), timeout=timeout)
        except asyncio.TimeoutError:
            if ledger is not None:
                await ledger.fail(message, "timeout")
            self._close(message, AgentMessageState.TIMED_OUT, reason="timeout", started=started)
            await self._emit_response(message)
            return message
        except Exception as exc:  # responder failure must not fail the build
            if ledger is not None:
                if _is_fenced(exc):
                    raise
                await ledger.fail(message, "responder_error")
            logger.warning(
                "Build %s: %s failed to answer %s's question: %s",
                self.build.id, message.recipient, message.sender, exc,
            )
            self._close(message, AgentMessageState.FAILED, reason=str(exc)[:300] or type(exc).__name__, started=started)
            await self._emit_response(message)
            return message

        answer = self._unpack_reply(message, reply)
        if self.policy.v2:
            answer, moderation = await collab.screen_text(answer, self._answer_cap())
            if moderation:
                message.payload["answer_moderation"] = moderation
        else:
            answer = (answer or "").strip()
        if not answer:
            if ledger is not None:
                await ledger.fail(message, "empty_answer")
            self._close(message, AgentMessageState.FAILED, reason="empty_answer", started=started)
            await self._emit_response(message)
            return message

        if ledger is not None:
            await ledger.journal(message, answer)
        return await self._complete_answer(message, answer, started)

    async def _complete_answer(self, message: AgentMessage, answer: str, started: Optional[float]) -> AgentMessage:
        """Record an answered message and charge it: on a ledger build in the
        W7 write of its operation (with the message itself), otherwise on
        ``build.credits_used`` as before."""
        ledger = self.policy.ledger
        message.answer = answer
        if ledger is not None:
            message.credits_charged = ledger.charge(message)
            self._close(message, AgentMessageState.COMPLETED, started=started)
            message.credits_charged = await ledger.commit(message)
        else:
            cost = 0 if self.policy.credit_ceiling is None else self.policy.credit_cost
            message.credits_charged = cost
            self.build.credits_used += cost
            self._close(message, AgentMessageState.COMPLETED, started=started)
        await self._emit_response(message)
        return message

    def delivered_count(self) -> int:
        return sum(1 for m in self.build.agent_messages if m.status in _DELIVERED)

    def messages_between(self, sender: str, recipient: str) -> list[AgentMessage]:
        return [m for m in self.build.agent_messages if m.sender == sender and m.recipient == recipient]

    def messages_from(self, sender: str, message_type: Any = AgentMessageType.CLARIFICATION, protocol_version: int = 2) -> list[AgentMessage]:
        message_type = AgentMessageType(message_type)
        return [
            m for m in self.build.agent_messages
            if m.sender == sender and m.message_type == message_type and m.protocol_version >= protocol_version
        ]

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #

    async def _record(
        self,
        sender: str,
        recipient: str,
        message_type: AgentMessageType,
        content: str,
        *,
        subject: Optional[str],
        payload: Optional[Dict[str, Any]],
        artifact_refs: Optional[List[str]],
        parent_message_id: Optional[str],
        conversation_id: Optional[str],
    ) -> AgentMessage:
        moderation = None
        if self.policy.v2:
            content, moderation = await collab.screen_text(content, self.policy.max_question_chars)
        else:
            content = (content or "").strip()[: self.policy.max_question_chars]
        message = AgentMessage(
            conversation_id=conversation_id or str(uuid.uuid4()),
            sender=sender,
            recipient=recipient,
            message_type=message_type,
            question=content,
            content=content,
        )
        message.correlation_id = message.message_id
        message.transitions.append(MessageTransition(state=AgentMessageState.QUEUED))
        if self.policy.v2:
            message.protocol_version = collab.PROTOCOL_VERSION
            message.lane = collab.lane_for(message_type)
            message.subject = collab.clean_text(subject, _MAX_SUBJECT_CHARS) or None
            message.payload = dict(payload or {})
            if moderation:
                message.payload["moderation"] = moderation
            message.artifact_refs = list(artifact_refs or [])
            message.parent_message_id = parent_message_id
        self.build.agent_messages.append(message)

        denied = self._authorization_failure(message)
        if denied:
            logger.warning(
                "Build %s: rejected agent message %s -> %s (%s, %s)",
                self.build.id, sender, recipient, message_type.value, denied,
            )
            return await self._reject(message, denied)
        if not content:
            return await self._reject(message, "invalid_question")

        await self.emit(WSEvent(
            type=WSEventType.AGENT_MESSAGE_REQUEST,
            build_id=self.build.id,
            data=self._event_payload(message),
        ))
        return message

    def _authorization_failure(self, message: AgentMessage) -> Optional[str]:
        sender, recipient, message_type = message.sender, message.recipient, message.message_type.value
        if not self.policy.allows(sender, recipient, message_type):
            return "route_not_allowed"
        if self.policy.v2:
            if message_type not in REPLY_EXPECTED:
                return None
            capability = self.capabilities.get(recipient)
            if (
                capability is None
                or not capability.routable
                or message_type not in capability.answers
                or recipient not in self.responders
            ):
                return "route_not_allowed"
            return None
        if recipient not in self.responders:
            return "route_not_allowed"
        return None

    def _answer_cap(self) -> int:
        return int(self.policy.max_answer_chars or 2000)

    @staticmethod
    def _unpack_reply(message: AgentMessage, reply: Any) -> str:
        if isinstance(reply, dict):
            usage = reply.get("token_usage")
            if isinstance(usage, dict):
                message.token_usage = {k: int(v) for k, v in usage.items() if isinstance(v, (int, float))}
            ids = reply.get("provider_request_ids")
            if isinstance(ids, (list, tuple)):
                message.provider_request_ids = [str(i) for i in ids if i]
            reply = reply.get("answer")
        return reply if isinstance(reply, str) else ("" if reply is None else str(reply))

    async def _reject(self, message: AgentMessage, reason: str) -> AgentMessage:
        self._close(message, AgentMessageState.REJECTED, reason=reason)
        await self._emit_response(message)
        return message

    def _close(
        self,
        message: AgentMessage,
        state: AgentMessageState,
        reason: Optional[str] = None,
        started: Optional[float] = None,
    ) -> None:
        message.set_state(state, reason=reason)
        message.reason = reason
        message.resolved_at = utcnow()
        if started is not None:
            message.duration_ms = int((time.monotonic() - started) * 1000)

    async def _emit_response(self, message: AgentMessage) -> None:
        await self.emit(WSEvent(
            type=WSEventType.AGENT_MESSAGE_RESPONSE,
            build_id=self.build.id,
            data=self._event_payload(message),
        ))

    def _event_payload(self, message: AgentMessage) -> Dict[str, Any]:
        if message.protocol_version >= 2:
            payload = message.model_dump(mode="json")
            payload["protocol_version"] = collab.PROTOCOL_VERSION
        else:
            payload = message.model_dump(mode="json", include=set(_LEGACY_PAYLOAD_FIELDS))
        payload["credits_used"] = self.build.credits_used
        return payload
