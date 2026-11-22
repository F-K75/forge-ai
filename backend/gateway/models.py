from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from pydantic import BaseModel, ConfigDict, Field


class GatewayRequest(BaseModel):
    """Provider-independent request contract. Agents build one of these and
    hand it to `AIGateway.generate`/`AIGateway.stream` instead of talking to
    `LLMRouter` or any provider adapter directly."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    agent_name: str
    messages: List[Dict[str, Any]]
    system_prompt: str = ""
    model: Optional[str] = None
    task_complexity: Optional[str] = None
    use_retrieval: bool = False
    max_tokens: int = 8192
    temperature: float = 0.0
    tools: Optional[List[Dict[str, Any]]] = None
    structured_output_schema: Optional[Dict[str, Any]] = None
    streaming: bool = False
    user_id: Optional[str] = None
    build_id: Optional[str] = None
    project_id: Optional[str] = None
    org_id: Optional[str] = None
    provider_names: Optional[Sequence[str]] = None
    byok: Optional[Dict[str, Any]] = None
    usage_out: Optional[Dict[str, Any]] = None
    # A2 (docs/architecture/agent-collaboration-plan.md §5, §15.2).
    # Channel of this call: `generation` (default) for agent work; platform
    # channels such as `shadow` or `monitoring` are recorded without a
    # user_id and need consent to touch BYOK content.
    purpose: Optional[str] = None
    # Explicit processing-boundary snapshot (`build.processing_boundary`).
    # When absent the build scope's snapshot applies, else the safe default
    # (a request carrying `byok` is BYOK with no consents).
    processing_boundary: Optional[Dict[str, Any]] = None


class GatewayResponse(BaseModel):
    """Unified response contract. Agents never parse provider-specific
    response shapes -- only this model."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    content: str
    finish_reason: Optional[str] = None
    usage: Dict[str, int] = Field(default_factory=dict)
    latency_ms: float = 0.0
    provider: str
    model: str
    request_id: str
    cost_usd: float = 0.0
    tool_calls: Optional[List[Dict[str, Any]]] = None
    structured_data: Optional[Dict[str, Any]] = None
    structured_output_errors: Optional[List[str]] = None
    guardrail_blocked: bool = False
    guardrail_categories: Optional[List[str]] = None
    # Guardrail v2 outcome (gateway.guardrails.GuardrailOutcome.to_dict()).
    # `guardrail_unverified`: a required L-tier screen could not complete;
    # the artifact may be kept but must not count as passed (B2 maps it to
    # quality INCOMPLETE). `artifact_withheld`: the version must not be
    # published (A3 keeps the previous version active).
    guardrail_unverified: bool = False
    artifact_withheld: bool = False
    guardrail_outcome: Optional[Dict[str, Any]] = None
    raw: Optional[Any] = None
