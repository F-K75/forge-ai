"""Team Chat: the persistent communication layer between agents (and humans)
in a project's engineering org.

Agents post typed messages -- comments, questions, review requests,
approvals/rejections, escalations, delegations, shared findings -- instead of
communicating through side channels. Every message is stored and threaded so
a human can inspect the conversation history later, and so a future PR
workflow has somewhere real to route "request review" / "approve" actions
through.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from core.database import get_db

from .registry import AgentRegistry, get_agent_registry

MESSAGE_COLLECTION = "team_messages"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class MessageType(str, Enum):
    COMMENT = "comment"
    QUESTION = "question"
    REVIEW_REQUEST = "review_request"
    APPROVAL = "approval"
    REJECTION = "rejection"
    ESCALATION = "escalation"
    DELEGATION = "delegation"
    FINDING = "finding"


class TeamMessage(BaseModel):
    id: str = Field(default_factory=lambda: _new_id("msg"))
    project_id: str
    thread_id: str = Field(default_factory=lambda: _new_id("thread"))
    reply_to_id: Optional[str] = None
    message_type: MessageType = MessageType.COMMENT
    from_agent_id: str
    to_agent_ids: List[str] = Field(default_factory=list)
    content: str
    # Optional grounding -- file paths, a build_id, a decision reference --
    # so a message can point at the thing it's actually about.
    context: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=_now)


class UnknownAgent(Exception):
    pass


class TeamChatRepository:
    async def save_message(self, message: TeamMessage) -> None:
        db = await get_db()
        await db[MESSAGE_COLLECTION].update_one(
            {"id": message.id}, {"$set": message.model_dump()}, upsert=True
        )

    async def get_message(self, project_id: str, message_id: str) -> Optional[TeamMessage]:
        db = await get_db()
        doc = await db[MESSAGE_COLLECTION].find_one(
            {"id": message_id, "project_id": project_id}, {"_id": 0}
        )
        return TeamMessage(**doc) if doc else None

    async def list_messages(
        self,
        project_id: str,
        *,
        thread_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[TeamMessage]:
        db = await get_db()
        query: Dict[str, Any] = {"project_id": project_id}
        if thread_id:
            query["thread_id"] = thread_id
        if agent_id:
            query["$or"] = [{"from_agent_id": agent_id}, {"to_agent_ids": agent_id}]

        cursor = db[MESSAGE_COLLECTION].find(query, {"_id": 0}).sort("created_at", 1).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [TeamMessage(**d) for d in docs]


class TeamChat:
    def __init__(self, registry: Optional[AgentRegistry] = None, repo: Optional[TeamChatRepository] = None):
        self._registry = registry or get_agent_registry()
        self._repo = repo or TeamChatRepository()

    async def _assert_known_agent(self, project_id: str, agent_id: str) -> None:
        await self._registry.get_agent(project_id, agent_id)

    async def post(
        self,
        project_id: str,
        from_agent_id: str,
        content: str,
        *,
        message_type: MessageType = MessageType.COMMENT,
        to_agent_ids: Optional[List[str]] = None,
        thread_id: Optional[str] = None,
        reply_to_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> TeamMessage:
        """Post a message from one registered agent to zero or more others.
        Raises UnknownAgent if from_agent_id (or any recipient) isn't a real
        agent in this project's org -- chat is between real team members,
        not free-floating identities."""
        try:
            await self._assert_known_agent(project_id, from_agent_id)
            for to_id in to_agent_ids or []:
                await self._assert_known_agent(project_id, to_id)
        except Exception as exc:
            raise UnknownAgent(str(exc)) from exc

        # Replies inherit their parent's thread so a conversation stays
        # together even if the caller doesn't pass thread_id explicitly.
        if reply_to_id and not thread_id:
            parent = await self._repo.get_message(project_id, reply_to_id)
            thread_id = parent.thread_id if parent else None

        kwargs: Dict[str, Any] = dict(
            project_id=project_id,
            from_agent_id=from_agent_id,
            to_agent_ids=to_agent_ids or [],
            message_type=message_type,
            content=content,
            reply_to_id=reply_to_id,
            context=context or {},
        )
        if thread_id:
            kwargs["thread_id"] = thread_id
        message = TeamMessage(**kwargs)
        await self._repo.save_message(message)

        # Best-effort real-time push -- a Redis/WS hiccup must never break
        # posting a chat message.
        try:
            from agent_registry.ws_events import OrgEvent, OrgEventType
            from services.org_ws_manager import get_org_manager

            await get_org_manager().emit(
                OrgEvent(
                    type=OrgEventType.MESSAGE_POSTED,
                    project_id=project_id,
                    data={
                        "message_id": message.id,
                        "from_agent_id": message.from_agent_id,
                        "message_type": message.message_type.value,
                        "content": message.content[:200],
                    },
                )
            )
        except Exception:
            pass

        return message

    async def list_messages(
        self, project_id: str, *, thread_id: Optional[str] = None,
        agent_id: Optional[str] = None, limit: int = 100,
    ) -> List[TeamMessage]:
        return await self._repo.list_messages(project_id, thread_id=thread_id, agent_id=agent_id, limit=limit)


_team_chat: Optional[TeamChat] = None


def get_team_chat() -> TeamChat:
    global _team_chat
    if _team_chat is None:
        _team_chat = TeamChat()
    return _team_chat
