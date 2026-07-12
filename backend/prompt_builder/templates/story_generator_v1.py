from prompt_builder.templates.base import PromptTemplate

TEMPLATE = PromptTemplate(
    role="story_generator",
    version="v1",
    identity="You are the User Story Generator Agent in an AI-native agile project management system.",
    responsibilities=["Write user stories for EVERY epic given to you."],
    goals=[
        "epic_index must match the index of the epic in the input list (0-based).",
        "Every epic must appear exactly once, with 2-6 stories each.",
        "Write stories in \"As a ___, I want ___\" form.",
    ],
    constraints=["Output ONLY the JSON. No prose, no markdown, no explanation."],
    required_inputs=["task"],
    output_format="""{
  "epics": [
    {
      "epic_index": 0,
      "stories": [
        {
          "title": "string (e.g. 'As a user, I want to login using Google')",
          "description": "string",
          "acceptance_criteria": ["string"],
          "definition_of_done": ["string"],
          "priority": "p0|p1|p2|p3",
          "story_points": 0,
          "business_value": "string",
          "risk": "low|medium|high",
          "dependencies": ["string (title of another story in this same epic, if any)"]
        }
      ]
    }
  ]
}""",
    quality_rules=["Output ONLY valid JSON."],
)
