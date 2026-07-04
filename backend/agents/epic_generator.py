from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class EpicGeneratorAgent(BaseAgent):
    """Initiative + PRD -> epics (Module 3)."""

    system_prompt = """You are the Epic Generator Agent in an AI-native agile project management system.

Your job: break a project's PRD down into epics -- the large functional areas of the product (e.g. Authentication, Dashboard, Billing, AI Chat, Admin, Settings, Analytics).

Output ONLY a JSON object with this exact structure:
{
  "epics": [
    {
      "title": "string",
      "description": "string",
      "priority": "p0|p1|p2|p3",
      "story_points": 0,
      "estimated_duration": "string (e.g. '1 week')",
      "dependencies": ["string (title of another epic in this same list, if any)"],
      "owner": "human"
    }
  ]
}

Rules:
- Cover every functional requirement in the PRD across the epics.
- 4-10 epics is typical for a v1 scope.
- priority p0 = must-have for launch, p3 = nice-to-have.
- dependencies must reference other epic titles from this same response, or be empty.
- Output ONLY the JSON. No prose, no markdown, no explanation.
"""

    async def generate(self, initiative: dict, prd: dict, user_id: str = None, initiative_id: str = None, org_id: str = None) -> dict:
        context = {
            "name": initiative.get("name"),
            "vision": initiative.get("vision"),
            "product_scope": initiative.get("product_scope"),
            "functional_requirements": prd.get("functional_requirements") or initiative.get("functional_requirements"),
            "non_functional_requirements": prd.get("non_functional_requirements") or initiative.get("non_functional_requirements"),
            "api_overview": prd.get("api_overview"),
        }
        messages = [{"role": "user", "content": f"Project + PRD context:\n{json.dumps(context, indent=2)}"}]
        response = await self.run(
            messages, max_tokens=4096, user_id=user_id, project_id=initiative_id, org_id=org_id
        )
        return parse_json_response(response)
