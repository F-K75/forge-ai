"""Harness Engineering: prompt evaluation, A/B testing, regression testing,
quality metrics, and benchmarking.

Provides a complete test/validation framework for prompt templates — run
test cases against rendered prompts, compare output quality, detect
regressions, and benchmark performance across prompt variants.
"""

from harness.models import (
    TestCase,
    TestSuite,
    TestResult,
    EvaluationResult,
    ABTestConfig,
    ABTestResult,
    RegressionResult,
    QualityMetrics,
    BenchmarkResult,
)
from harness.evaluator import PromptEvaluator
from harness.ab_test import ABTestRunner
from harness.regression import RegressionTester
from harness.metrics import MetricsCollector
from harness.benchmark import PromptBenchmark

__all__ = [
    "TestCase",
    "TestSuite",
    "TestResult",
    "EvaluationResult",
    "ABTestConfig",
    "ABTestResult",
    "RegressionResult",
    "QualityMetrics",
    "BenchmarkResult",
    "PromptEvaluator",
    "ABTestRunner",
    "RegressionTester",
    "MetricsCollector",
    "PromptBenchmark",
]