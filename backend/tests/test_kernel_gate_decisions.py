"""API tests for human-in-the-loop governance gate decisions.

`POST /v1/projects/{project_id}/kernel/runs/{run_id}/gates/{gate_id}/{approve|reject}`

A real `AgentKernel` executes a run that pauses at a pre-delivery approval gate;
the API is driven through `httpx.ASGITransport` on the same event loop so the
decision actually wakes the paused run. MongoDB is replaced by in-memory fakes.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import pytest
from fastapi import APIRouter, FastAPI

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api.kernel as kernel_module  # noqa: E402
from api.auth import get_current_user  # noqa: E402
from core.agent_kernel import (  # noqa: E402
    AgentKernel,
    KernelExecutionConfig,
    KernelRun,
    KernelRunStatus,
    KernelTask,
)
from core.models import User  # noqa: E402

PROJECT_ID = "proj_gates"
ORG_ID = "org_gates"
OWNER_ID = "user-owner"


class FakeCollection:
    def __init__(self, docs=None):
        self.docs: List[Dict[str, Any]] = list(docs or [])

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


class FakeDB:
    def __init__(self):
        self.projects = FakeCollection(
            [
                {"id": PROJECT_ID, "user_id": OWNER_ID, "org_id": ORG_ID, "deleted_at": None},
                {"id": "proj_foreign", "user_id": "someone-else", "deleted_at": None},
            ]
        )
        self.team_members = FakeCollection(
            [
                {"org_id": ORG_ID, "user_id": "user-admin", "role": "admin"},
                {"org_id": ORG_ID, "user_id": "user-member", "role": "member"},
                {"org_id": ORG_ID, "user_id": "user-viewer", "role": "viewer"},
            ]
        )
        self.audit_logs = FakeCollection()


class FakeRepo:
    """Stands in for the Mongo run repository; `runs` mirrors save-on-start/finish."""

    def __init__(self):
        self.docs: Dict[str, Dict[str, Any]] = {}
        self.runs: Dict[str, KernelRun] = {}

    async def get(self, project_id: str, run_id: str) -> Optional[Dict[str, Any]]:
        doc = self.runs[run_id].to_dict() if run_id in self.runs else self.docs.get(run_id)
        if doc and doc.get("project_id") == project_id:
            return dict(doc)
        return None


def _user(user_id: str) -> User:
    return User(id=user_id, email=f"{user_id}@forge.test", name=user_id)


class Harness:
    def __init__(self, monkeypatch):
        self.db = FakeDB()
        self.repo = FakeRepo()
        self.kernel = AgentKernel(task_executor=self._exec)
        self.current_user = _user(OWNER_ID)
        self._exec_tasks: List[asyncio.Task] = []

        async def _get_db():
            return self.db

        monkeypatch.setattr(kernel_module, "get_db", _get_db)
        monkeypatch.setattr(kernel_module, "get_agent_kernel", lambda: self.kernel)
        monkeypatch.setattr(kernel_module, "get_kernel_run_repository", lambda: self.repo)

        app = FastAPI()
        v1 = APIRouter(prefix="/v1")
        v1.include_router(kernel_module.router)
        app.include_router(v1)
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://forge.test"
        )

    @staticmethod
    async def _exec(task: KernelTask, _ctx, _dctx):
        return {"summary": f"{task.role} delivered.", "touched_files": [f"src/{task.id}.py"]}

    def as_user(self, user_id: str) -> None:
        self.current_user = _user(user_id)

    async def start_paused_run(self, run_id: str = "krun_gate") -> tuple[KernelRun, str, asyncio.Task]:
        run = KernelRun(
            id=run_id,
            project_id=PROJECT_ID,
            objective="Ship billing feature",
            tasks=[
                KernelTask("t_be", "Build API", "backend_engineer", "engineering", "API"),
                KernelTask(
                    "t_rel", "Deploy release", "release_manager", "delivery", "Deploy",
                    depends_on=["t_be"],
                ),
            ],
            config=KernelExecutionConfig(
                require_delivery_approval=True, approval_timeout_seconds=10.0
            ),
        )
        gate_seen = asyncio.Event()
        gate_ids: List[str] = []

        async def sink(event_name: str, payload: Dict[str, Any]) -> None:
            if event_name == "kernel_approval_required":
                gate_ids.append(payload["gate"]["gate_id"])
                gate_seen.set()

        self.repo.runs[run.id] = run
        task = asyncio.create_task(self.kernel.execute_run(run, event_sink=sink))
        self._exec_tasks.append(task)
        await asyncio.wait_for(gate_seen.wait(), timeout=3.0)
        assert run.status == KernelRunStatus.WAITING_APPROVAL
        return run, gate_ids[0], task

    def url(self, run_id: str, gate_id: str, action: str, project_id: str = PROJECT_ID) -> str:
        return f"/v1/projects/{project_id}/kernel/runs/{run_id}/gates/{gate_id}/{action}"

    def audit(self, action: Optional[str] = None) -> List[Dict[str, Any]]:
        return [a for a in self.db.audit_logs.docs if action is None or a["action"] == action]

    async def close(self) -> None:
        for t in self._exec_tasks:
            if not t.done():
                t.cancel()
        await asyncio.gather(*self._exec_tasks, return_exceptions=True)
        await self.client.aclose()


@pytest.fixture
async def h(monkeypatch):
    harness = Harness(monkeypatch)
    try:
        yield harness
    finally:
        await harness.close()


async def test_approve_resolves_gate_resumes_run_and_audits(h):
    run, gate_id, task = await h.start_paused_run()

    resp = await h.client.post(h.url(run.id, gate_id, "approve"), json={"note": "LGTM"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["idempotent"] is False
    assert body["gate"]["status"] == "approved"
    assert body["gate"]["decided_by"] == f"{OWNER_ID}@forge.test"
    assert body["gate"]["note"] == "LGTM"

    result = await asyncio.wait_for(task, timeout=3.0)
    assert result.status == KernelRunStatus.COMPLETED

    entries = h.audit("kernel.gate.approved")
    assert len(entries) == 1
    assert entries[0]["resource_type"] == "kernel_gate"
    assert entries[0]["resource_id"] == gate_id
    assert entries[0]["actor_id"] == OWNER_ID
    assert entries[0]["changes"]["run_id"] == run.id
    assert entries[0]["changes"]["decision"] == "approved"


async def test_reject_halts_downstream_and_audits(h):
    h.as_user("user-admin")  # org admins may decide gates on shared projects
    run, gate_id, task = await h.start_paused_run()

    resp = await h.client.post(h.url(run.id, gate_id, "reject"), json={"note": "Not ready"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["gate"]["status"] == "rejected"

    result = await asyncio.wait_for(task, timeout=3.0)
    assert result.status != KernelRunStatus.COMPLETED
    release = next(t for t in result.tasks if t.id == "t_rel")
    assert release.status.value != "completed"
    assert len(h.audit("kernel.gate.rejected")) == 1


@pytest.mark.parametrize("user_id", ["user-member", "user-viewer"])
async def test_member_and_viewer_cannot_decide_and_attempt_is_audited(h, user_id):
    run, gate_id, _task = await h.start_paused_run()
    h.as_user(user_id)

    resp = await h.client.post(h.url(run.id, gate_id, "approve"), json={"note": ""})
    assert resp.status_code == 403
    # The gate is untouched and still pending
    assert run.approval_gates[0]["status"] == "pending"
    denied = h.audit("kernel.gate.decision_denied")
    assert len(denied) == 1 and denied[0]["actor_id"] == user_id
    assert h.audit("kernel.gate.approved") == []


async def test_user_without_project_access_gets_404(h):
    run, gate_id, _task = await h.start_paused_run()
    h.as_user("outsider")

    resp = await h.client.post(h.url(run.id, gate_id, "approve"), json={"note": ""})
    assert resp.status_code == 404
    assert run.approval_gates[0]["status"] == "pending"

    # A foreign project's id cannot be used to reach this run either.
    h.as_user("someone-else")
    resp = await h.client.post(
        h.url(run.id, gate_id, "approve", project_id="proj_foreign"), json={"note": ""}
    )
    assert resp.status_code == 404
    assert run.approval_gates[0]["status"] == "pending"


async def test_unauthenticated_request_is_rejected(h, monkeypatch):
    # Drop the auth override so the real dependency runs without a token.
    app = h.client._transport.app  # type: ignore[attr-defined]
    app.dependency_overrides.clear()
    resp = await h.client.post(h.url("krun_x", "gate_x", "approve"), json={"note": ""})
    assert resp.status_code in (401, 403)


async def test_repeat_same_decision_is_idempotent(h):
    run, gate_id, task = await h.start_paused_run()

    first = await h.client.post(h.url(run.id, gate_id, "approve"), json={"note": "ok"})
    assert first.status_code == 200
    second = await h.client.post(h.url(run.id, gate_id, "approve"), json={"note": "ok"})
    assert second.status_code == 200, second.text
    assert second.json()["idempotent"] is True
    assert second.json()["gate"]["status"] == "approved"
    # Exactly one decision was recorded.
    assert len(h.audit("kernel.gate.approved")) == 1

    await asyncio.wait_for(task, timeout=3.0)
    # Still idempotent after the run finished and left the active set (persisted snapshot).
    assert h.kernel.get_active_run(run.id) is None
    third = await h.client.post(h.url(run.id, gate_id, "approve"), json={"note": "ok"})
    assert third.status_code == 200
    assert third.json()["idempotent"] is True


async def test_conflicting_decision_on_resolved_gate_is_409(h):
    run, gate_id, task = await h.start_paused_run()

    ok = await h.client.post(h.url(run.id, gate_id, "approve"), json={"note": ""})
    assert ok.status_code == 200
    conflict = await h.client.post(h.url(run.id, gate_id, "reject"), json={"note": ""})
    assert conflict.status_code == 409
    assert "already approved" in conflict.json()["detail"]

    # A different approver repeating the decision is also not a silent overwrite.
    h.as_user("user-admin")
    other = await h.client.post(h.url(run.id, gate_id, "approve"), json={"note": ""})
    assert other.status_code == 409

    await asyncio.wait_for(task, timeout=3.0)
    assert run.approval_gates[0]["status"] == "approved"
    assert len(h.audit("kernel.gate.rejected")) == 0


async def test_pending_gate_on_non_executing_run_is_409(h):
    # Persisted snapshot with a pending gate but no live waiter (e.g. after a restart).
    h.repo.docs["krun_stale"] = {
        "id": "krun_stale",
        "project_id": PROJECT_ID,
        "approval_gates": [{"gate_id": "gate_stale", "status": "pending", "gate_name": "x"}],
    }
    resp = await h.client.post(h.url("krun_stale", "gate_stale", "approve"), json={"note": ""})
    assert resp.status_code == 409
    assert h.audit("kernel.gate.approved") == []


async def test_unknown_gate_and_unknown_run_are_404(h):
    run, _gate_id, _task = await h.start_paused_run()

    resp = await h.client.post(h.url(run.id, "gate_nope", "approve"), json={"note": ""})
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Approval gate not found"

    resp = await h.client.post(h.url("krun_missing", "gate_nope", "reject"), json={"note": ""})
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Kernel run not found"

    # Malformed gate ids never reach the kernel.
    resp = await h.client.post(h.url(run.id, "..%2Fetc", "approve"), json={"note": ""})
    assert resp.status_code in (404, 422)
    assert run.approval_gates[0]["status"] == "pending"
