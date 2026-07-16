"""Prompt benchmarking: run performance benchmarks across multiple prompt
variants to compare quality, speed, and token efficiency.

Provides a systematic way to evaluate which prompt template version performs
best across multiple dimensions — pass rate, format compliance, token usage,
and execution speed.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from harness.evaluator import PromptEvaluator
from harness.metrics import MetricsCollector
from harness.models import (
    BenchmarkResult,
    QualityMetrics,
    TestSuite,
)


class PromptBenchmark:
    """Benchmarks multiple prompt template variants against test suites.

    Usage::

        benchmark = PromptBenchmark()
        result = await benchmark.run(
            variants={
                "v1": "output from version 1",
                "v2": "output from version 2",
                "v3": "output from version 3",
            },
            suite=test_suite,
            benchmark_id="dev-template-bench",
            role="developer",
        )
        print(f"Winner: {result.winner}")
        print(f"Recommendations: {result.recommendations}")
    """

    def __init__(
        self,
        evaluator: Optional[PromptEvaluator] = None,
        metrics_collector: Optional[MetricsCollector] = None,
    ):
        self.evaluator = evaluator or PromptEvaluator()
        self.metrics_collector = metrics_collector or MetricsCollector()

    async def run(
        self,
        variants: Dict[str, str],
        suite: TestSuite,
        benchmark_id: str = "",
        role: str = "",
    ) -> BenchmarkResult:
        """Run a benchmark comparing multiple prompt variants.

        Args:
            variants: Dict mapping variant name/version -> rendered output.
            suite: Test suite to evaluate all variants against.
            benchmark_id: Unique identifier for this benchmark run.
            role: Agent role being benchmarked.

        Returns:
            BenchmarkResult with per-variant metrics and winner.
        """
        start = time.perf_counter()
        variants_tested = list(variants.keys())
        metrics_comparison: Dict[str, Dict[str, float]] = {}
        total_tokens = 0

        for variant_name, output in variants.items():
            # Evaluate against test suite
            eval_result = self.evaluator.evaluate_suite(output, suite)

            # Compute quality metrics
            quality = self.metrics_collector.from_test_results(eval_result.results)

            # Collect all metrics
            variant_metrics: Dict[str, float] = {
                "pass_rate": eval_result.pass_rate,
                "avg_score": eval_result.avg_score,
                "format_compliance": eval_result.metrics.get("format_compliance", 0.0),
                "completeness": quality.completeness,
                "constraint_adherence": quality.constraint_adherence,
                "relevance": quality.relevance,
                "specificity": quality.specificity,
                "consistency": quality.consistency,
                "token_efficiency": quality.token_efficiency,
                "execution_time_ms": eval_result.total_time_ms,
            }

            metrics_comparison[variant_name] = variant_metrics
            total_tokens += sum(len(output) // 4 for output in [output])

        # Determine winner based on weighted composite score
        winner, recommendations = self._analyze_results(metrics_comparison)

        elapsed_ms = (time.perf_counter() - start) * 1000

        return BenchmarkResult(
            benchmark_id=benchmark_id or f"bench-{role}-{int(start)}",
            role=role or suite.role,
            variants_tested=variants_tested,
            metrics_comparison=metrics_comparison,
            winner=winner,
            recommendations=recommendations,
            total_tokens_used=total_tokens,
            total_time_ms=elapsed_ms,
        )

    def _analyze_results(
        self, metrics_comparison: Dict[str, Dict[str, float]]
    ) -> tuple[Optional[str], List[str]]:
        """Analyze benchmark results to determine winner and recommendations.

        Uses a weighted composite score: pass_rate (30%), avg_score (20%),
        format_compliance (15%), token_efficiency (15%), and other metrics (20%).

        Returns:
            Tuple of (winner_name, list_of_recommendations).
        """
        if not metrics_comparison:
            return None, []

        weights = {
            "pass_rate": 0.30,
            "avg_score": 0.20,
            "format_compliance": 0.15,
            "token_efficiency": 0.15,
            "completeness": 0.10,
            "constraint_adherence": 0.05,
            "specificity": 0.03,
            "consistency": 0.02,
        }

        # Compute composite scores
        composite_scores: Dict[str, float] = {}
        for variant, metrics in metrics_comparison.items():
            score = 0.0
            for metric, weight in weights.items():
                score += metrics.get(metric, 0.0) * weight
            composite_scores[variant] = score

        # Find winner
        sorted_variants = sorted(composite_scores.items(), key=lambda x: -x[1])
        winner = sorted_variants[0][0]

        # Generate recommendations
        recommendations = self._generate_recommendations(
            metrics_comparison, composite_scores
        )

        return winner, recommendations

    def _generate_recommendations(
        self,
        metrics_comparison: Dict[str, Dict[str, float]],
        composite_scores: Dict[str, float],
    ) -> List[str]:
        """Generate actionable recommendations from benchmark results."""
        recommendations: List[str] = []

        # Find best per-metric performers
        best_per_metric: Dict[str, tuple[str, float]] = {}
        all_metrics = set()
        for vm in metrics_comparison.values():
            all_metrics.update(vm.keys())

        for metric in all_metrics:
            best_variant = max(metrics_comparison, key=lambda v: metrics_comparison[v].get(metric, 0))
            best_val = metrics_comparison[best_variant].get(metric, 0)
            best_per_metric[metric] = (best_variant, best_val)

        # Compare each variant against best
        for variant, metrics in metrics_comparison.items():
            for metric, (best_v, best_val) in best_per_metric.items():
                if variant == best_v:
                    continue
                val = metrics.get(metric, 0)
                deficit = best_val - val
                if deficit > 0.05:
                    recommendations.append(
                        f"{variant} could improve {metric} by {deficit:.1%} "
                        f"(best: {best_v} at {best_val:.1%})"
                    )

        # Overall suggestions
        if len(composite_scores) > 1:
            sorted_scores = sorted(composite_scores.items(), key=lambda x: -x[1])
            delta = sorted_scores[0][1] - sorted_scores[1][1]
            if delta < 0.02:
                recommendations.append(
                    f"Top variants are within 2% of each other; consider A/B testing "
                    f"with real users for a definitive winner."
                )

        if not recommendations:
            recommendations.append("Current template set performs well; no improvements suggested.")

        return recommendations