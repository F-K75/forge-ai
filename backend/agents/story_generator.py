from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class StoryGeneratorAgent(BaseAgent):
    """Epics -> user stories, generated for all epics in one call (Module 4).

    Grouped by epic_index (the epic's position in the list passed in) rather
    than by real epic id, since story generation happens before stories are
    persisted -- the caller resolves epic_index back to a real Epic id.
    """

    system_prompt = """You are the User Story Generator Agent in an AI-native agile project management system.

Your job: write user stories for EVERY epic given to you.

Output ONLY a JSON object with this exact structure:
{
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
}

Rules:
- epic_index must match the index of the epic in the input list (0-based).
- Every epic must appear exactly once, with 2-6 stories each.
- Write stories in "As a ___, I want ___" form.
- Output ONLY the JSON. No prose, no markdown, no explanation.
"""

    async def generate(self, initiative: dict, epics: list, user_id: str = None, initiative_id: str = None, org_id: str = None) -> dict:
        indexed_epics = [
            {"index": i, "title": e.get("title"), "description": e.get("description"), "priority": e.get("priority")}
            for i, e in enumerate(epics)
        ]
        context = {"project_vision": initiative.get("vision"), "epics": indexed_epics}
        messages = [{"role": "user", "content": f"Context:\n{json.dumps(context, indent=2)}"}]
        response = await self.run(
            messages, max_tokens=8192, user_id=user_id, project_id=initiative_id, org_id=org_id
        )
        return parse_json_response(response)
