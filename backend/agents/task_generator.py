from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class TaskGeneratorAgent(BaseAgent):
    """Stories -> engineering tasks, generated for all stories in one call (Module 5).

    Grouped by story_index for the same reason StoryGeneratorAgent groups by
    epic_index -- tasks are generated before stories/tasks are persisted.
    """

    system_prompt = """You are the Task Generator Agent in an AI-native agile project management system.

Your job: break EVERY story given to you into concrete engineering tasks.

Output ONLY a JSON object with this exact structure:
{
  "stories": [
    {
      "story_index": 0,
      "tasks": [
        {
          "title": "string",
          "description": "string",
          "category": "backend|frontend|database|infrastructure|testing|documentation|security|deployment",
          "estimated_hours": 0,
          "complexity": "low|medium|high",
          "required_skills": ["string"],
          "dependencies": ["string (title of another task in this same story, if any)"],
          "assigned_agent": "backend_agent|frontend_agent|database_agent|infrastructure_agent|security_agent|qa_agent|devops_agent|documentation_agent"
        }
      ]
    }
  ]
}

Rules:
- story_index must match the index of the story in the input list (0-based).
- Every story must appear exactly once, with 2-6 tasks each, spanning the categories it actually needs (most stories need at least a backend and/or frontend task; add testing/docs/security/deployment tasks only when the story warrants it).
- assigned_agent should match the task's category (e.g. category "backend" -> "backend_agent").
- Output ONLY the JSON. No prose, no markdown, no explanation.
"""

    async def generate(self, initiative: dict, stories: list, user_id: str = None, initiative_id: str = None, org_id: str = None) -> dict:
        indexed_stories = [
            {"index": i, "title": s.get("title"), "description": s.get("description"), "acceptance_criteria": s.get("acceptance_criteria")}
            for i, s in enumerate(stories)
        ]
        context = {"project_vision": initiative.get("vision"), "tech_stack": initiative.get("tech_stack"), "stories": indexed_stories}
        messages = [{"role": "user", "content": f"Context:\n{json.dumps(context, indent=2)}"}]
        response = await self.run(
            messages, max_tokens=8192, user_id=user_id, project_id=initiative_id, org_id=org_id
        )
        return parse_json_response(response)
