"""Prompt evaluation: run test cases against rendered prompts and score
the results for quality, format compliance, and correctness.

The evaluator is the core of the harness — it takes a rendered prompt,
runs it through configurable checks, and produces detailed test results
with pass/fail status, scores, and error information.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional

from harness.models import (
    EvaluationResult,
    TestCase,
    TestResult,
    TestSuite,
)


class PromptEvaluator:
    """Evaluates prompt templates by running test cases and scoring outputs.

    Supports pattern matching (required/forbidden), format validation,
    JSON key presence checks, and composite scoring.

    Usage::

        evaluator = PromptEvaluator()
        result = evaluator.evaluate(rendered_prompt, test_case)
        suite_result = evaluator.evaluate_suite(rendered_prompt, suite)
    """

    def evaluate(self, output: str, case: TestCase) -> TestResult:
        """Evaluate a single test case against an output.

        Args:
            output: The rendered prompt or model output to evaluate.
            case: The test case with expected patterns and constraints.

        Returns:
            TestResult with pass/fail, score, and detailed diagnostics.
        """
        start = time.perf_counter()
        errors: List[str] = []

        # 1. Check required patterns
        required_found = 0
        for pattern in case.expected_output_patterns:
            if re.search(pattern, output, re.IGNORECASE):
                required_found += 1
            else:
                errors.append(f"Required pattern not found: {pattern!r}")

        # 2. Check forbidden patterns
        forbidden_found = 0
        for pattern in case.forbidden_patterns:
            if re.search(pattern, output, re.IGNORECASE):
                forbidden_found += 1
                errors.append(f"Forbidden pattern found: {pattern!r}")

        # 3. Check format validity
        format_valid = True
        if case.expected_format == "json":
            format_valid = self._is_valid_json(output)

        # 4. Check expected keys (for JSON outputs)
        keys_found = 0
        if case.expected_keys:
            parsed = self._parse_json(output)
            if parsed:
                keys_found = sum(1 for k in case.expected_keys if k in parsed)
                missing = set(case.expected_keys) - set(parsed.keys() if isinstance(parsed, dict) else [])
                if missing:
                    errors.append(f"Missing expected JSON keys: {missing}")

        # 5. Compute composite score
        score = self._compute_score(
            required_found=required_found,
            required_total=len(case.expected_output_patterns),
            forbidden_found=forbidden_found,
            format_valid=format_valid,
            keys_found=keys_found,
            keys_total=len(case.expected_keys),
        )

        elapsed_ms = (time.perf_counter() - start) * 1000

        passed = (
            len(errors) == 0
            and required_found == len(case.expected_output_patterns)
            and forbidden_found == 0
            and format_valid
            and (not case.expected_keys or keys_found == len(case.expected_keys))
        )

        return TestResult(
            case_id=case.case_id,
            passed=passed,
            score=score,
            format_valid=format_valid,
            required_patterns_found=required_found,
            forbidden_patterns_found=forbidden_found,
            expected_keys_found=keys_found,
            actual_output=output[:500],  # Truncate for storage
            errors=errors,
            execution_time_ms=elapsed_ms,
        )

    def evaluate_suite(self, output: str, suite: TestSuite) -> EvaluationResult:
        """Evaluate an output against an entire test suite.

        Args:
            output: The rendered prompt or model output to evaluate.
            suite: The test suite with multiple test cases.

        Returns:
            Aggregate EvaluationResult with per-case results and summary metrics.
        """
        start = time.perf_counter()

        results = [self.evaluate(output, case) for case in suite.cases]
        total = len(results)
        passed = sum(1 for r in results if r.passed)
        failed = total - passed
        avg_score = sum(r.score for r in results) / total if total > 0 else 0.0

        metrics = self._compute_aggregate_metrics(results)

        elapsed_ms = (time.perf_counter() - start) * 1000

        return EvaluationResult(
            suite_id=suite.suite_id,
            role=suite.role,
            template_version=suite.template_version,
            results=results,
            total_cases=total,
            passed=passed,
            failed=failed,
            pass_rate=passed / total if total > 0 else 0.0,
            avg_score=avg_score,
            metrics=metrics,
            total_time_ms=elapsed_ms,
        )

    def _compute_score(
        self,
        required_found: int,
        required_total: int,
        forbidden_found: int,
        format_valid: bool,
        keys_found: int,
        keys_total: int,
    ) -> float:
        """Compute a 0.0–1.0 composite score."""
        score = 0.0

        # Required patterns: 40% weight
        if required_total > 0:
            score += 0.4 * (required_found / required_total)
        else:
            score += 0.4  # No requirements = full marks

        # Forbidden patterns: 25% weight (penalty for presence)
        score += 0.25 * (1.0 if forbidden_found == 0 else 0.0)

        # Format validity: 20% weight
        score += 0.20 if format_valid else 0.0

        # Expected keys: 15% weight
        if keys_total > 0:
            score += 0.15 * (keys_found / keys_total)
        else:
            score += 0.15  # No keys expected = full marks

        return round(score, 4)

    def _compute_aggregate_metrics(self, results: List[TestResult]) -> Dict[str, float]:
        """Compute aggregate quality metrics from test results."""
        if not results:
            return {}

        total = len(results)
        return {
            "avg_score": sum(r.score for r in results) / total,
            "format_compliance": sum(1 for r in results if r.format_valid) / total,
            "pattern_accuracy": sum(r.required_patterns_found for r in results) / max(
                sum(1 for _ in results if True), 1
            ),
            "forbidden_free": sum(1 for r in results if r.forbidden_patterns_found == 0) / total,
        }

    def _is_valid_json(self, text: str) -> bool:
        """Check if text is valid JSON (handles markdown fences)."""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            # Strip markdown fences
            lines = cleaned.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        try:
            json.loads(cleaned)
            return True
        except (json.JSONDecodeError, ValueError):
            return False

    def _parse_json(self, text: str) -> Optional[Dict[str, Any]]:
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
            result = json.loads(cleaned)
            if isinstance(result, dict):
                return result
            return None
        except (json.JSONDecodeError, ValueError):
            return None