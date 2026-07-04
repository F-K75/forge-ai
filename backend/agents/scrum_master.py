from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


class ScrumMasterAgent(BaseAgent):
    """Sprint state -> standups, sprint review/retro, risk report, tech debt (Module 7).

    One agent, several narrowly-scoped methods -- each is a single JSON call
    against the same sprint/task context, differing only in what's asked for.
    """

    system_prompt = """You are the AI Scrum Master Agent in an AI-native agile project management system.
Ground everything in the sprint/task data you're given. Never invent tasks or people that aren't in the context.
Output ONLY valid JSON matching the requested structure. No prose, no markdown, no explanation."""

    def _context(self, sprint: dict, tasks: list) -> dict:
        return {
            "sprint": {
                "name": sprint.get("name"),
                "goal": sprint.get("goal"),
                "status": sprint.get("status"),
                "story_points_planned": sprint.get("story_points_planned"),
                "story_points_completed": sprint.get("story_points_completed"),
            },
            "tasks": [
                {"title": t.get("title"), "status": t.get("status"), "assigned_agent": t.get("assigned_agent"), "category": t.get("category")}
                for t in tasks
            ],
        }

    async def standup(self, sprint: dict, tasks: list, user_id=None, initiative_id=None, org_id=None) -> dict:
        schema = '{"yesterday": "string", "today": "string", "blockers": ["string"], "risks": ["string"], "sprint_health": "string"}'
        return await self._call(schema, "Generate today's stand-up.", sprint, tasks, user_id, initiative_id, org_id)

    async def review(self, sprint: dict, tasks: list, user_id=None, initiative_id=None, org_id=None) -> dict:
        schema = '{"summary": "string", "completed_tasks": ["string"], "demo_notes": "string"}'
        return await self._call(schema, "Generate the sprint review.", sprint, tasks, user_id, initiative_id, org_id)

    async def retro(self, sprint: dict, tasks: list, user_id=None, initiative_id=None, org_id=None) -> dict:
        schema = '{"what_went_well": ["string"], "what_went_wrong": ["string"], "action_items": ["string"]}'
        return await self._call(schema, "Generate the sprint retrospective.", sprint, tasks, user_id, initiative_id, org_id)

    async def risk_report(self, sprint: dict, tasks: list, user_id=None, initiative_id=None, org_id=None) -> dict:
        schema = '{"risks": [{"description": "string", "severity": "low|medium|high", "likelihood": "low|medium|high", "mitigation": "string"}]}'
        return await self._call(schema, "Generate a risk report.", sprint, tasks, user_id, initiative_id, org_id)

    async def tech_debt(self, sprint: dict, tasks: list, user_id=None, initiative_id=None, org_id=None) -> dict:
        schema = '{"items": [{"description": "string", "location": "string", "severity": "low|medium|high", "effort_to_fix": "string"}]}'
        return await self._call(schema, "Generate a technical debt summary based on any shortcuts or blocked/failed tasks visible in the context.", sprint, tasks, user_id, initiative_id, org_id)

    async def _call(self, schema: str, instruction: str, sprint: dict, tasks: list, user_id, initiative_id, org_id) -> dict:
        context = self._context(sprint, tasks)
        messages = [{
            "role": "user",
            "content": f"{instruction}\n\nOutput ONLY a JSON object matching this structure:\n{schema}\n\nSprint context:\n{json.dumps(context, indent=2)}",
        }]
        response = await self.run(messages, max_tokens=2000, user_id=user_id, project_id=initiative_id, org_id=org_id)
        return parse_json_response(response)
