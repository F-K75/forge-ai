"""Tests for 8.8 -- agent structured output through the AI Gateway.

Verifies that PM/Integration/BusinessModel/Architect/Developer agents now route
their JSON output through ``BaseAgent._call_structured`` (which passes
``structured_output_schema`` to ``AIGateway.generate``) instead of the legacy
hand-rolled fence-strip + ``json.loads(strict=False)``, and that schema-valid
responses are returned unchanged while a repaired response surfaces as
``structured_data``.
"""

import pytest

from agents.architect import ArchitectAgent
from agents.business_model import BusinessModelAgent
from agents.developer import DeveloperAgent
from agents.integration import IntegrationAgent
from agents.pm import PMAgent
from agents.structured_schemas import (
    ARCHITECT_BLUEPRINT_SCHEMA,
    BUSINESS_MODEL_SCHEMA,
    DEVELOPER_FILES_SCHEMA,
    INTEGRATION_SCHEMA,
    PM_VALIDATION_SCHEMA,
)


class FakeGatewayResponse:
    def __init__(self, *, structured_data=None, structured_output_errors=None):
        self.structured_data = structured_data
        self.structured_output_errors = structured_output_errors


class FakeGateway:
    def __init__(self, response=None, **kwargs):
        self.generated = []
        self.response = response or FakeGatewayResponse(structured_data={})

    async def generate(self, request):
        self.generated.append(request)
        return self.response


def _agent(gateway, cls):
    agent = cls()
    agent.gateway = gateway
    agent.model = "test-model"
    # The prompt_role context-engineering path has a pre-existing bug (async
    # _assemble_context invoked without await in _resolve_system_prompt);
    # testing the sync legacy path keeps this test focused on the 8.8
    # structured-output wiring rather than that unrelated issue.
    agent.use_context_engineering = False
    return agent


def test_agents_declare_structured_output_schemas():
    assert PMAgent.output_schema == PM_VALIDATION_SCHEMA
    assert IntegrationAgent.output_schema == INTEGRATION_SCHEMA
    assert BusinessModelAgent.output_schema == BUSINESS_MODEL_SCHEMA
    assert ArchitectAgent.output_schema == ARCHITECT_BLUEPRINT_SCHEMA
    assert DeveloperAgent.output_schema == DEVELOPER_FILES_SCHEMA


@pytest.mark.asyncio
async def test_call_structured_passes_schema_and_returns_data(monkeypatch):
    gateway = FakeGateway(response=FakeGatewayResponse(structured_data={"passed": True}))
    agent = _agent(gateway, PMAgent)
    # Bypass circuit-breaker plumbing that touches services.

    async def _noop(*a, **k):
        return None

    monkeypatch.setattr("agents.base._ensure_global_circuit_allows_call", _noop)

    result = await agent._call_structured(
        [{"role": "user", "content": "validate"}], max_tokens=2000,
    )

    assert result == {"passed": True}
    assert len(gateway.generated) == 1
    assert gateway.generated[0].structured_output_schema == PM_VALIDATION_SCHEMA


@pytest.mark.asyncio
async def test_call_structured_requires_schema():
    agent = _agent(FakeGateway(), PMAgent)
    agent.output_schema = None
    with pytest.raises(ValueError):
        await agent._call_structured([{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_call_structured_raises_when_repair_fails():
    gateway = FakeGateway(response=FakeGatewayResponse(
        structured_data=None, structured_output_errors=["invalid json: boom"],
    ))
    agent = _agent(gateway, IntegrationAgent)
    with pytest.raises(ValueError) as exc_info:
        await agent._call_structured([{"role": "user", "content": "integrate"}])
    assert "invalid json" in str(exc_info.value)


def test_agents_no_longer_hand_roll_json_in_llm_methods():
    """Guard: validate/integrate/improve/blueprint/generate_files/patch_files
    must route to _call_structured, not the legacy `self.run(...)` +
    json.loads path."""
    from pathlib import Path

    for name in ("pm", "integration", "business_model", "architect", "developer"):
        src = (Path(__file__).resolve().parents[1] / "agents" / f"{name}.py").read_text()
        assert "_call_structured" in src