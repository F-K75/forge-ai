#!/usr/bin/env python3
"""CI Multi-Agent Kernel Benchmark & Regression Gate Runner.

Executes Forge AI's deterministic `MultiAgentBenchmarkHarness` against the live
`AgentKernel` and exits with code 1 if any scenario fails or the quality/cost
regression gate trips. Zero external services required.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.benchmark_harness import MultiAgentBenchmarkHarness


async def _main() -> int:
    harness = MultiAgentBenchmarkHarness()
    report = await harness.run_suite(project_id="ci_benchmark_gate")
    payload = report.to_dict()
    print(
        json.dumps(
            {
                "suite_id": payload["suite_id"],
                "pass_rate": payload["pass_rate"],
                "avg_quality_score": payload["avg_quality_score"],
                "total_cost_usd": payload["total_cost_usd"],
                "regression_gate": payload["regression_gate"],
                "cases": [
                    {
                        "case_id": c["case_id"],
                        "passed": c["passed"],
                        "quality_score": c["quality_score"],
                        "cost_usd": c["cost_usd"],
                    }
                    for c in payload["cases"]
                ],
            },
            indent=2,
        )
    )
    if report.pass_rate < 1.0 or not report.regression_gate.passed:
        print("Multi-agent benchmark gate FAILED.", file=sys.stderr)
        return 1
    print("Multi-agent benchmark gate PASSED.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
