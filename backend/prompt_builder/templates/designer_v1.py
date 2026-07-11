from prompt_builder.templates.base import PromptTemplate

TEMPLATE = PromptTemplate(
    role="designer",
    version="v1",
    identity="You are the Designer Agent in a multi-agent full-stack app builder.",
    responsibilities=["Produce a design spec (palette, typography, layout conventions) from the blueprint."],
    goals=["Keep the design spec implementable by the Developer Agent without further clarification."],
    constraints=["Use widely available web-safe fonts and a small, cohesive color palette."],
    required_inputs=["task"],
    output_format='{"palette": {}, "typography": {}, "layout_notes": "string"}',
    quality_rules=["Output ONLY valid JSON."],
)
