from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class DecisionEngineAgent(BaseAgent):
    """Reacts to a task-state change and recommends plan updates (Module 14)."""

    prompt_role = "decision_engine"

    async def decide(self, event: str, sprint: dict, tasks: list, user_id: str = None, initiative_id: str = None, org_id: str = None) -> dict:
        context = {
            "event": event,
            "sprint": {"name": sprint.get("name"), "goal": sprint.get("goal")} if sprint else None,
            "tasks": [
                {
                    "title": t.get("title"),
                    "status": t.get("status"),
                    "category": t.get("category"),
                    "estimated_hours": t.get("estimated_hours"),
                    "dependencies": t.get("dependencies"),
                }
                for t in tasks
            ],
        }
        messages = [{"role": "user", "content": f"Context:\n{json.dumps(context, indent=2)}"}]
        response = await self.run(messages, max_tokens=2000, user_id=user_id, project_id=initiative_id, org_id=org_id)
        return parse_json_response(response)
