"""A stub-agent harness for ledger builds: the real Celery task
(``tasks.build_tasks.run_build``), the real orchestrator, ledger,
transactions and reservation formula, on ``LedgerFakeDB``, with plain stub
agents whose outcomes a ``Script`` decides. No gateway, so one build takes
milliseconds; test_usage_attribution-style tests that need ``ai_usage`` rows
use A2's gateway-backed ``StubBuildHarness`` instead.

``WorkerCrash`` is a ``BaseException``: it escapes every ``except
Exception`` in the pipeline, like a worker dying mid-call, so nothing is
written after it. ``resume()`` then expires the lease (as the sweeper's
wait would) and runs the task again.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Callable, Dict, List, Optional

from core import credit_ledger
from core.credit_ledger import FundingSource
from core.models import utcnow
from core.pricing import quote_from_settings
from tests.a1_support import LedgerFakeDB, patch_ledger_infra, set_flags


class WorkerCrash(BaseException):
    """The worker process died here."""


class Retry(Exception):
    """Stands in for celery.exceptions.Retry."""

    def __init__(self, exc=None, countdown=None):
        self.exc, self.countdown = exc, countdown
        super().__init__(f"retry: {exc!r}")


@dataclass
class Script:
    """What each stub agent does. ``failures[stage]`` is a list consumed one
    per call: an exception instance to raise, ``"crash"`` for a
    WorkerCrash, or None for normal behaviour."""

    integrations: bool = True
    clarifications: List[str] = field(default_factory=list)
    pass_at: Optional[int] = 0
    debug_usable: List[bool] = field(default_factory=list)
    failures: Dict[str, List[Any]] = field(default_factory=dict)
    developer_files: Optional[Dict[str, str]] = None
    on_call: Optional[Callable[[str], None]] = None
    calls: List[str] = field(default_factory=list)
    pm_calls: int = 0
    debug_calls: int = 0
    crashed_answers: set = field(default_factory=set)

    def hit(self, stage: str):
        self.calls.append(stage)
        if self.on_call:
            self.on_call(stage)
        queue = self.failures.get(stage)
        if queue:
            action = queue.pop(0)
            if action == "crash":
                raise WorkerCrash(stage)
            if isinstance(action, BaseException):
                raise action


def make_stub_agents(script: Script):
    class Architect:
        async def clarify(self, *a, **k):
            script.hit("architect_clarify")
            return []

        async def blueprint(self, *a, **k):
            script.hit("architect")
            return {"app_name": "todo", "features": ["tasks"],
                    "integrations": ["stripe"] if script.integrations else []}

        async def answer(self, question, *a, **k):
            index = int(question.rsplit("#", 1)[1])
            script.hit(f"answer#{index}")
            outcome = script.clarifications[index]
            if outcome == "failed":
                raise RuntimeError("architect failed to answer")
            if outcome == "timed_out":
                raise asyncio.TimeoutError()
            if outcome == "interrupted":
                if index not in script.crashed_answers:
                    script.crashed_answers.add(index)
                    raise WorkerCrash(f"answer#{index}")
                raise AssertionError("an interrupted message must never be re-sent")
            return f"Answer {index}"

    class BusinessModel:
        async def improve(self, *a, **k):
            script.hit("business_model")
            return {"summary": "ok"}

    class Designer:
        async def design(self, *a, **k):
            script.hit("designer")
            return {"theme": "default"}

        async def identify_questions(self, *a, **k):
            return []

        async def answer(self, question, *a, **k):
            return await Architect().answer(question, *a, **k)

    class Developer:
        async def identify_questions(self, *a, **k):
            script.hit("question_pass")
            return [f"Question #{i}" for i in range(len(script.clarifications))]

        async def generate_files(self, *a, stream_callback=None, **k):
            script.hit("developer")
            if stream_callback:
                await stream_callback("{")
            return {"files": dict(script.developer_files if script.developer_files is not None
                                  else {"main.py": "print('v1')"})}

        async def patch_files(self, files, *a, **k):
            script.debug_calls += 1
            script.hit("debug")
            usable = script.debug_usable[script.debug_calls - 1] if script.debug_calls <= len(
                script.debug_usable) else True
            if usable:
                return {"files": {"main.py": f"print('v{script.debug_calls + 1}')"}}
            return {"files": {"main.py": files.get("main.py")}}

    class Integration:
        async def identify_questions(self, *a, **k):
            return []

        async def integrate(self, *a, **k):
            script.hit("integration")
            return {"files": {"stripe.py": "# stripe"}, "instructions": "set the key"}

    class PM:
        async def validate(self, *a, **k):
            index = script.pm_calls
            script.pm_calls += 1
            script.hit("pm")
            passed = script.pass_at is not None and index >= script.pass_at
            if passed:
                return {"passed": True}
            return {"passed": False, "issues": [{"severity": "low", "file": "main.py", "description": "fix"}]}

    return {"architect": Architect(), "business_model": BusinessModel(), "designer": Designer(),
            "developer": Developer(), "integration": Integration(), "pm": PM()}


QUOTE = quote_from_settings()


class LedgerHarness:
    BUILD_ID = "build-1"

    def __init__(self, monkeypatch, *, script: Script, funding: str = "user_credits", credits: int = 100,
                 flags: Optional[Dict[str, Any]] = None, db: Optional[LedgerFakeDB] = None,
                 interactive: bool = False):
        import tasks.build_tasks as build_tasks_module
        from tests.a2_support import make_user

        self.monkeypatch = monkeypatch
        self.interactive = interactive
        self.script = script
        self.funding = FundingSource(funding)
        self.db = db or LedgerFakeDB()
        patch_ledger_infra(monkeypatch, self.db)
        set_flags(monkeypatch, **{"ledger_v2": True, "collab_protocol_v2": False, **(flags or {})})
        asyncio.run(self.db.credit_transactions.create_index([("build_id", 1), ("kind", 1)], unique=True))
        asyncio.run(self.db.llm_response_journal.create_index([("operation_id", 1), ("dispatch_no", 1)],
                                                              unique=True))
        user = make_user(byok=(self.funding == FundingSource.BYOK))
        user.update(credits=credits, free_build_used=(self.funding != FundingSource.FREE_GRANT))
        self.db.users.docs.append(user)
        self.db.projects.docs.append({"id": "p1", "user_id": "u1"})
        self.initial_credits = credits

        orch = build_tasks_module.orchestrator
        for name, agent in make_stub_agents(script).items():
            monkeypatch.setattr(orch, name, agent)

        async def _no_registry(*a, **k):
            return None

        monkeypatch.setattr(orch, "_resolve_agent_profile", _no_registry)

        class _Sandbox:
            async def run(self, files):
                return ""

        monkeypatch.setattr(build_tasks_module, "sandbox", _Sandbox())
        self.events: List[Any] = []

        async def record(event):
            self.events.append(event)

        import services.ws_manager as ws

        monkeypatch.setattr(ws.manager, "emit", record)
        monkeypatch.setattr(build_tasks_module.manager, "emit", record)
        self.retries: List[Retry] = []

        def fake_retry(exc=None, countdown=None, max_retries=None, **k):
            r = Retry(exc, countdown)
            self.retries.append(r)
            return r

        monkeypatch.setattr(build_tasks_module.run_build, "retry", fake_retry)
        self.loop = asyncio.new_event_loop()
        monkeypatch.setattr(build_tasks_module, "_worker_loop", self.loop)
        self.build_tasks = build_tasks_module
        self.admit()

    def admit(self):
        from core import execution_state
        from core.models import Build

        build = Build(id=self.BUILD_ID, project_id="p1", user_id="u1", prompt="Build a todo app",
                      interactive=self.interactive)
        execution_state.admit(build)
        doc = build.model_dump()
        doc.pop("idempotency_key", None)
        doc["processing_boundary"] = {
            "credential_mode": "byok" if self.funding == FundingSource.BYOK else "forge",
            "consents": [], "policy_version": "2026-11", "byok_auto_retry_max": 0, "owner_user_id": "u1",
        }
        # Priced at admission from the settings in force then, as the API does.
        self.quote = quote_from_settings()
        self.admission = self.loop.run_until_complete(
            credit_ledger.admit_build(self.db, build_doc=doc, source=self.funding, quote=self.quote)
        )

    # -- running ---------------------------------------------------------- #

    def run(self, retries: int = 0):
        task = self.build_tasks.run_build
        task.push_request(retries=retries)
        try:
            return task.run(self.BUILD_ID, "p1", "u1", self.admission.reserved)
        finally:
            task.pop_request()

    def expire_lease(self):
        doc = self.doc
        if doc.get("lease_expires_at") is not None:
            self.loop.run_until_complete(self.db.builds.update_one(
                {"id": self.BUILD_ID},
                {"$set": {"lease_expires_at": utcnow() - timedelta(seconds=300)}},
            ))

    def run_to_end(self, max_attempts: int = 12):
        """Run, resuming after every WorkerCrash and Celery retry, until the
        task returns or raises terminally. Returns (result, exception)."""
        retries = 0
        for _ in range(max_attempts):
            try:
                return self.run(retries=retries), None
            except WorkerCrash:
                self.expire_lease()
                continue
            except Retry:
                retries += 1
                continue
            except Exception as exc:  # terminal
                return None, exc
        raise AssertionError("build did not finish")

    # -- reading ---------------------------------------------------------- #

    @property
    def doc(self) -> Dict[str, Any]:
        return self.loop.run_until_complete(self.db.builds.find_one({"id": self.BUILD_ID}))

    @property
    def ledger(self) -> List[Dict[str, Any]]:
        return self.doc.get("ledger") or []

    def completed_keys(self) -> List[str]:
        return [op["stage_key"] for op in self.ledger if op["status"] == "completed"]

    def charged(self) -> Dict[str, int]:
        out: Dict[str, int] = {}
        for op in self.ledger:
            if op["status"] == "completed" and op["credits"]:
                out[op["stage_key"]] = out.get(op["stage_key"], 0) + int(op["credits"])
        return out

    @property
    def user(self) -> Dict[str, Any]:
        return self.db.users.docs[0]

    def credit_rows(self, kind: Optional[str] = None):
        return [r for r in self.db.credit_transactions.docs if kind is None or r["kind"] == kind]

    def reconcile(self):
        from core.reconcile import reconcile_build

        return self.loop.run_until_complete(reconcile_build(self.db, self.BUILD_ID))

    def event_types(self) -> List[str]:
        return [getattr(e.type, "value", e.type) for e in self.events]


def dumps(value) -> str:
    return json.dumps(value, default=str)
