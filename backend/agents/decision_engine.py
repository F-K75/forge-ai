from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class DecisionEngineAgent(BaseAgent):
    """Reacts to a task-state change and recommends plan updates (Module 14)."""

    system_prompt = """You are the AI Decision Engine in an AI-native agile project management system.
A task's state just changed. Given the current sprint/task snapshot, decide what (if anything) should change elsewhere in the plan.

Output ONLY a JSON object with this exact structure:
{
  "summary": "string (1-2 sentences)",
  "re_estimates": [{"task_title": "string", "new_estimated_hours": 0, "reason": "string"}],
  "risks": [{"description": "string", "severity": "low|medium|high"}],
  "recommended_next_tasks": ["string (task title)"],
  "bottlenecks": ["string"]
}

Rules:
- Only include re_estimates/risks/recommended_next_tasks/bottlenecks you're actually confident about from the data given -- empty lists are a valid, common answer.
- Output ONLY the JSON. No prose, no markdown, no explanation.
"""

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
