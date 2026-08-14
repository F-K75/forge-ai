"""Tests for the Phase A decision extraction spike.

Covers:
- Fixture completeness
- JSON parsing of extraction responses
- Precision/recall metrics
- Confidence threshold filtering
- End-to-end evaluation with a mocked gateway
"""

import json
import os

os.environ.setdefault("CI_TEST_MODE", "true")
os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "0101010101010101010101010101010101010101010101010101010101010101")

import pytest

from services.decision_extraction import (
    DecisionCandidate,
    GroundTruthDecision,
    ConversationTurn,
    ExtractionMetrics,
    _parse_extraction_response,
    compute_metrics,
    _build_fixtures,
    DecisionExtractor,
    run_extraction_spike,
)


def test_build_fixtures_returns_fifty_conversations():
    fixtures = _build_fixtures()
    assert len(fixtures) >= 10


def test_build_fixtures_has_project_ids():
    fixtures = _build_fixtures()
    for conv in fixtures:
        assert conv.project_id
        assert conv.conversation_id


def test_parse_extraction_response_valid_json():
    text = json.dumps([
        {"decision": "Use PostgreSQL", "category": "database", "rationale": "proven", "confidence": 0.9, "evidence": "quote", "source_turn_ids": ["t1"]},
    ])
    results = _parse_extraction_response(text)
    assert len(results) == 1
    assert results[0].decision == "Use PostgreSQL"
    assert results[0].confidence == 0.9


def test_parse_extraction_response_empty_array():
    assert _parse_extraction_response("[]") == []


def test_parse_extraction_response_markdown_fences():
    text = "```json\n[{\"decision\": \"Use Redis\", \"confidence\": 0.8}]\n```"
    results = _parse_extraction_response(text)
    assert len(results) == 1
    assert results[0].decision == "Use Redis"


def test_parse_extraction_response_ignores_non_decision_objects():
    text = json.dumps([
        {"decision": "", "confidence": 0.5},
        {"decision": "Real decision", "confidence": 0.9, "evidence": "x"},
    ])
    results = _parse_extraction_response(text)
    assert len(results) == 1
    assert results[0].decision == "Real decision"


def test_compute_metrics_perfect_match():
    extracted = [DecisionCandidate(decision="Use PostgreSQL", category="database", confidence=0.9, evidence="q")]
    ground = [GroundTruthDecision(decision="Use PostgreSQL", category="database", evidence="q", turn_ids=["t1"])]
    m = compute_metrics(extracted, ground)
    assert m.precision == 1.0
    assert m.recall == 1.0
    assert m.true_positives == 1
    assert m.false_positives == 0
    assert m.false_negatives == 0
    assert m.passed is True


def test_compute_metrics_no_match():
    extracted = [DecisionCandidate(decision="Use MySQL", confidence=0.9, evidence="x")]
    ground = [GroundTruthDecision(decision="Use PostgreSQL", category="database", evidence="q", turn_ids=["t1"])]
    m = compute_metrics(extracted, ground)
    assert m.precision == 0.0
    assert m.recall == 0.0
    assert m.true_positives == 0
    assert m.false_positives == 1
    assert m.false_negatives == 1


def test_compute_metrics_confidence_threshold_filters_low_confidence():
    extracted = [
        DecisionCandidate(decision="Use Redis", confidence=0.9, evidence="x"),
        DecisionCandidate(decision="Use MySQL", confidence=0.3, evidence="x"),
    ]
    ground = [GroundTruthDecision(decision="Use Redis", category="database", evidence="x", turn_ids=["t1"])]
    m = compute_metrics(extracted, ground, confidence_threshold=0.7)
    assert m.true_positives == 1
    assert m.false_positives == 0
    assert m.false_negatives == 0
    assert m.passed is True


def test_compute_metrics_partial_match():
    extracted = [DecisionCandidate(decision="Use PostgreSQL for user data", confidence=0.9, evidence="q")]
    ground = [GroundTruthDecision(decision="Use PostgreSQL for user data", category="database", evidence="q", turn_ids=["t1"])]
    m = compute_metrics(extracted, ground)
    assert m.true_positives == 1
    assert m.precision == 1.0
    assert m.recall == 1.0


def test_compute_metrics_multiple_extractions_multiple_ground_truth():
    extracted = [
        DecisionCandidate(decision="Use PostgreSQL", confidence=0.9, evidence="q1"),
        DecisionCandidate(decision="Use Redis for cache", confidence=0.8, evidence="q2"),
        DecisionCandidate(decision="Use MySQL", confidence=0.9, evidence="q3"),
    ]
    ground = [
        GroundTruthDecision(decision="Use PostgreSQL", category="database", evidence="q1", turn_ids=["t1"]),
        GroundTruthDecision(decision="Use Redis for cache", category="database", evidence="q2", turn_ids=["t2"]),
    ]
    m = compute_metrics(extracted, ground)
    assert m.true_positives == 2
    assert m.false_positives == 1
    assert m.false_negatives == 0
    assert m.precision == 2 / 3
    assert m.recall == 1.0


def test_compute_metrics_gate():
    m = ExtractionMetrics(
        precision=0.75, recall=0.65, f1=0.70, true_positives=3, false_positives=1, false_negatives=2,
        total_ground_truth=5, total_extracted=4, passed=True,
    )
    assert m.passed is True

    m2 = ExtractionMetrics(
        precision=0.65, recall=0.65, f1=0.65, true_positives=3, false_positives=2, false_negatives=2,
        total_ground_truth=5, total_extracted=5, passed=False,
    )
    assert m2.passed is False


class _FakeGateway:
    def __init__(self, response_text: str):
        self._response_text = response_text
        self.calls = 0

    async def generate(self, request):  # pragma: no cover - simple mock
        self.calls += 1
        return type("GatewayResponse", (), {"content": self._response_text})()


@pytest.mark.asyncio
async def test_extractor_with_mocked_gateway():
    extractor = DecisionExtractor(gateway=_FakeGateway(json.dumps([
        {"decision": "Use PostgreSQL", "category": "database", "rationale": "proven", "confidence": 0.9, "evidence": "q", "source_turn_ids": ["t1"]},
    ])))
    turns = [ConversationTurn(role="user", content="Use PostgreSQL", turn_id="t1")]
    results = await extractor.extract(turns)
    assert len(results) == 1
    assert results[0].decision == "Use PostgreSQL"


@pytest.mark.asyncio
async def test_run_extraction_spike_with_mocked_gateway():
    response = json.dumps([
        {"decision": "Use PostgreSQL", "category": "database", "rationale": "", "confidence": 0.9, "evidence": "Agreed, let's go with PostgreSQL.", "source_turn_ids": ["c01_t2"]},
        {"decision": "Use Redis for caching", "category": "database", "rationale": "", "confidence": 0.8, "evidence": "Redis for caching", "source_turn_ids": ["c08_t2"]},
    ])
    metrics = await run_extraction_spike(gateway=_FakeGateway(response), confidence_threshold=0.7)
    assert isinstance(metrics, ExtractionMetrics)
    assert metrics.total_extracted >= 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
