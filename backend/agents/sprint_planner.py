from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class SprintPlannerAgent(BaseAgent):
    """Tasks + capacity -> a sprint plan (Module 6)."""

    prompt_role = "sprint_planner"

    async def plan(self, initiative: dict, tasks: list, capacity_hours: int = 80, user_id: str = None, initiative_id: str = None, org_id: str = None) -> dict:
        indexed_tasks = [
            {
                "index": i,
                "title": t.get("title"),
                "category": t.get("category"),
                "estimated_hours": t.get("estimated_hours"),
                "complexity": t.get("complexity"),
                "assigned_agent": t.get("assigned_agent"),
            }
            for i, t in enumerate(tasks)
        ]
        context = {"project_vision": initiative.get("vision"), "sprint_capacity_hours": capacity_hours, "tasks": indexed_tasks}
        messages = [{"role": "user", "content": f"Context:\n{json.dumps(context, indent=2)}"}]
        response = await self.run(
            messages, max_tokens=8192, user_id=user_id, project_id=initiative_id, org_id=org_id
        )
        return parse_json_response(response)
