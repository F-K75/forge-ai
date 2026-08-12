"""Test the Phase 8.7 JSON-repair eval suite (harness/json_repair_suite.py).

Verifies the suite's discrimination: a clean, fenceless, complete JSON repair
scores well (high format compliance + all keys), while a fence-noisy, prose-
laden, key-trimmed repair is flagged as failing -- proving the suite is not a
vacuous always-pass and can serve as a CI regression guard for the gateway's
repair prompt.
"""

import pytest

from harness.evaluator import PromptEvaluator
from harness.json_repair_suite import (
    ROLE_KEYS,
    build_default_suites,
    build_report,
    build_suite,
    render_repair_bad_sample,
    render_repair_ok_sample,
)


@pytest.mark.parametrize("role", list(ROLE_KEYS))
def test_clean_repair_output_scores_well(role):
    suite = build_suite(role)
    output = render_repair_ok_sample(role)

    result = PromptEvaluator().evaluate_suite(output, suite)

    assert result.total_cases == 4
    # Every case includes the valid-JSON + key-presence checks; a clean sample
    # must pass all of them.
    assert result.failed == 0
    assert result.avg_score > 0.9
    assert result.metrics["format_compliance"] == 1.0
    assert result.metrics["pattern_accuracy"] > 0


@pytest.mark.parametrize("role", list(ROLE_KEYS))
def test_noisy_repair_output_is_flagged(role):
    suite = build_suite(role)
    output = render_repair_bad_sample(role, fenced=True, with_prose=True)

    result = PromptEvaluator().evaluate_suite(output, suite)

    # Fenced + prose + missing keys must fail at least one case.
    assert result.failed >= 1
    assert result.pass_rate < 1.0
    assert result.metrics["format_compliance"] < 1.0


def test_build_report_multirole_and_default_suites():
    suites = build_default_suites()
    assert set(suites) == set(ROLE_KEYS)

    outputs = {role: render_repair_ok_sample(role) for role in ROLE_KEYS}
    report = build_report(suites, outputs)

    assert set(report) == set(ROLE_KEYS)
    for role in ROLE_KEYS:
        assert report[role].suite_id == f"{role}-json-repair-v1"
        assert report[role].failed == 0


def test_suite_forbids_prose_and_fences_via_patterns():
    # A "repair" that is just prose (no JSON at all) should fail the required
    # JSON-pattern case -- the core of what the repair prompt is supposed to fix.
    suite = build_suite("developer")
    # Prose that also trips the forbidden-prose markers the repair prompt must
    # never emit, so no case passes.
    prose = "Here is the corrected JSON. Sorry, n/a"
    result = PromptEvaluator().evaluate_suite(prose, suite)
    assert result.pass_rate == 0.0
    assert result.avg_score < 0.3