import pytest

from prompt_builder.builder import PromptBuilder, PromptValidationError
from prompt_builder.models import PromptContext


@pytest.fixture
def builder():
    return PromptBuilder()


@pytest.mark.parametrize(
    "role,phrase",
    [
        ("architect", "produce a precise technical blueprint"),
        ("developer", "production-ready code"),
        ("product_manager", "Validate that generated code meets"),
    ],
)
def test_build_preserves_original_instruction_content(builder, role, phrase):
    context = PromptContext(agent_role=role, task="Do the task.")
    result = builder.build(context)
    assert phrase in result.prompt


def test_build_returns_metadata(builder):
    context = PromptContext(agent_role="architect", task="Build a todo app.")
    result = builder.build(context)
    meta = result.metadata
    assert meta.agent == "architect"
    assert meta.template_version == "v1"
    assert meta.estimated_tokens > 0
    assert meta.build_time_ms < 20
    assert len(meta.prompt_hash) == 16


def test_build_is_deterministic_hash(builder):
    context = PromptContext(agent_role="architect", task="Build a todo app.")
    r1 = builder.build(context)
    r2 = builder.build(context)
    assert r1.metadata.prompt_hash == r2.metadata.prompt_hash


def test_build_raises_on_missing_required_task(builder):
    context = PromptContext(agent_role="architect", task="")
    with pytest.raises(PromptValidationError):
        builder.build(context)


def test_architect_clarify_variant_differs_from_blueprint(builder):
    blueprint_ctx = PromptContext(agent_role="architect", task="Build a todo app.")
    clarify_ctx = PromptContext(agent_role="architect", task="Build a todo app.", template_version="clarify-v1")
    blueprint_result = builder.build(blueprint_ctx)
    clarify_result = builder.build(clarify_ctx)
    assert blueprint_result.prompt != clarify_result.prompt
    assert "at most 4 short questions" in clarify_result.prompt
