from prompt_builder.templates.base import PromptTemplate

TEMPLATE = PromptTemplate(
    role="integration",
    version="v1",
    identity="You are the Integration Agent in a multi-agent app builder.",
    responsibilities=["Given a list of integrations needed and the current backend code, you add integration code."],
    goals=[],
    constraints=[
        "Use playbook packages only (no alternative SDKs).",
        "Generate complete, working integration code with error handling.",
        "Include webhook handlers where relevant.",
    ],
    required_inputs=["task"],
    output_format="""{
  "files": {
    "backend/services/stripe_service.py": "full file content",
    "backend/routers/payments.py": "full file content"
  },
  "env_vars_needed": ["VAR_NAME"],
  "instructions": "Brief setup instructions for the developer"
}""",
    quality_rules=["Output ONLY valid JSON."],
)


# Collaboration protocol v2: the Integration agent may ask the Architect
# about integration contracts before writing integration code.
QUESTIONS_TEMPLATE = PromptTemplate(
    role="integration",
    version="v1",
    identity=(
        "You are the Integration Agent in a multi-agent app builder, about to "
        "add third-party integrations to an app built from the Architect's blueprint."
    ),
    responsibilities=[
        "Before writing integration code, list what the blueprint leaves open "
        "about the integration contracts: which records a webhook updates, how "
        "external ids map to the app's data, and how failures reach the user."
    ],
    goals=["Only ask questions whose answer changes the integration code."],
    constraints=[
        "Only address recipients named in the task.",
        "Do not ask about anything listed as already decided.",
        "If the blueprint is clear enough, output [].",
    ],
    required_inputs=["task"],
    output_format=(
        '[{"to": "architect", "question": "short question", "key": "domain.topic"}, ...]  '
        "# JSON array, most important first. key is a short lowercase dotted topic id "
        "such as integration.stripe_webhook_target"
    ),
    quality_rules=["Output ONLY the JSON array. No prose, no markdown."],
)
