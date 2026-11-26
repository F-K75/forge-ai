"""Verification tests for Tracks #1, #2, and #3:

1. Track #1 — Git repo/push URL & branch injection validation + constant-time metrics auth.
2. Track #2 — Durable MongoDB persistence/hydration for all 5 Enterprise OS stores,
   SSRF-safe OTLP HTTP endpoint validation, and live LLM worktree file writes +
   Knowledge Fabric prompt injection in `_default_gateway_task_executor`.
3. Track #3 — Canonical `/v1/billing/webhook` CSRF exemptions, `/v1/cashfree/webhook`
   notify_url parity, and CI Multi-Agent Benchmark Regression Gate CLI runner.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.agent_kernel import (
    AgentKernel,
    KernelExecutionConfig,
    KernelRun,
    KernelRunStatus,
    KernelTask,
    _default_gateway_task_executor,
    _extract_structured_executor_json,
)
from core.benchmark_harness import MultiAgentBenchmarkHarness
from core.enterprise_persistence import (
    bootstrap_enterprise_os_persistence,
    validate_otlp_endpoint,
)
from core.execution_sandbox import WorktreeManager
from core.kernel_observability import KernelTraceCollector
from core.knowledge_fabric import KnowledgeFabric
from core.skill_marketplace import GovernancePolicyStore, SkillMarketplaceRegistry


class _InMemoryCollection:
    """Minimal Motor-compatible async collection test double."""

    def __init__(self) -> None:
        self.docs: list[dict] = []

    async def update_one(self, query: dict, update: dict, upsert: bool = False) -> None:
        payload = dict(update.get("$set") or {})
        for idx, doc in enumerate(self.docs):
            if all(doc.get(k) == v for k, v in query.items()):
                self.docs[idx] = {**doc, **payload}
                return
        if upsert:
            self.docs.append({**query, **payload})

    def find(self, _query: dict, _projection: dict | None = None):
        docs = list(self.docs)

        class _Cursor:
            def limit(self, n: int):
                self._n = n
                return self

            async def to_list(self, length: int = 500):
                return docs[: min(length, getattr(self, "_n", length))]

        return _Cursor()


class _InMemoryDB:
    def __init__(self) -> None:
        self._cols: dict[str, _InMemoryCollection] = {}

    def __getitem__(self, name: str) -> _InMemoryCollection:
        return self._cols.setdefault(name, _InMemoryCollection())


class Track123ProductionHardeningTests(unittest.IsolatedAsyncioTestCase):
    async def test_enterprise_os_persistence_roundtrip_and_hydration(self) -> None:
        db = _InMemoryDB()

        # Session 1: write state to all 5 stores
        fabric1 = KnowledgeFabric()
        policy1 = GovernancePolicyStore()
        traces1 = KernelTraceCollector()
        market1 = SkillMarketplaceRegistry(policy1)
        bench1 = MultiAgentBenchmarkHarness()

        otlp_shipped: list[dict] = []

        counts1 = await bootstrap_enterprise_os_persistence(
            db,
            fabric=fabric1,
            policy_store=policy1,
            trace_collector=traces1,
            marketplace=market1,
            benchmark_harness=bench1,
        )
        self.assertEqual(counts1["knowledge_nodes"], 0)

        async def _capture_otlp(payload: dict) -> None:
            otlp_shipped.append(payload)

        traces1.attach_otlp_exporter(_capture_otlp)

        # Mutate all 5 stores
        await fabric1.ingest_kernel_run(
            {
                "id": "run_persist_1",
                "project_id": "proj_persist",
                "objective": "Harden OAuth and Stripe billing idempotency",
                "status": "completed",
                "artifacts": [
                    {
                        "key": "security_audit",
                        "artifact_type": "security_audit",
                        "summary": "Verified CSRF and webhook signature guards.",
                        "touched_files": ["backend/core/security.py"],
                    }
                ],
                "repair_cycles": [],
            }
        )
        policy1.update_policy(
            "proj_persist",
            max_run_budget_usd=3.25,
            require_approval_for_delivery=True,
            updated_by="cto@forge.ai",
        )
        pkg = market1.publish_package(
            name="stripe-idempotency-audit",
            title="Stripe Idempotency Audit",
            domain="security",
            version="1.2.0",
            author="forge-sec",
            description="Ensures payment webhooks deduplicate events atomically.",
            keywords=["stripe", "webhook", "billing"],
            required_permissions=["read_repo"],
            allowed_departments=["security"],
            instructions="Check webhook handlers for atomic status transitions.",
        )
        market1.install_package(project_id="proj_persist", package_id=pkg.package_id)
        trace, root_span = traces1.start_run_trace(project_id="proj_persist", run_id="run_persist_1")
        root_span.finish(status="OK")
        await traces1.finalize_trace(trace)
        await bench1.run_suite(project_id="proj_persist")
        # Allow scheduled fire-and-forget policy/marketplace persistence tasks to flush
        await asyncio.sleep(0.05)

        self.assertEqual(len(otlp_shipped), 1)
        self.assertIn("resourceSpans", otlp_shipped[0])

        # Session 2: cold restart into fresh store instances hydrated from the same DB
        fabric2 = KnowledgeFabric()
        policy2 = GovernancePolicyStore()
        traces2 = KernelTraceCollector()
        market2 = SkillMarketplaceRegistry(policy2)
        bench2 = MultiAgentBenchmarkHarness()

        counts2 = await bootstrap_enterprise_os_persistence(
            db,
            fabric=fabric2,
            policy_store=policy2,
            trace_collector=traces2,
            marketplace=market2,
            benchmark_harness=bench2,
        )
        self.assertGreaterEqual(counts2["knowledge_nodes"], 2)
        self.assertEqual(counts2["governance_policies"], 1)
        self.assertEqual(counts2["traces"], 1)
        self.assertEqual(counts2["marketplace_packages"], 1)
        self.assertEqual(counts2["marketplace_installations"], 1)
        self.assertEqual(counts2["benchmark_reports"], 1)

        # Verify restored state matches
        restored_policy = policy2.get_policy("proj_persist")
        self.assertEqual(restored_policy.max_run_budget_usd, 3.25)
        self.assertTrue(restored_policy.require_approval_for_delivery)

        restored_trace = traces2.get_trace("proj_persist", "run_persist_1")
        self.assertIsNotNone(restored_trace)
        assert restored_trace is not None
        self.assertEqual(restored_trace.trace_id, trace.trace_id)

        restored_hits = fabric2.retrieve_context(
            project_id="proj_persist", query="Stripe billing webhook CSRF"
        )
        self.assertGreaterEqual(len(restored_hits), 1)

        pkgs = market2.list_packages(project_id="proj_persist")
        match = next((p for p in pkgs if p["package_id"] == pkg.package_id), None)
        self.assertIsNotNone(match)
        assert match is not None
        self.assertTrue(match["installed"])

        history = bench2.get_history("proj_persist")
        self.assertEqual(len(history), 1)

    def test_otlp_endpoint_ssrf_validation(self) -> None:
        # Allowed external HTTPS collector
        self.assertEqual(
            validate_otlp_endpoint("https://otlp.datadoghq.com/v1/traces"),
            "https://otlp.datadoghq.com/v1/traces",
        )
        # Cloud metadata always blocked even with allow_local=True
        for bad in [
            "http://169.254.169.254/latest/meta-data",
            "http://metadata.google.internal/computeMetadata/v1/",
            "file:///etc/passwd",
            "https://user:pass@otlp.example.com/v1/traces",
        ]:
            with self.assertRaises(ValueError):
                validate_otlp_endpoint(bad, allow_local=True)

        # Localhost/private blocked unless opted in
        with self.assertRaises(ValueError):
            validate_otlp_endpoint("http://127.0.0.1:4318/v1/traces", allow_local=False)
        self.assertEqual(
            validate_otlp_endpoint("http://127.0.0.1:4318/v1/traces", allow_local=True),
            "http://127.0.0.1:4318/v1/traces",
        )

    async def test_live_gateway_executor_injects_knowledge_writes_worktree_and_verifies(self) -> None:
        captured_prompts: list[str] = []

        class _FakeGatewayResponse:
            def __init__(self, content: str) -> None:
                self.content = content
                self.provider = "anthropic"
                self.model = "claude-sonnet-4-6"
                self.usage = {"input_tokens": 300, "output_tokens": 120}
                self.cost_usd = 0.0027
                self.latency_ms = 42
                self.request_id = "req_live_1"

        class _FakeGateway:
            async def generate(self, req):
                captured_prompts.append(req.messages[-1]["content"])
                payload = {
                    "summary": "Implemented math helper inside isolated worktree and ran syntax verification.",
                    "files_to_write": {
                        "src/helper.py": "def add(a: int, b: int) -> int:\n    return a + b\n",
                        "../escape.py": "SHOULD_BE_BLOCKED = True\n",
                    },
                    "verification_profile": "python_syntax",
                }
                return _FakeGatewayResponse(f"```json\n{json.dumps(payload)}\n```")

        fake_gateway_mod = types.ModuleType("gateway")

        class _FakeGatewayRequest:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    setattr(self, k, v)

        fake_gateway_mod.GatewayRequest = _FakeGatewayRequest  # type: ignore[attr-defined]
        fake_gateway_mod.get_ai_gateway = lambda: _FakeGateway()  # type: ignore[attr-defined]

        with tempfile.TemporaryDirectory() as tmp:
            mgr = WorktreeManager(base_dir=tmp)
            lease = await mgr.acquire(
                run_id="run_live",
                task_id="t_live",
                role="backend_engineer",
                department="engineering",
            )
            task = KernelTask(
                id="t_live",
                title="Write helper",
                role="backend_engineer",
                department="engineering",
                description="Create src/helper.py",
                wave_index=0,
            )
            with patch.dict(sys.modules, {"gateway": fake_gateway_mod}):
                out = await _default_gateway_task_executor(
                    task,
                    {
                        "objective": "Add helper utility",
                        "project_id": "proj_live",
                        "knowledge_context": [
                            {
                                "node_type": "lesson",
                                "label": "Type annotate helpers",
                                "score": 0.92,
                                "summary": "Always add strict Python type hints.",
                            }
                        ],
                        "worktree_lease": lease.to_dict(),
                        "worktree_manager": mgr,
                        "model_route": {"model_id": "claude-sonnet-4-6", "task_complexity": "medium"},
                    },
                    None,  # type: ignore[arg-type]
                )

            self.assertEqual(len(captured_prompts), 1)
            self.assertIn("Type annotate helpers", captured_prompts[0])
            self.assertEqual(out["files_written"], ["src/helper.py"])
            self.assertEqual(out["rejected_file_paths"], ["../escape.py"])
            self.assertTrue(os.path.isfile(os.path.join(lease.worktree_path, "src/helper.py")))
            self.assertFalse(os.path.exists(os.path.join(tmp, "escape.py")))
            self.assertIsNotNone(out.get("verification"))
            self.assertTrue(out["verification"]["passed"])
            await mgr.release(lease.lease_id)

        self.assertEqual(_extract_structured_executor_json('{"summary":"ok"}')["summary"], "ok")

    def test_security_and_billing_source_invariants(self) -> None:
        # Verify CSRF exclusions include canonical /v1/billing/webhook paths
        sec_src = (BACKEND_DIR / "core" / "security.py").read_text(encoding="utf-8")
        self.assertIn('"/v1/billing/webhook"', sec_src)
        self.assertIn('"/v1/billing/webhook/payment"', sec_src)

        # Verify Cashfree uses canonical /v1/cashfree/webhook
        cf_src = (BACKEND_DIR / "api" / "cashfree.py").read_text(encoding="utf-8")
        self.assertNotIn('/cashfree/webhook"', cf_src.replace('/v1/cashfree/webhook"', ""))
        self.assertIn("/v1/cashfree/webhook", cf_src)

        # Verify main.py uses secrets.compare_digest for /metrics and calls bootstrap_enterprise_os_persistence
        main_src = (BACKEND_DIR / "main.py").read_text(encoding="utf-8")
        self.assertIn("secrets.compare_digest", main_src)
        self.assertIn("bootstrap_enterprise_os_persistence", main_src)

        # Verify repos.py and deployments.py validate branch & keep askpass outside repo clone dir
        repos_src = (BACKEND_DIR / "api" / "repos.py").read_text(encoding="utf-8")
        self.assertIn("validate_branch", repos_src)
        self.assertIn("tempfile.mkstemp", repos_src)
        self.assertIn("GIT_TERMINAL_PROMPT", repos_src)

        dep_src = (BACKEND_DIR / "api" / "deployments.py").read_text(encoding="utf-8")
        self.assertIn("validate_branch", dep_src)
        self.assertIn("tempfile.mkstemp", dep_src)
        self.assertIn("GIT_TERMINAL_PROMPT", dep_src)

    def test_ci_benchmark_gate_cli_passes(self) -> None:
        script_path = BACKEND_DIR / "scripts" / "run_kernel_benchmarks.py"
        proc = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr or proc.stdout)
        self.assertIn("Multi-agent benchmark gate PASSED.", proc.stdout)


if __name__ == "__main__":
    unittest.main()
