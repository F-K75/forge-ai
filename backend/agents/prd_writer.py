from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class PRDWriterAgent(BaseAgent):
    """Initiative foundation -> full Product Requirements Document (Module 2)."""

    prompt_role = "prd_writer"

    async def write(self, initiative: dict, user_id: str = None, initiative_id: str = None, org_id: str = None) -> dict:
        context = {
            "name": initiative.get("name"),
            "vision": initiative.get("vision"),
            "business_goals": initiative.get("business_goals"),
            "product_scope": initiative.get("product_scope"),
            "functional_requirements": initiative.get("functional_requirements"),
            "non_functional_requirements": initiative.get("non_functional_requirements"),
            "tech_stack": initiative.get("tech_stack"),
        }
        messages = [{"role": "user", "content": f"Project context:\n{json.dumps(context, indent=2)}"}]
        response = await self.run(
            messages, max_tokens=4096, user_id=user_id, project_id=initiative_id, org_id=org_id
        )
        return parse_json_response(response)
