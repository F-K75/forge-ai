"""Data models for harness engineering: test cases, evaluation results,
A/B test configs, quality metrics, and benchmark results."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass
class TestCase:
    """A single test case for evaluating a prompt template."""
    case_id: str
    role: str                        # Agent role this test targets
    task: str                        # The task/input to test
    expected_output_patterns: List[str] = field(default_factory=list)  # Required substrings
    forbidden_patterns: List[str] = field(default_factory=list)        # Prohibited substrings
    expected_format: str = "json"    # Expected output format
    expected_keys: List[str] = field(default_factory=list)   # Required JSON keys
    tags: List[str] = field(default_factory=list)
    priority: int = 0


@dataclass
class TestSuite:
    """A collection of test cases for a specific role and prompt version."""
    suite_id: str
    role: str
    template_version: str
    cases: List[TestCase] = field(default_factory=list)
    description: str = ""
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))


@dataclass
class TestResult:
    """Result of running a single test case."""
    case_id: str
    passed: bool
    score: float                     # 0.0–1.0
    format_valid: bool
    required_patterns_found: int = 0
    forbidden_patterns_found: int = 0
    expected_keys_found: int = 0
    actual_output: str = ""
    errors: List[str] = field(default_factory=list)
    execution_time_ms: float = 0.0


@dataclass
class EvaluationResult:
    """Aggregate evaluation result for a test suite run."""
    suite_id: str
    role: str
    template_version: str
    results: List[TestResult] = field(default_factory=list)
    total_cases: int = 0
    passed: int = 0
    failed: int = 0
    pass_rate: float = 0.0
    avg_score: float = 0.0
    metrics: Dict[str, float] = field(default_factory=dict)
    total_time_ms: float = 0.0
    ran_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))


@dataclass
class ABTestConfig:
    """Configuration for an A/B test between prompt variants."""
    test_id: str
    role: str
    variant_a_template_version: str   # Control
    variant_b_template_version: str   # Variant
    test_cases: List[TestCase] = field(default_factory=list)
    metrics_to_compare: List[str] = field(default_factory=lambda: ["pass_rate", "avg_score", "format_compliance"])
    min_sample_size: int = 10
    significance_threshold: float = 0.05  # p-value


@dataclass
class ABTestVariantResult:
    """Result for one variant in an A/B test."""
    template_version: str
    results: List[TestResult] = field(default_factory=list)
    pass_rate: float = 0.0
    avg_score: float = 0.0
    metrics: Dict[str, float] = field(default_factory=dict)


@dataclass
class ABTestResult:
    """Result of an A/B test comparing two prompt variants."""
    test_id: str
    role: str
    variant_a: ABTestVariantResult
    variant_b: ABTestVariantResult
    significance: float = 0.0
    winner: Optional[str] = None       # template_version of the winner
    metric_deltas: Dict[str, float] = field(default_factory=dict)
    ran_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))


@dataclass
class RegressionResult:
    """Result of a regression test comparing current vs baseline."""
    role: str
    baseline_template_version: str
    current_template_version: str
    baseline_metrics: Dict[str, float] = field(default_factory=dict)
    current_metrics: Dict[str, float] = field(default_factory=dict)
    deltas: Dict[str, float] = field(default_factory=dict)
    regressions_found: List[str] = field(default_factory=list)  # Metrics that regressed
    improvements_found: List[str] = field(default_factory=list) # Metrics that improved
    passed: bool = True
    ran_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))


@dataclass
class QualityMetrics:
    """Quality metrics for a prompt template or variant."""
    completeness: float = 0.0         # All required fields present
    format_compliance: float = 0.0    # Adheres to output format
    constraint_adherence: float = 0.0 # Follows constraints
    relevance: float = 0.0            # Output relevant to task
    specificity: float = 0.0          # Output is specific, not generic
    consistency: float = 0.0          # Consistent across similar inputs
    token_efficiency: float = 0.0     # Tokens used vs. output quality


@dataclass
class BenchmarkResult:
    """Result of a benchmark run comparing multiple prompt variants."""
    benchmark_id: str
    role: str
    variants_tested: List[str] = field(default_factory=list)
    metrics_comparison: Dict[str, Dict[str, float]] = field(default_factory=dict)  # variant -> metric -> value
    winner: Optional[str] = None
    recommendations: List[str] = field(default_factory=list)
    total_tokens_used: int = 0
    total_time_ms: float = 0.0
    ran_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
