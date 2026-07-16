"""A/B testing framework for prompt variants: compare two prompt template
versions against the same test cases and determine statistical significance.

Enables data-driven prompt optimization by running controlled experiments
between template variants and identifying which performs better across
configurable metrics.
"""

from __future__ import annotations

import math
import time
from typing import Dict, List, Optional

from harness.evaluator import PromptEvaluator
from harness.models import (
    ABTestConfig,
    ABTestResult,
    ABTestVariantResult,
    TestCase,
)


class ABTestRunner:
    """Runs A/B tests between two prompt template variants.

    Usage::

        runner = ABTestRunner()
        result = await runner.run(
            output_a="version 1 prompt output",
            output_b="version 2 prompt output",
            config=ABTestConfig(
                test_id="test-1",
                role="developer",
                variant_a_template_version="v1",
                variant_b_template_version="v2",
                test_cases=[...],
            ),
        )
        print(f"Winner: {result.winner}")
    """

    def __init__(self, evaluator: Optional[PromptEvaluator] = None):
        self.evaluator = evaluator or PromptEvaluator()

    async def run(
        self,
        output_a: str,
        output_b: str,
        config: ABTestConfig,
    ) -> ABTestResult:
        """Run an A/B test between two prompt variants.

        Args:
            output_a: Rendered output from variant A (control).
            output_b: Rendered output from variant B (variant).
            config: A/B test configuration with test cases and comparison settings.

        Returns:
            ABTestResult with per-variant results, significance, and winner.
        """
        start = time.perf_counter()

        # Evaluate both variants against all test cases
        results_a = [self.evaluator.evaluate(output_a, case) for case in config.test_cases]
        results_b = [self.evaluator.evaluate(output_b, case) for case in config.test_cases]

        # Compute variant metrics
        var_a_result = self._compute_variant_result(
            config.variant_a_template_version, results_a
        )
        var_b_result = self._compute_variant_result(
            config.variant_b_template_version, results_b
        )

        # Compute metric deltas (B - A)
        metric_deltas: Dict[str, float] = {}
        all_metrics = set(var_a_result.metrics.keys()) | set(var_b_result.metrics.keys())
        for metric in all_metrics:
            a_val = var_a_result.metrics.get(metric, 0.0)
            b_val = var_b_result.metrics.get(metric, 0.0)
            metric_deltas[metric] = round(b_val - a_val, 4)

        # Determine significance using a simplified chi-squared test
        significance = self._compute_significance(
            var_a_result, var_b_result, min(len(results_a), 2)
        )

        # Determine winner
        winner: Optional[str] = None
        if significance < config.significance_threshold:
            # Look at primary metric (first in metrics_to_compare)
            primary = config.metrics_to_compare[0] if config.metrics_to_compare else "pass_rate"
            delta = metric_deltas.get(primary, 0.0)
            if delta > 0:
                winner = config.variant_b_template_version
            elif delta < 0:
                winner = config.variant_a_template_version

        elapsed_ms = (time.perf_counter() - start) * 1000

        return ABTestResult(
            test_id=config.test_id,
            role=config.role,
            variant_a=var_a_result,
            variant_b=var_b_result,
            significance=round(significance, 4),
            winner=winner,
            metric_deltas=metric_deltas,
        )

    def _compute_variant_result(
        self, template_version: str, results: list
    ) -> ABTestVariantResult:
        """Compute aggregate metrics for a variant."""
        total = len(results)
        if total == 0:
            return ABTestVariantResult(template_version=template_version)

        passed = sum(1 for r in results if r.passed)
        avg_score = sum(r.score for r in results) / total

        metrics = {
            "pass_rate": passed / total,
            "avg_score": avg_score,
            "format_compliance": sum(1 for r in results if r.format_valid) / total,
        }

        return ABTestVariantResult(
            template_version=template_version,
            results=results,
            pass_rate=passed / total,
            avg_score=avg_score,
            metrics=metrics,
        )

    def _compute_significance(
        self,
        var_a: ABTestVariantResult,
        var_b: ABTestVariantResult,
        degrees_of_freedom: int = 1,
    ) -> float:
        """Compute a simplified statistical significance (p-value proxy).

        Uses a simplified chi-squared test on pass/fail counts. In production,
        this would use scipy.stats for proper statistical testing.
        """
        # Observed pass/fail
        a_pass = int(var_a.pass_rate * len(var_a.results)) if var_a.results else 0
        a_fail = len(var_a.results) - a_pass if var_a.results else 0
        b_pass = int(var_b.pass_rate * len(var_b.results)) if var_b.results else 0
        b_fail = len(var_b.results) - b_pass if var_b.results else 0

        total_a = a_pass + a_fail
        total_b = b_pass + b_fail
        grand_total = total_a + total_b

        if grand_total == 0:
            return 1.0

        # Expected frequencies (under null hypothesis)
        total_pass = a_pass + b_pass
        total_fail = a_fail + b_fail

        if total_pass == 0 or total_fail == 0:
            return 1.0  # No variance

        exp_a_pass = (total_a * total_pass) / grand_total
        exp_a_fail = (total_a * total_fail) / grand_total
        exp_b_pass = (total_b * total_pass) / grand_total
        exp_b_fail = (total_b * total_fail) / grand_total

        # Chi-squared statistic
        chi2 = 0.0
        for observed, expected in [
            (a_pass, exp_a_pass),
            (a_fail, exp_a_fail),
            (b_pass, exp_b_pass),
            (b_fail, exp_b_fail),
        ]:
            if expected > 0:
                chi2 += (observed - expected) ** 2 / expected

        # Approximate p-value from chi-squared (simplified)
        p_value = self._approx_p_value(chi2, degrees_of_freedom)
        return p_value

    def _approx_p_value(self, chi2: float, df: int) -> float:
        """Approximate p-value from chi-squared statistic.

        Uses a simplified approximation. In production, use scipy.stats.
        """
        if chi2 <= 0:
            return 1.0
        if chi2 > 10:
            return 0.001  # Very significant

        # Simplified mapping for df=1
        approx_map = {0.0: 1.0, 1.0: 0.32, 2.0: 0.16, 3.0: 0.08, 4.0: 0.04, 5.0: 0.02}
        for threshold, p in sorted(approx_map.items()):
            if chi2 <= threshold:
                return p
        return 0.01