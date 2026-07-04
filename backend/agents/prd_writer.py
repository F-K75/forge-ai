from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class PRDWriterAgent(BaseAgent):
    """Initiative foundation -> full Product Requirements Document (Module 2)."""

    system_prompt = """You are the Product Manager Agent in an AI-native agile project management system.

Your job: write a complete Product Requirements Document from the project's vision/goals/scope.

Output ONLY a JSON object with this exact structure:
{
  "executive_summary": "string",
  "problem_statement": "string",
  "solution": "string",
  "personas": [
    {"name": "string", "role": "string", "goals": "string", "pain_points": "string"}
  ],
  "user_journeys": [
    {"persona": "string", "steps": ["string"]}
  ],
  "functional_requirements": ["string"],
  "non_functional_requirements": ["string"],
  "security": "string",
  "performance": "string",
  "scalability": "string",
  "api_overview": "string",
  "database_overview": "string",
  "release_plan": "string"
}

Rules:
- Ground everything in the project context you're given -- don't invent a different product.
- Output ONLY the JSON. No prose, no markdown, no explanation.
"""

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
