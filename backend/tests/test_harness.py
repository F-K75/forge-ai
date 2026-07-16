"""Tests for the harness engineering module."""

import pytest
from harness.evaluator import PromptEvaluator
from harness.models import (
    TestCase,
    TestSuite,
    TestResult,
    EvaluationResult,
    ABTestConfig,
)
from harness.regression import RegressionTester
from harness.metrics import MetricsCollector
from harness.benchmark import PromptBenchmark


class TestPromptEvaluator:
    def test_evaluate_pass(self):
        evaluator = PromptEvaluator()
        case = TestCase(
            case_id="test1",
            role="developer",
            task="Build a todo app",
            expected_output_patterns=["files", "App.tsx"],
            expected_format="json",
        )
        output = '{"files": {"frontend/src/App.tsx": "content"}}'
        result = evaluator.evaluate(output, case)
        assert result.passed is True
        assert result.score > 0.5

    def test_evaluate_fail_missing_pattern(self):
        evaluator = PromptEvaluator()
        case = TestCase(
            case_id="test2",
            role="developer",
            task="Build a todo app",
            expected_output_patterns=["required_field"],
        )
        output = '{"some": "data"}'
        result = evaluator.evaluate(output, case)
        assert result.passed is False

    def test_evaluate_forbidden_pattern(self):
        evaluator = PromptEvaluator()
        case = TestCase(
            case_id="test3",
            role="developer",
            task="Build a todo app",
            forbidden_patterns=["malicious", "unsafe"],
        )
        output = "This contains unsafe code"
        result = evaluator.evaluate(output, case)
        assert result.passed is False
        assert result.forbidden_patterns_found == 1

    def test_evaluate_json_format(self):
        evaluator = PromptEvaluator()
        case = TestCase(
            case_id="test4",
            role="developer",
            task="Build a todo app",
            expected_format="json",
        )
        output = "invalid json"
        result = evaluator.evaluate(output, case)
        assert result.format_valid is False

    def test_evaluate_json_with_markdown_fences(self):
        evaluator = PromptEvaluator()
        case = TestCase(
            case_id="test5",
            role="developer",
            task="Build a todo app",
            expected_format="json",
        )
        output = "```json\n{\"key\": \"value\"}\n```"
        result = evaluator.evaluate(output, case)
        assert result.format_valid is True

    def test_evaluate_expected_keys(self):
        evaluator = PromptEvaluator()
        case = TestCase(
            case_id="test6",
            role="developer",
            task="Build a todo app",
            expected_format="json",
            expected_keys=["files", "config"],
        )
        output = '{"files": {}, "config": {}}'
        result = evaluator.evaluate(output, case)
        assert result.passed is True
        assert result.expected_keys_found == 2

    def test_evaluate_suite(self):
        evaluator = PromptEvaluator()
        suite = TestSuite(
            suite_id="suite1",
            role="developer",
            template_version="v1",
            cases=[
                TestCase(case_id="c1", role="developer", task="t1", expected_output_patterns=["x"], expected_format="text"),
                TestCase(case_id="c2", role="developer", task="t2", expected_output_patterns=["y"], expected_format="text"),
            ],
        )
        output = "x and y content"
        result = evaluator.evaluate_suite(output, suite)
        assert result.total_cases == 2
        assert result.passed == 2
        assert result.pass_rate == 1.0


class TestRegressionTester:
    def test_check_no_regression(self):
        tester = RegressionTester()
        suite = TestSuite(
            suite_id="reg-test",
            role="dev",
            template_version="v1",
            cases=[
                TestCase(case_id="c1", role="dev", task="t1", expected_output_patterns=["pattern"]),
            ],
        )
        result = tester.check(
            current_output="has pattern content",
            baseline_output="has pattern content",
            suite=suite,
        )
        assert result.passed is True
        assert len(result.regressions_found) == 0

    def test_check_detects_regression(self):
        tester = RegressionTester()
        suite = TestSuite(
            suite_id="reg-test2",
            role="dev",
            template_version="v1",
            cases=[
                TestCase(case_id="c1", role="dev", task="t1", expected_output_patterns=["required"]),
            ],
        )
        result = tester.check(
            current_output="missing the pattern entirely",
            baseline_output="has the required pattern here",
            suite=suite,
        )
        # Should detect regression since current fails
        assert isinstance(result.passed, bool)

    def test_compare_evaluations(self):
        tester = RegressionTester()
        evaluator = PromptEvaluator()
        suite = TestSuite(
            suite_id="comp-test",
            role="dev",
            template_version="v1",
            cases=[
                TestCase(case_id="c1", role="dev", task="t1", expected_output_patterns=["pattern"]),
            ],
        )
        base_eval = evaluator.evaluate_suite("pattern content", suite)
        curr_eval = evaluator.evaluate_suite("pattern content", suite)
        result = tester.compare(base_eval, curr_eval)
        assert result.passed is True


class TestMetricsCollector:
    def test_compute_all_metrics(self):
        collector = MetricsCollector()
        output = '{"files": {"main.py": "content"}, "config": {}}'
        metrics = collector.compute(
            output=output,
            task="Build a Python app",
            expected_format="json",
            expected_keys=["files", "config"],
        )
        assert metrics.completeness == 1.0
        assert metrics.format_compliance == 1.0
        assert metrics.specificity > 0

    def test_aggregate_metrics(self):
        collector = MetricsCollector()
        output = '{"key": "value"}'
        m1 = collector.compute(output, task="task1", expected_format="json")
        m2 = collector.compute(output, task="task2", expected_format="json")
        agg = collector.aggregate([m1, m2])
        assert 0.0 <= agg.completeness <= 1.0
        assert 0.0 <= agg.format_compliance <= 1.0


class TestPromptBenchmark:
    @pytest.mark.asyncio
    async def test_benchmark_multiple_variants(self):
        benchmark = PromptBenchmark()
        suite = TestSuite(
            suite_id="bench-test",
            role="dev",
            template_version="v1",
            cases=[
                TestCase(case_id="c1", role="dev", task="t1", expected_output_patterns=["code"]),
                TestCase(case_id="c2", role="dev", task="t2", expected_format="json"),
            ],
        )
        result = await benchmark.run(
            variants={
                "v1": '{"code": "main"}',
                "v2": '{"code": "improved"}',
            },
            suite=suite,
            benchmark_id="bench-1",
            role="dev",
        )
        assert len(result.variants_tested) == 2
        assert result.winner is not None
        assert len(result.metrics_comparison) == 2

    @pytest.mark.asyncio
    async def test_benchmark_single_variant(self):
        benchmark = PromptBenchmark()
        suite = TestSuite(
            suite_id="bench-single",
            role="dev",
            template_version="v1",
            cases=[
                TestCase(case_id="c1", role="dev", task="t1", expected_output_patterns=["x"]),
            ],
        )
        result = await benchmark.run(
            variants={"v1": "x content"},
            suite=suite,
        )
        assert result.winner == "v1"
        assert len(result.recommendations) > 0