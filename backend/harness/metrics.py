"""Quality metrics collection: compute and aggregate quality metrics for
prompt templates, including completeness, format compliance, constraint
adherence, relevance, specificity, consistency, and token efficiency.

Provides both per-output and aggregate metrics for monitoring prompt
quality over time.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

from harness.models import QualityMetrics, TestResult


class MetricsCollector:
    """Collects and computes quality metrics for prompt outputs.

    Usage::

        collector = MetricsCollector()
        metrics = collector.compute(output, task, constraints)
        aggregate = collector.aggregate([metrics1, metrics2, metrics3])
    """

    def compute(
        self,
        output: str,
        task: str = "",
        expected_format: str = "json",
        expected_keys: Optional[List[str]] = None,
        constraints: Optional[List[str]] = None,
    ) -> QualityMetrics:
        """Compute quality metrics for a single output.

        Args:
            output: The rendered prompt or model output.
            task: The original task description.
            expected_format: Expected output format ("json", "text", etc.).
            expected_keys: Required JSON keys (for JSON format).
            constraints: List of constraints the output should adhere to.

        Returns:
            QualityMetrics with all component scores.
        """
        return QualityMetrics(
            completeness=self._completeness(output, expected_keys),
            format_compliance=self._format_compliance(output, expected_format),
            constraint_adherence=self._constraint_adherence(output, constraints or []),
            relevance=self._relevance(output, task),
            specificity=self._specificity(output),
            consistency=self._consistency(output),
            token_efficiency=self._token_efficiency(output),
        )

    def aggregate(self, metrics_list: List[QualityMetrics]) -> QualityMetrics:
        """Aggregate multiple quality metrics into averages."""
        if not metrics_list:
            return QualityMetrics()

        n = len(metrics_list)
        return QualityMetrics(
            completeness=sum(m.completeness for m in metrics_list) / n,
            format_compliance=sum(m.format_compliance for m in metrics_list) / n,
            constraint_adherence=sum(m.constraint_adherence for m in metrics_list) / n,
            relevance=sum(m.relevance for m in metrics_list) / n,
            specificity=sum(m.specificity for m in metrics_list) / n,
            consistency=sum(m.consistency for m in metrics_list) / n,
            token_efficiency=sum(m.token_efficiency for m in metrics_list) / n,
        )

    def from_test_results(self, results: List[TestResult]) -> QualityMetrics:
        """Derive quality metrics from test results."""
        if not results:
            return QualityMetrics()

        total = len(results)
        return QualityMetrics(
            completeness=sum(1 for r in results if r.expected_keys_found > 0) / total,
            format_compliance=sum(1 for r in results if r.format_valid) / total,
            constraint_adherence=sum(1 for r in results if r.forbidden_patterns_found == 0) / total,
            relevance=sum(r.score for r in results) / total,
            specificity=sum(1 for r in results if r.required_patterns_found > 0) / total,
            consistency=self._compute_consistency_from_results(results),
            token_efficiency=self._compute_token_efficiency_from_results(results),
        )

    def _completeness(self, output: str, expected_keys: Optional[List[str]]) -> float:
        """Check if all expected keys are present in the output."""
        if not expected_keys:
            return 1.0

        parsed = self._try_parse_json(output)
        if not parsed or not isinstance(parsed, dict):
            return 0.0

        found = sum(1 for k in expected_keys if k in parsed)
        return found / len(expected_keys)

    def _format_compliance(self, output: str, expected_format: str) -> float:
        """Check if output adheres to the expected format."""
        if expected_format == "json":
            return 1.0 if self._try_parse_json(output) is not None else 0.0
        if expected_format == "json_array":
            parsed = self._try_parse_json(output)
            return 1.0 if isinstance(parsed, list) else 0.0
        # For text format, check it's non-empty
        return 1.0 if output and output.strip() else 0.0

    def _constraint_adherence(self, output: str, constraints: List[str]) -> float:
        """Check how many constraints the output adheres to."""
        if not constraints:
            return 1.0

        adhered = 0
        for constraint in constraints:
            # Simple check: does the output mention or follow the constraint?
            constraint_lower = constraint.lower()
            output_lower = output.lower()

            # Check for key constraint indicators
            if any(word in output_lower for word in constraint_lower.split()):
                adhered += 1

        return adhered / len(constraints)

    def _relevance(self, output: str, task: str) -> float:
        """Score how relevant the output is to the task."""
        if not task:
            return 0.5

        task_tokens = set(task.lower().split())
        output_tokens = set(output.lower().split())

        if not task_tokens:
            return 0.5

        overlap = len(task_tokens & output_tokens)
        return min(1.0, overlap / len(task_tokens) * 1.5)  # Scale up slightly

    def _specificity(self, output: str) -> float:
        """Score how specific the output is (vs. generic/boilerplate)."""
        if not output:
            return 0.0

        # Check for specific indicators
        has_code = bool(re.search(r'```|def |class |function |const |import ', output))
        has_specifics = bool(re.search(r'\b\d+\b', output))  # Contains numbers
        has_structure = bool(re.search(r'[{}[\]()]', output))  # Contains structural chars

        score = 0.0
        if has_code:
            score += 0.4
        if has_specifics:
            score += 0.3
        if has_structure:
            score += 0.3

        return score

    def _consistency(self, output: str) -> float:
        """Score internal consistency of the output."""
        if not output:
            return 0.0

        # Check for contradictory patterns
        contradictions = [
            ("enable", "disable"),
            ("include", "exclude"),
            ("allow", "deny"),
            ("true", "false"),
        ]

        output_lower = output.lower()
        contradiction_count = 0
        for a, b in contradictions:
            if a in output_lower and b in output_lower:
                contradiction_count += 1

        # Fewer contradictions = more consistent
        return max(0.0, 1.0 - (contradiction_count * 0.2))

    def _token_efficiency(self, output: str) -> float:
        """Score token efficiency (information density)."""
        if not output:
            return 0.0

        # Estimate tokens
        estimated_tokens = len(output) // 4 + 1

        # Check for efficient patterns
        has_json = bool(self._try_parse_json(output))
        has_concise_format = bool(re.search(r'^[{\[]', output.strip()))

        if has_json or has_concise_format:
            return min(1.0, 2000 / max(estimated_tokens, 1))
        return min(1.0, 1000 / max(estimated_tokens, 1))

    def _compute_consistency_from_results(self, results: List[TestResult]) -> float:
        """Compute consistency score from test results."""
        if not results:
            return 0.0
        # Consistency = how many results agree (all pass or all fail)
        passed = sum(1 for r in results if r.passed)
        failed = len(results) - passed
        return max(passed, failed) / len(results)

    def _compute_token_efficiency_from_results(self, results: List[TestResult]) -> float:
        """Compute token efficiency from test results."""
        if not results:
            return 0.0
        avg_score = sum(r.score for r in results) / len(results)
        return avg_score  # Use avg score as efficiency proxy

    def _try_parse_json(self, text: str) -> Optional[Any]:
        """Try to parse JSON from text, handling markdown fences."""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        try:
            return json.loads(cleaned)
        except (json.JSONDecodeError, ValueError):
            return None