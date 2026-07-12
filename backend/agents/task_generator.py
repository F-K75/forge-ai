from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class TaskGeneratorAgent(BaseAgent):
    """Stories -> engineering tasks, generated for all stories in one call (Module 5).

    Grouped by story_index for the same reason StoryGeneratorAgent groups by
    epic_index -- tasks are generated before stories/tasks are persisted.
    """

    prompt_role = "task_generator"

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
