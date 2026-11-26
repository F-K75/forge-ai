"""Evaluation Engine & Role-Based Model Router.

Provides:
1. Role-Based Model Routing (`ModelRouter`): maps each of the 9 autonomous
   engineering departments to an economical model tier (`reasoning` | `balanced` | `fast`)
   with automatic tier escalation on autonomous repair rounds and graceful
   downgrade when remaining run budget is tight.
2. Run Cost Budget Guard (`CostBudgetGuard`): enforces per-run USD spending caps
   with clean circuit-breaking before runaway LLM costs occur.
3. Objective Artifact Evaluator (`ArtifactEvaluator`): scores published Shared
   Blackboard artifacts on concrete structural rubrics (deliverable completeness,
   file/contract traceability, conflict safety, and blocking-finding clearance).
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class BudgetExceededError(Exception):
    """Raised when a KernelRun exhausts its configured USD budget cap."""


@dataclass(frozen=True)
class ModelRouteDecision:
    tier: str  # reasoning | balanced | fast
    model_id: str
    estimated_cost_per_call_usd: float
    rationale: str
    task_complexity: str = "medium"  # high | medium | low
    provider_preference: Tuple[str, ...] = ("google", "anthropic", "openai")
    input_cost_per_1m_usd: float = 0.30
    output_cost_per_1m_usd: float = 2.50

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["provider_preference"] = list(self.provider_preference)
        return data


MODEL_TIERS: Dict[str, ModelRouteDecision] = {
    "reasoning": ModelRouteDecision(
        tier="reasoning",
        model_id="gemini-2.5-pro",
        estimated_cost_per_call_usd=0.045,
        rationale="High-reasoning tier for architecture, security audits, leadership decisions, and repair rounds",
        task_complexity="high",
        provider_preference=("google", "anthropic", "openai"),
        input_cost_per_1m_usd=1.25,
        output_cost_per_1m_usd=10.0,
    ),
    "balanced": ModelRouteDecision(
        tier="balanced",
        model_id="gemini-2.5-flash",
        estimated_cost_per_call_usd=0.012,
        rationale="Balanced code/test generation tier for engineering, design, QA, and infrastructure tasks",
        task_complexity="medium",
        provider_preference=("google", "openai", "anthropic"),
        input_cost_per_1m_usd=0.30,
        output_cost_per_1m_usd=2.50,
    ),
    "fast": ModelRouteDecision(
        tier="fast",
        model_id="gemini-2.5-flash-lite",
        estimated_cost_per_call_usd=0.004,
        rationale="Low-latency economical tier for documentation, checklists, and budget-constrained execution",
        task_complexity="low",
        provider_preference=("google", "openai"),
        input_cost_per_1m_usd=0.10,
        output_cost_per_1m_usd=0.40,
    ),
}

DEPARTMENT_DEFAULT_TIER: Dict[str, str] = {
    "leadership": "reasoning",
    "business": "balanced",
    "architecture": "reasoning",
    "design": "balanced",
    "engineering": "balanced",
    "infrastructure": "balanced",
    "security": "reasoning",
    "quality": "balanced",
    "delivery": "fast",
}


class ModelRouter:
    """Selects optimal model tier & provider chain per department/role with repair escalation and budget awareness."""

    def select_model(
        self,
        *,
        department: str,
        role: str,
        repair_round: int = 0,
        budget_remaining_usd: Optional[float] = None,
        prefer_local: bool = False,
    ) -> ModelRouteDecision:
        use_local = prefer_local or os.getenv("FORGE_LOCAL_LLM_ENABLED") == "1"
        tier = DEPARTMENT_DEFAULT_TIER.get(department, "balanced")
        if role == "documentation_agent":
            tier = "fast"

        # Escalate to reasoning tier during self-healing remediation rounds
        if repair_round > 0 and tier != "reasoning":
            tier = "reasoning"

        decision = MODEL_TIERS[tier]
        # Downgrade gracefully if remaining budget cannot comfortably cover a reasoning call
        if budget_remaining_usd is not None and budget_remaining_usd < decision.estimated_cost_per_call_usd * 2:
            if tier == "reasoning" and budget_remaining_usd >= MODEL_TIERS["balanced"].estimated_cost_per_call_usd:
                decision = ModelRouteDecision(
                    tier="balanced",
                    model_id=MODEL_TIERS["balanced"].model_id,
                    estimated_cost_per_call_usd=MODEL_TIERS["balanced"].estimated_cost_per_call_usd,
                    rationale="Budget-aware downgrade from reasoning to balanced tier",
                    task_complexity="medium",
                    provider_preference=MODEL_TIERS["balanced"].provider_preference,
                    input_cost_per_1m_usd=MODEL_TIERS["balanced"].input_cost_per_1m_usd,
                    output_cost_per_1m_usd=MODEL_TIERS["balanced"].output_cost_per_1m_usd,
                )
            elif budget_remaining_usd < MODEL_TIERS["balanced"].estimated_cost_per_call_usd:
                decision = ModelRouteDecision(
                    tier="fast",
                    model_id=MODEL_TIERS["fast"].model_id,
                    estimated_cost_per_call_usd=MODEL_TIERS["fast"].estimated_cost_per_call_usd,
                    rationale="Budget-aware downgrade to economical fast tier",
                    task_complexity="low",
                    provider_preference=MODEL_TIERS["fast"].provider_preference,
                    input_cost_per_1m_usd=MODEL_TIERS["fast"].input_cost_per_1m_usd,
                    output_cost_per_1m_usd=MODEL_TIERS["fast"].output_cost_per_1m_usd,
                )

        if use_local and decision.tier in ("balanced", "fast"):
            local_model = os.getenv("FORGE_LOCAL_LLM_MODEL", "qwen2.5-coder:32b")
            return ModelRouteDecision(
                tier=decision.tier,
                model_id=local_model,
                estimated_cost_per_call_usd=0.001,
                rationale=f"Self-hosted local inference preference ({local_model}) with cloud failover",
                task_complexity=decision.task_complexity,
                provider_preference=("ollama", "vllm", *decision.provider_preference),
                input_cost_per_1m_usd=0.0,
                output_cost_per_1m_usd=0.0,
            )
        return decision

    @staticmethod
    def compute_actual_cost(
        usage: Optional[Dict[str, Any]], decision: ModelRouteDecision
    ) -> float:
        """Compute exact USD cost from real provider token usage (with fallback to estimate)."""
        if not isinstance(usage, dict):
            return decision.estimated_cost_per_call_usd
        explicit = usage.get("cost_usd")
        if explicit is not None and float(explicit) > 0:
            return round(float(explicit), 6)
        in_tok = int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0)
        out_tok = int(usage.get("output_tokens") or usage.get("completion_tokens") or 0)
        if in_tok > 0 or out_tok > 0:
            usd = (in_tok / 1_000_000.0) * decision.input_cost_per_1m_usd + (
                out_tok / 1_000_000.0
            ) * decision.output_cost_per_1m_usd
            return round(usd, 6)
        return decision.estimated_cost_per_call_usd


class CostBudgetGuard:
    """Tracks per-run spend and enforces hard USD ceiling."""

    def __init__(self, max_budget_usd: float = 2.50) -> None:
        self.max_budget_usd = max(0.01, float(max_budget_usd))
        self.spent_usd: float = 0.0
        self.per_task_cost: Dict[str, float] = {}

    @property
    def remaining_usd(self) -> float:
        return max(0.0, round(self.max_budget_usd - self.spent_usd, 6))

    def check_can_spend(self, estimated_cost_usd: float) -> None:
        if self.spent_usd + estimated_cost_usd > self.max_budget_usd + 1e-9:
            raise BudgetExceededError(
                f"Run budget cap (${self.max_budget_usd:.4f}) exceeded "
                f"(spent=${self.spent_usd:.4f}, next=${estimated_cost_usd:.4f})"
            )

    def record_cost(self, task_id: str, cost_usd: float) -> None:
        clean = max(0.0, float(cost_usd))
        self.spent_usd = round(self.spent_usd + clean, 6)
        self.per_task_cost[task_id] = round(self.per_task_cost.get(task_id, 0.0) + clean, 6)

    def summary(self) -> Dict[str, Any]:
        return {
            "max_budget_usd": self.max_budget_usd,
            "spent_usd": self.spent_usd,
            "remaining_usd": self.remaining_usd,
            "utilization_pct": round((self.spent_usd / self.max_budget_usd) * 100.0, 1),
        }


@dataclass
class ArtifactEvaluation:
    artifact_id: str
    producer_role: str
    artifact_type: str
    version: int
    completeness_score: float
    traceability_score: float
    conflict_safety_score: float
    verification_score: float
    overall_score: float
    passed: bool
    notes: List[str] = field(default_factory=list)
    evaluated_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ArtifactEvaluator:
    """Evaluates Shared Blackboard artifacts against deterministic quality rubrics."""

    def evaluate(
        self,
        artifact: Dict[str, Any],
        *,
        active_conflicts: Sequence[Dict[str, Any]] = (),
        has_blocking_findings: bool = False,
        pass_threshold: float = 0.75,
    ) -> ArtifactEvaluation:
        notes: List[str] = []
        summary = str(artifact.get("summary") or "").strip()
        touched_files = artifact.get("touched_files") or []
        task_id = artifact.get("producer_task_id")

        # 1. Completeness: meaningful non-trivial summary
        if len(summary) >= 24:
            completeness = 1.0
        elif len(summary) >= 8:
            completeness = 0.7
            notes.append("Summary is brief; consider adding explicit acceptance criteria.")
        else:
            completeness = 0.3
            notes.append("Artifact summary is empty or too short.")

        # 2. Traceability: files or structured payload linked
        payload = artifact.get("payload") or {}
        if touched_files or len(payload.keys()) >= 2:
            traceability = 1.0
        else:
            traceability = 0.7
            notes.append("No touched files recorded for traceability.")

        # 3. Conflict safety: penalize if artifact's task collided in same wave
        collided = any(
            task_id in (c.get("task_ids") or []) and c.get("status") != "resolved"
            for c in active_conflicts
        )
        conflict_safety = 0.5 if collided else 1.0
        if collided:
            notes.append("Same-wave file conflict detected; requires isolated worktree merge.")

        # 4. Verification clearance: zero unresolved blocking findings
        verification = 0.25 if has_blocking_findings else 1.0
        if has_blocking_findings:
            notes.append("Blocking review findings remain unresolved.")

        overall = round(
            0.30 * completeness + 0.20 * traceability + 0.20 * conflict_safety + 0.30 * verification,
            3,
        )
        return ArtifactEvaluation(
            artifact_id=str(artifact.get("artifact_id") or ""),
            producer_role=str(artifact.get("producer_role") or ""),
            artifact_type=str(artifact.get("artifact_type") or ""),
            version=int(artifact.get("version") or 1),
            completeness_score=completeness,
            traceability_score=traceability,
            conflict_safety_score=conflict_safety,
            verification_score=verification,
            overall_score=overall,
            passed=(overall >= pass_threshold and not has_blocking_findings),
            notes=notes,
        )
