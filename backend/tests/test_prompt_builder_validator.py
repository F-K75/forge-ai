from prompt_builder.models import PromptContext
from prompt_builder.templates.architect_v1 import TEMPLATE as ARCHITECT_TEMPLATE
from prompt_builder.validator import validate


def test_missing_required_var():
    context = PromptContext(agent_role="architect", task="")
    result = validate(context, ARCHITECT_TEMPLATE)
    assert not result.is_valid
    assert any(e.code == "missing_variable" for e in result.errors)


def test_valid_context_passes():
    context = PromptContext(agent_role="architect", task="Build a todo app.")
    result = validate(context, ARCHITECT_TEMPLATE)
    assert result.is_valid


def test_duplicate_context_flagged():
    context = PromptContext(
        agent_role="architect",
        task="Build a todo app.",
        previous_outputs={"designer": "same output", "qa": "same output"},
    )
    result = validate(context, ARCHITECT_TEMPLATE)
    assert any(e.code == "duplicate_context" for e in result.errors)


def test_circular_reference_flagged():
    context = PromptContext(
        agent_role="architect",
        task="Build a todo app.",
        previous_outputs={"architect": "self-reference"},
    )
    result = validate(context, ARCHITECT_TEMPLATE)
    assert not result.is_valid
    assert any(e.code == "circular_reference" for e in result.errors)


def test_invalid_template_role_mismatch():
    from prompt_builder.templates.developer_v1 import TEMPLATE as DEV_TEMPLATE

    context = PromptContext(agent_role="architect", task="Build a todo app.")
    result = validate(context, DEV_TEMPLATE)
    assert not result.is_valid
    assert any(e.code == "invalid_template" for e in result.errors)
