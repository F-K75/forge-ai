"""Agent-to-agent request/reply for the build pipeline.

Agents never call each other directly. The orchestrator builds one
``InProcessAgentCommunication`` per build and routes every question through
it. That object is the single place that decides:

* authorization -- only routes in ``CommunicationPolicy.allowed_routes`` are
  delivered, and only to a recipient the orchestrator registered a
  responder for;
* limits -- at most ``max_questions`` delivered questions per build;
* accounting -- each answered question adds ``credit_cost`` to
  ``build.credits_used`` (the same counter ``_start_agent`` charges and
  ``tasks/build_tasks.py`` settles against the upfront reservation), and is
  refused if that would push ``credits_used`` past ``credit_ceiling``;
* crash safety -- before invoking a recipient the message's
  ``delivery_attempts`` is bumped and persisted. If the worker dies after the
  provider call but before the answer is saved, the retried build sees the
  attempt and closes the message as ``failed``/``interrupted`` rather than
  silently paying for the same call a second time;
* timeouts -- a responder gets ``timeout_seconds`` and the exchange is
  recorded as ``timeout`` instead of blocking the build;
* persistence/observability -- every exchange is an ``AgentMessage`` on
  ``build.agent_messages`` and is announced via ``emit``, whose callback in
  ``tasks/build_tasks.py`` writes the build document before broadcasting.
  The charge and the ANSWERED record therefore reach Mongo in the same
  write, so a resumed build that finds an ANSWERED message reuses it
  without re-asking or re-charging.

This is deliberately in-process: every agent of a build runs in the same
coroutine, so a request is just an awaited call. ``AgentCommunication`` is
the seam a broker-backed implementation would replace later.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, FrozenSet, Optional, Tuple

from core.models import (
    AgentMessage,
    AgentMessageStatus,
    Build,
    WSEvent,
    WSEventType,
    utcnow,
)

logger = logging.getLogger(__name__)

# (question, context) -> answer text. Raises on failure.
Responder = Callable[[str, Dict[str, Any]], Awaitable[str]]

# Statuses that mean the recipient was actually invoked (and so may have
# cost an LLM call) -- these count against max_questions.
_DELIVERED = {AgentMessageStatus.ANSWERED, AgentMessageStatus.TIMEOUT, AgentMessageStatus.FAILED}

DEFAULT_ALLOWED_ROUTES: FrozenSet[Tuple[str, str]] = frozenset({("developer", "architect")})


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

    def can_afford(self, credits_used: int) -> bool:
        if self.credit_ceiling is None:
            return True
        return credits_used + self.credit_cost <= self.credit_ceiling


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
    ):
        self.build = build
        self.emit = emit
        self.responders = responders
        self.policy = policy

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    async def ask(
        self,
        sender: str,
        recipient: str,
        question: str,
        context: Dict[str, Any],
        conversation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        message = await self.submit(sender, recipient, question, conversation_id=conversation_id)
        if message.status == AgentMessageStatus.PENDING:
            await self.resolve(message, context)
        return message.model_dump(mode="json")

    async def submit(
        self,
        sender: str,
        recipient: str,
        question: str,
        conversation_id: Optional[str] = None,
    ) -> AgentMessage:
        """Record a question as PENDING (or REJECTED if it fails
        authorization/validation) and announce it, without delivering it.
        Lets the orchestrator persist a whole batch before answering any of
        them, so a crash mid-batch loses no questions on resume."""
        question = (question or "").strip()
        message = AgentMessage(
            conversation_id=conversation_id or str(uuid.uuid4()),
            sender=sender,
            recipient=recipient,
            question=question[: self.policy.max_question_chars],
        )
        message.correlation_id = message.message_id
        self.build.agent_messages.append(message)

        if (sender, recipient) not in self.policy.allowed_routes or recipient not in self.responders:
            self._close(message, AgentMessageStatus.REJECTED, reason="route_not_allowed")
            logger.warning(
                "Build %s: rejected agent message %s -> %s (route not allowed)",
                self.build.id, sender, recipient,
            )
            await self._emit_response(message)
            return message
        if not question:
            self._close(message, AgentMessageStatus.REJECTED, reason="invalid_question")
            await self._emit_response(message)
            return message

        await self.emit(WSEvent(
            type=WSEventType.AGENT_MESSAGE_REQUEST,
            build_id=self.build.id,
            data=self._event_payload(message),
        ))
        return message

    async def resolve(self, message: AgentMessage, context: Dict[str, Any]) -> AgentMessage:
        """Deliver a PENDING message to its recipient and record the outcome."""
        if message.status != AgentMessageStatus.PENDING:
            return message

        if self.delivered_count() >= self.policy.max_questions:
            self._close(message, AgentMessageStatus.REJECTED, reason="question_limit")
            await self._emit_response(message)
            return message

        if not self.policy.can_afford(self.build.credits_used):
            self._close(message, AgentMessageStatus.REJECTED, reason="budget_exhausted")
            await self._emit_response(message)
            return message

        if message.delivery_attempts > 0:
            # A previous attempt of this build invoked the recipient and then
            # died before recording the outcome. That call may already have
            # been paid for at the provider; don't pay for it twice.
            logger.warning(
                "Build %s: agent message %s was interrupted mid-delivery on a "
                "previous attempt; not re-sending it.",
                self.build.id, message.message_id,
            )
            self._close(message, AgentMessageStatus.FAILED, reason="interrupted")
            await self._emit_response(message)
            return message

        message.delivery_attempts += 1
        message.delivery_started_at = utcnow()
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
        started = time.monotonic()
        try:
            answer = await asyncio.wait_for(
                responder(message.question, context),
                timeout=self.policy.timeout_seconds,
            )
        except asyncio.TimeoutError:
            self._close(message, AgentMessageStatus.TIMEOUT, reason="timeout", started=started)
            await self._emit_response(message)
            return message
        except Exception as exc:  # responder failure must not fail the build
            logger.warning(
                "Build %s: %s failed to answer %s's question: %s",
                self.build.id, message.recipient, message.sender, exc,
            )
            self._close(message, AgentMessageStatus.FAILED, reason=str(exc)[:300] or type(exc).__name__, started=started)
            await self._emit_response(message)
            return message

        answer = (answer or "").strip()
        if not answer:
            self._close(message, AgentMessageStatus.FAILED, reason="empty_answer", started=started)
            await self._emit_response(message)
            return message

        cost = 0 if self.policy.credit_ceiling is None else self.policy.credit_cost
        message.answer = answer
        message.credits_charged = cost
        self.build.credits_used += cost
        self._close(message, AgentMessageStatus.ANSWERED, started=started)
        await self._emit_response(message)
        return message

    def delivered_count(self) -> int:
        return sum(1 for m in self.build.agent_messages if m.status in _DELIVERED)

    def messages_between(self, sender: str, recipient: str) -> list[AgentMessage]:
        return [m for m in self.build.agent_messages if m.sender == sender and m.recipient == recipient]

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #

    def _close(
        self,
        message: AgentMessage,
        status: AgentMessageStatus,
        reason: Optional[str] = None,
        started: Optional[float] = None,
    ) -> None:
        message.status = status
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
        payload = message.model_dump(mode="json")
        payload["credits_used"] = self.build.credits_used
        return payload
