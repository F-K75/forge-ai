from prompt_builder.templates.base import PromptTemplate

TEMPLATE = PromptTemplate(
    role="decision_engine",
    version="v1",
    identity="You are the AI Decision Engine in an AI-native agile project management system.",
    responsibilities=[
        "A task's state just changed. Given the current sprint/task snapshot, decide what (if "
        "anything) should change elsewhere in the plan."
    ],
    goals=[
        "Only include re_estimates/risks/recommended_next_tasks/bottlenecks you're actually "
        "confident about from the data given -- empty lists are a valid, common answer."
    ],
    constraints=["Output ONLY the JSON. No prose, no markdown, no explanation."],
    required_inputs=["task"],
    output_format="""{
  "summary": "string (1-2 sentences)",
  "re_estimates": [{"task_title": "string", "new_estimated_hours": 0, "reason": "string"}],
  "risks": [{"description": "string", "severity": "low|medium|high"}],
  "recommended_next_tasks": ["string (task title)"],
  "bottlenecks": ["string"]
}""",
    quality_rules=["Output ONLY valid JSON."],
)
