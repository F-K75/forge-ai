import pytest

from prompt_builder.models import PromptContext
from prompt_builder.registry import get_template_registry


@pytest.mark.parametrize("template", get_template_registry().list(), ids=lambda t: f"{t.role}:{t.version}")
def test_template_renders_without_error(template):
    context = PromptContext(agent_role=template.role, task="Do the thing.", template_version=template.version)
    rendered = template.render(context)
    assert template.identity.strip() in rendered
    assert "# Current Task" in rendered


def test_empty_optional_sections_are_omitted():
    from prompt_builder.templates import architect_v1

    template = architect_v1.TEMPLATE
    context = PromptContext(agent_role="architect", task="Build a todo app.")
    rendered = template.render(context)
    assert "# Relevant Files" not in rendered
    assert "# Previous Agent Outputs" not in rendered
    assert "# User Request" not in rendered


def test_present_sections_are_included():
    from prompt_builder.templates import developer_v1

    template = developer_v1.TEMPLATE
    context = PromptContext(
        agent_role="developer",
        task="Generate the files.",
        relevant_files=["frontend/src/App.tsx"],
        previous_outputs={"architect": '{"app_name": "Todo"}'},
        user_request="Follow the SaaS template conventions.",
    )
    rendered = template.render(context)
    assert "# Relevant Files" in rendered
    assert "frontend/src/App.tsx" in rendered
    assert "# Previous Agent Outputs" in rendered
    assert "architect" in rendered
    assert "# User Request" in rendered
