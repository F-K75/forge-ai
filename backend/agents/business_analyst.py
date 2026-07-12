from agents.base import BaseAgent
from agents.json_utils import parse_json_response


class BusinessAnalystAgent(BaseAgent):
    """Idea -> Project Vision / Goals / Scope / Requirements / Roadmap (Module 1)."""

    prompt_role = "business_analyst"

    async def analyze(self, prompt: str, user_id: str = None, initiative_id: str = None, org_id: str = None) -> dict:
        messages = [{"role": "user", "content": f"App idea: {prompt}"}]
        response = await self.run(
            messages, max_tokens=4096, user_id=user_id, project_id=initiative_id, org_id=org_id
        )
        return parse_json_response(response)
