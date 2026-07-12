from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class StoryGeneratorAgent(BaseAgent):
    """Epics -> user stories, generated for all epics in one call (Module 4).

    Grouped by epic_index (the epic's position in the list passed in) rather
    than by real epic id, since story generation happens before stories are
    persisted -- the caller resolves epic_index back to a real Epic id.
    """

    prompt_role = "story_generator"

    async def generate(self, initiative: dict, epics: list, user_id: str = None, initiative_id: str = None, org_id: str = None) -> dict:
        indexed_epics = [
            {"index": i, "title": e.get("title"), "description": e.get("description"), "priority": e.get("priority")}
            for i, e in enumerate(epics)
        ]
        context = {"project_vision": initiative.get("vision"), "epics": indexed_epics}
        messages = [{"role": "user", "content": f"Context:\n{json.dumps(context, indent=2)}"}]
        response = await self.run(
            messages, max_tokens=8192, user_id=user_id, project_id=initiative_id, org_id=org_id
        )
        return parse_json_response(response)
