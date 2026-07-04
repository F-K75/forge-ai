from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class SprintPlannerAgent(BaseAgent):
    """Tasks + capacity -> a sprint plan (Module 6)."""

    system_prompt = """You are the AI Sprint Planner Agent in an AI-native agile project management system.

Your job: group engineering tasks into sprints, respecting dependencies and capacity.

Output ONLY a JSON object with this exact structure:
{
  "sprints": [
    {
      "sprint_number": 1,
      "name": "string",
      "goal": "string",
      "task_indexes": [0, 1, 2],
      "capacity": 0,
      "velocity": 0,
      "story_points_planned": 0,
      "team_load": {"backend_agent": 0, "frontend_agent": 0},
      "agent_load": {"backend_agent": 0, "frontend_agent": 0},
      "completion_probability": 0.0
    }
  ]
}

Rules:
- task_indexes refers to the 0-based index of each task in the input list.
- Every task index must appear in exactly one sprint, in dependency order (a task's dependencies must land in the same or an earlier sprint).
- Don't exceed the given capacity (in estimated hours) per sprint.
- completion_probability is 0.0-1.0, your confidence the sprint finishes on time given task complexity/dependencies.
- Output ONLY the JSON. No prose, no markdown, no explanation.
"""

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
