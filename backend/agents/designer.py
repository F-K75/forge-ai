from agents.base import BaseAgent
from core.models import AgentType
import json


class DesignerAgent(BaseAgent):
    agent_type = AgentType.DESIGNER
    prompt_role = "designer"

    async def design(self, blueprint: dict, user_id: str = None, build_id: str = None, project_id: str = None, org_id: str = None) -> dict:
        messages = [
            {
                "role": "user",
                "content": f"Create design system for this app:\n{json.dumps(blueprint, indent=2)}"
            }
        ]
        response = await self.run(messages, max_tokens=3000, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id)
        clean = response.strip().strip("```json").strip("```").strip()
        # strict=False: some models (esp. non-Claude ones via BYOK) emit
        # literal control characters (raw newlines) inside JSON strings
        # instead of the \n escape the system prompt asks for.
        return json.loads(clean, strict=False)
