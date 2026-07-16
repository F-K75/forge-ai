"""Regression testing for prompt templates: compare current template
performance against a baseline to detect regressions.

Enables safe prompt iteration by automatically detecting when a change
degrades quality, format compliance, or other key metrics.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from harness.evaluator import PromptEvaluator
from harness.models import (
    EvaluationResult,
    RegressionResult,
    TestSuite,
)


class RegressionTester:
    """Detects regressions in prompt template performance.

    Compares evaluation results from a current template version against
    a stored baseline and reports which metrics improved, regressed, or
    stayed the same.

    Usage::

        tester = RegressionTester()
        result = tester.check(
            current_output="new version output",
            baseline_output="old version output",
            suite=test_suite,
            threshold=0.05,
        )
        if not result.passed:
            print(f"Regressions: {result.regressions_found}")
    """

    def __init__(self, evaluator: Optional[PromptEvaluator] = None):
        self.evaluator = evaluator or PromptEvaluator()

    def check(
        self,
        current_output: str,
        baseline_output: str,
        suite: TestSuite,
        threshold: float = 0.05,
    ) -> RegressionResult:
        """Check for regressions between baseline and current outputs.

        Args:
            current_output: Rendered output from the current template version.
            baseline_output: Rendered output from the baseline template version.
            suite: Test suite to evaluate both outputs against.
            threshold: Minimum absolute metric change to consider a regression.

        Returns:
            RegressionResult with deltas and lists of regressed/improved metrics.
        """
        # Evaluate both
        current_eval = self.evaluator.evaluate_suite(current_output, suite)
        baseline_eval = self.evaluator.evaluate_suite(baseline_output, suite)

        return self.compare(
            current_eval=current_eval,
            baseline_eval=baseline_eval,
            threshold=threshold,
        )

    def compare(
        self,
        current_eval: EvaluationResult,
        baseline_eval: EvaluationResult,
        threshold: float = 0.05,
    ) -> RegressionResult:
        """Compare two evaluation results and detect regressions.

        Args:
            current_eval: Evaluation result for the current version.
            baseline_eval: Evaluation result for the baseline version.
            threshold: Minimum absolute metric change to consider a regression.

        Returns:
            RegressionResult with deltas and regression/improvement lists.
        """
        baseline_metrics = baseline_eval.metrics.copy()
        current_metrics = current_eval.metrics.copy()

        # Add pass_rate and avg_score to metrics if not present
        baseline_metrics["pass_rate"] = baseline_eval.pass_rate
        baseline_metrics["avg_score"] = baseline_eval.avg_score
        current_metrics["pass_rate"] = current_eval.pass_rate
        current_metrics["avg_score"] = current_eval.avg_score

        # Compute deltas
        deltas: Dict[str, float] = {}
        all_metrics = set(baseline_metrics.keys()) | set(current_metrics.keys())
        for metric in all_metrics:
            base_val = baseline_metrics.get(metric, 0.0)
            curr_val = current_metrics.get(metric, 0.0)
            deltas[metric] = round(curr_val - base_val, 4)

        # Classify changes
        regressions: List[str] = []
        improvements: List[str] = []
        for metric, delta in deltas.items():
            if delta < -threshold:
                regressions.append(f"{metric}: {delta:.4f}")
            elif delta > threshold:
                improvements.append(f"{metric}: +{delta:.4f}")

        passed = len(regressions) == 0

        return RegressionResult(
            role=current_eval.role,
            baseline_template_version=baseline_eval.template_version,
            current_template_version=current_eval.template_version,
            baseline_metrics=baseline_metrics,
            current_metrics=current_metrics,
            deltas=deltas,
            regressions_found=regressions,
            improvements_found=improvements,
            passed=passed,
        )

    def check_suite(
        self,
        current_outputs: Dict[str, str],
        baseline_outputs: Dict[str, str],
        suites: Dict[str, TestSuite],
        threshold: float = 0.05,
    ) -> Dict[str, RegressionResult]:
        """Run regression checks for multiple roles/suites.

        Args:
            current_outputs: Dict mapping role -> current output.
            baseline_outputs: Dict mapping role -> baseline output.
            suites: Dict mapping role -> test suite.
            threshold: Regression threshold.

        Returns:
            Dict mapping role -> RegressionResult.
        """
        results: Dict[str, RegressionResult] = {}
        for role in current_outputs:
            if role in baseline_outputs and role in suites:
                results[role] = self.check(
                    current_output=current_outputs[role],
                    baseline_output=baseline_outputs[role],
                    suite=suites[role],
                    threshold=threshold,
                )
        return results