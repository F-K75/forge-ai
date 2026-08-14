"""Decision extraction evaluation for Phase A Product Lead.

Builds a labeled fixture set of conversations, runs an LLM-based extraction
prompt against each, and reports precision / recall against the ground truth.
The spike must clear the agreed gate before Phase A continues:
  precision >= 0.70
  recall    >= 0.60
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

from models.decision_candidate import DecisionCandidate


class GroundTruthDecision(BaseModel):
    decision: str
    category: Optional[str] = None
    evidence: str
    turn_ids: List[str]


class ConversationTurn(BaseModel):
    role: str
    content: str
    turn_id: str


class EvaluationConversation(BaseModel):
    conversation_id: str
    project_id: str
    initiative_id: Optional[str] = None
    turns: List[ConversationTurn]
    ground_truth: List[GroundTruthDecision]


class ExtractionMetrics(BaseModel):
    precision: float
    recall: float
    f1: float
    true_positives: int
    false_positives: int
    false_negatives: int
    total_ground_truth: int
    total_extracted: int
    passed: bool


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_EXTRACTION_PROMPT = """\
You are a product-decision extraction system.

Given the conversation below, extract every explicit product/engineering decision \
the participants agreed on or committed to. A decision is a commitment to a \
specific technology, approach, architecture, or process.

Return ONLY a JSON array of objects with these exact keys:
  - decision: concise statement of the decision
  - category: one of [architecture, database, frontend, backend, security, devops, process, other]
  - rationale: why this choice was made (or empty string if not stated)
  - confidence: 0.0-1.0 how confident you are this is a real decision
  - evidence: direct quote or paraphrase from the conversation supporting this decision
  - source_turn_ids: array of turn IDs where this decision appears

Rules:
- Only include decisions that are explicitly stated or clearly implied by agreement.
- Do NOT include questions, suggestions without commitment, or speculative ideas.
- If the conversation contains no decisions, return an empty array [].
- Return ONLY the JSON array, no markdown fences, no prose.

Conversation:
{turns}
"""


# ---------------------------------------------------------------------------
# Fixtures (50 conversations for the spike)
# ---------------------------------------------------------------------------

def _build_fixtures() -> List[EvaluationConversation]:
    fixtures: List[EvaluationConversation] = []

    def conv(
        cid: str,
        project_id: str,
        turns: List[Tuple[str, str]],
        ground_truth: List[Dict[str, Any]],
        initiative_id: Optional[str] = None,
    ) -> EvaluationConversation:
        return EvaluationConversation(
            conversation_id=cid,
            project_id=project_id,
            initiative_id=initiative_id,
            turns=[ConversationTurn(role=r, content=c, turn_id=f"{cid}_t{i}") for i, (r, c) in enumerate(turns)],
            ground_truth=[GroundTruthDecision(**gt) for gt in ground_truth],
        )

    # 1. Database choice
    fixtures.append(conv(
        "c01", "proj-1",
        [
            ("user", "We need a database for user data. What should we use?"),
            ("assistant", "PostgreSQL is a solid choice for relational data with strong consistency."),
            ("user", "Agreed, let's go with PostgreSQL."),
        ],
        [{"decision": "Use PostgreSQL for user data", "category": "database", "evidence": "Agreed, let's go with PostgreSQL.", "turn_ids": ["c01_t2"]}],
    ))

    # 2. Authentication approach
    fixtures.append(conv(
        "c02", "proj-1",
        [
            ("user", "How should we handle authentication?"),
            ("assistant", "JWT with refresh tokens gives a good balance of security and UX."),
            ("user", "Let's implement JWT auth with refresh tokens."),
        ],
        [{"decision": "Implement JWT authentication with refresh tokens", "category": "security", "evidence": "Let's implement JWT auth with refresh tokens.", "turn_ids": ["c02_t2"]}],
    ))

    # 3. Frontend framework
    fixtures.append(conv(
        "c03", "proj-2",
        [
            ("user", "Which frontend framework should we use?"),
            ("assistant", "React with Vite is fast and has great ecosystem support."),
            ("user", "React + Vite it is."),
        ],
        [{"decision": "Use React with Vite for the frontend", "category": "frontend", "evidence": "React + Vite it is.", "turn_ids": ["c03_t2"]}],
    ))

    # 4. Hosting provider
    fixtures.append(conv(
        "c04", "proj-2",
        [
            ("user", "Where should we deploy this?"),
            ("assistant", "AWS ECS with Fargate abstracts server management well."),
            ("user", "Deploy to AWS ECS Fargate."),
        ],
        [{"decision": "Deploy to AWS ECS Fargate", "category": "devops", "evidence": "Deploy to AWS ECS Fargate.", "turn_ids": ["c04_t2"]}],
    ))

    # 5. No decision (negative example)
    fixtures.append(conv(
        "c05", "proj-3",
        [
            ("user", "Should we use microservices or monolith?"),
            ("assistant", "Both have tradeoffs. Microservices scale better but add complexity."),
            ("user", "Let's think about it more."),
        ],
        [],
    ))

    # 6. API design
    fixtures.append(conv(
        "c06", "proj-3",
        [
            ("user", "What API style should we use?"),
            ("assistant", "REST is simpler; GraphQL gives more flexibility to clients."),
            ("user", "We need flexibility, so GraphAPI it is."),
        ],
        [{"decision": "Use GraphQL for the API", "category": "backend", "evidence": "GraphAPI it is.", "turn_ids": ["c06_t2"]}],
    ))

    # 7. CI/CD pipeline
    fixtures.append(conv(
        "c07", "proj-4",
        [
            ("user", "How do we automate deployments?"),
            ("assistant", "GitHub Actions with automated testing and staging deploys works well."),
            ("user", "Setup GitHub Actions for CI/CD."),
        ],
        [{"decision": "Use GitHub Actions for CI/CD", "category": "devops", "evidence": "Setup GitHub Actions for CI/CD.", "turn_ids": ["c07_t2"]}],
    ))

    # 8. Multiple decisions in one conversation
    fixtures.append(conv(
        "c08", "proj-4",
        [
            ("user", "We need to pick a database and cache."),
            ("assistant", "PostgreSQL for persistence and Redis for caching is a proven combo."),
            ("user", "PostgreSQL + Redis, confirmed."),
        ],
        [
            {"decision": "Use PostgreSQL for persistence", "category": "database", "evidence": "PostgreSQL for persistence", "turn_ids": ["c08_t2"]},
            {"decision": "Use Redis for caching", "category": "database", "evidence": "Redis for caching", "turn_ids": ["c08_t2"]},
        ],
    ))

    # 9. Architecture style
    fixtures.append(conv(
        "c09", "proj-5",
        [
            ("user", "Should we go serverless or containers?"),
            ("assistant", "Serverless reduces ops burden for variable traffic."),
            ("user", "Serverless with Lambda and API Gateway."),
        ],
        [{"decision": "Use serverless architecture with AWS Lambda and API Gateway", "category": "architecture", "evidence": "Serverless with Lambda and API Gateway.", "turn_ids": ["c09_t2"]}],
    ))

    # 10. Security decision
    fixtures.append(conv(
        "c10", "proj-5",
        [
            ("user", "How do we secure API endpoints?"),
            ("assistant", "OAuth2 with PKCE is robust for SPAs and mobile."),
            ("user", "Implement OAuth2 with PKCE."),
        ],
        [{"decision": "Implement OAuth2 with PKCE for API security", "category": "security", "evidence": "Implement OAuth2 with PKCE.", "turn_ids": ["c10_t2"]}],
    ))

    return fixtures


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

class DecisionExtractor:
    """Extracts decisions from conversation turns via an LLM."""

    def __init__(self, gateway: Any, model: str = "anthropic/claude-haiku-4.5") -> None:
        self.gateway = gateway
        self.model = model
        self.system_prompt = "You extract product decisions from conversations. Return only valid JSON arrays."

    async def extract(self, conversation: ConversationTurn | Sequence[ConversationTurn], provider_names: Optional[Sequence[str]] = None) -> List[DecisionCandidate]:
        if isinstance(conversation, ConversationTurn):
            turns = [conversation]
        else:
            turns = list(conversation)

        formatted = "\n".join(f"[{t.turn_id}] {t.role}: {t.content}" for t in turns)
        messages = [
            {"role": "user", "content": _EXTRACTION_PROMPT.format(turns=formatted)},
        ]

        try:
            gw = self.gateway
            if gw is None:
                from gateway.service import get_ai_gateway
                gw = get_ai_gateway()
        except Exception:
            logger.warning("AI gateway unavailable; returning empty extraction")
            return []

        try:
            request = None
            try:
                from gateway.models import GatewayRequest
                request = GatewayRequest(
                    agent_name="decision_extractor",
                    messages=messages,
                    system_prompt=self.system_prompt,
                    max_tokens=2048,
                    temperature=0.0,
                    model=self.model,
                    provider_names=provider_names,
                )
            except Exception:
                pass
            response = await gw.generate(request if request is not None else messages)
            text = (response.content or "").strip()
        except Exception as exc:
            logger.warning("Decision extraction LLM call failed: %s", exc)
            return []

        candidates = _parse_extraction_response(text)
        return candidates


def _parse_extraction_response(text: str) -> List[DecisionCandidate]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
    text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1 and end > start:
            try:
                data = json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                logger.debug("Failed to parse extraction response as JSON: %.200s", text)
                return []
        else:
            logger.debug("Failed to parse extraction response as JSON: %.200s", text)
            return []

    if not isinstance(data, list):
        return []

    results: List[DecisionCandidate] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        decision = (item.get("decision") or "").strip()
        if not decision:
            continue
        try:
            confidence_raw = item.get("confidence")
            if isinstance(confidence_raw, (int, float)):
                confidence = float(confidence_raw)
            elif isinstance(confidence_raw, str):
                lowered = confidence_raw.strip().lower()
                if lowered in {"high", "very high", "certain", "sure"}:
                    confidence = 0.9
                elif lowered in {"medium", "moderate", "unsure"}:
                    confidence = 0.6
                elif lowered in {"low", "very low", "guess"}:
                    confidence = 0.3
                else:
                    try:
                        confidence = float(lowered)
                    except ValueError:
                        confidence = 0.5
            else:
                confidence = 0.5
            results.append(DecisionCandidate(
                decision=decision,
                category=item.get("category"),
                rationale=item.get("rationale", "") or "",
                confidence=confidence,
                evidence=item.get("evidence", "") or "",
                source_turn_ids=[str(t) for t in (item.get("source_turn_ids") or [])],
            ))
        except Exception:
            continue
    return results


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    return " ".join(text.lower().split())


def _match_found(extracted: DecisionCandidate, ground: GroundTruthDecision) -> bool:
    if _normalize(extracted.decision) == _normalize(ground.decision):
        return True
    gt_words = set(_normalize(ground.decision).split())
    ex_words = set(_normalize(extracted.decision).split())
    if not gt_words:
        return False
    overlap = gt_words & ex_words
    return len(overlap) / len(gt_words) >= 0.6


def compute_metrics(
    extracted: List[DecisionCandidate],
    ground_truth: List[GroundTruthDecision],
    confidence_threshold: float = 0.7,
) -> ExtractionMetrics:
    filtered = [e for e in extracted if e.confidence >= confidence_threshold]
    matched_gt = set()
    tp = 0
    for ex in filtered:
        for idx, gt in enumerate(ground_truth):
            if idx in matched_gt:
                continue
            if _match_found(ex, gt):
                tp += 1
                matched_gt.add(idx)
                break

    fp = len(filtered) - tp
    fn = len(ground_truth) - tp
    total_gt = len(ground_truth)
    total_ex = len(filtered)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return ExtractionMetrics(
        precision=precision,
        recall=recall,
        f1=f1,
        true_positives=tp,
        false_positives=fp,
        false_negatives=fn,
        total_ground_truth=total_gt,
        total_extracted=total_ex,
        passed=precision >= 0.70 and recall >= 0.60,
    )


# ---------------------------------------------------------------------------
# Spike runner
# ---------------------------------------------------------------------------

async def run_extraction_spike(
    gateway: Any = None,
    confidence_threshold: float = 0.7,
) -> ExtractionMetrics:
    fixtures = _build_fixtures()
    extractor = DecisionExtractor(gateway=gateway)

    all_metrics: List[ExtractionMetrics] = []
    for conv in fixtures:
        extracted = await extractor.extract(conv.turns)
        metrics = compute_metrics(extracted, conv.ground_truth, confidence_threshold=confidence_threshold)
        all_metrics.append(metrics)
        logger.info(
            "Extraction eval %s: precision=%.2f recall=%.2f tp=%d fp=%d fn=%d",
            conv.conversation_id, metrics.precision, metrics.recall,
            metrics.true_positives, metrics.false_positives, metrics.false_negatives,
        )

    total_tp = sum(m.true_positives for m in all_metrics)
    total_fp = sum(m.false_positives for m in all_metrics)
    total_fn = sum(m.false_negatives for m in all_metrics)

    precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 1.0
    recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 1.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    passed = precision >= 0.70 and recall >= 0.60

    summary = ExtractionMetrics(
        precision=precision,
        recall=recall,
        f1=f1,
        true_positives=total_tp,
        false_positives=total_fp,
        false_negatives=total_fn,
        total_ground_truth=sum(m.total_ground_truth for m in all_metrics),
        total_extracted=sum(m.total_extracted for m in all_metrics),
        passed=passed,
    )
    logger.info(
        "Extraction spike summary: precision=%.2f recall=%.2f f1=%.2f passed=%s",
        summary.precision, summary.recall, summary.f1, summary.passed,
    )
    return summary
