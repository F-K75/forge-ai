from agents.base import BaseAgent
from core.models import AgentType
import json


class DevOpsAgent(BaseAgent):
    agent_type = AgentType.DEVOPS
    prompt_role = "devops"

    async def plan(self, task: str, user_id: str = None, build_id: str = None, project_id: str = None, org_id: str = None) -> dict:
        messages = [
            {
                "role": "user",
                "content": f"DevOps task: {task}",
            }
        ]
        response = await self.run(messages, max_tokens=4096, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id)
        clean = response.strip().strip("```json").strip("```").strip()
        return json.loads(clean, strict=False)
