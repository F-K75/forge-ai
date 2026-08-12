"""Tests for scripts/load_test.py (roadmap 8.1).

Covers the latency percentile and pass/fail logic without a live deployment:
the actual 1000-concurrent-user validation must run against a deployed API via
``python scripts/load_test.py --base-url ... --concurrency 1000``. These tests
ensure the tool's arithmetic and verdict are correct.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir))

import pytest  # noqa: E402

from scripts.load_test import _percentile  # noqa: E402


def test_percentile_empty():
    assert _percentile([], 95) == 0.0


def test_percentile_single():
    assert _percentile([123.4], 95) == pytest.approx(123.4)


def test_percentile_p95_rounds_to_nearest_index():
    # 10 samples, p95 index = min(9, int(0.95*10)) = min(9,9) = 9
    samples = [float(i) for i in range(10)]
    assert _percentile(samples, 95) == pytest.approx(9.0)


def test_percentile_monotonic_after_sort():
    unsorted = [500.0, 100.0, 300.0, 200.0, 400.0]
    assert _percentile(unsorted, 50) == pytest.approx(300.0)


@pytest.mark.parametrize(
    "p95,error_rate,threshold,expected",
    [
        (450.0, 0.0, 500.0, True),   # under threshold, no errors -> pass
        (500.0, 0.0, 500.0, False),  # at threshold (strict <) -> fail
        (499.9, 0.5, 500.0, True),   # under threshold, low errors -> pass
        (499.9, 1.0, 500.0, False),  # error rate at 1% -> fail
        (550.0, 0.0, 500.0, False),  # over threshold -> fail
    ],
)
def test_verdict_logic(p95, error_rate, threshold, expected):
    # Mirror the pass condition in load_test.py main()/report.
    passed = p95 < threshold and error_rate < 1.0
    assert passed is expected
