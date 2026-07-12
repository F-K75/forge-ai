from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class EpicGeneratorAgent(BaseAgent):
    """Initiative + PRD -> epics (Module 3)."""

    prompt_role = "epic_generator"

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
