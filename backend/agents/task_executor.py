from agents.base import BaseAgent
from agents.json_utils import parse_json_response
import json


ROLE_FOCUS = {
    "backend_agent": "Focus on server-side code: API endpoints, business logic, data models.",
    "frontend_agent": "Focus on UI code: components, styling, client-side state.",
    "database_agent": "Focus on schema/collection design, indexes, and migrations.",
    "infrastructure_agent": "Focus on deployment config, CI/CD, containers, infra-as-code.",
    "security_agent": "Focus on auth, input validation, secrets handling, and threat mitigation.",
    "qa_agent": "Focus on test cases and test code covering the acceptance criteria.",
    "devops_agent": "Focus on build/release automation and monitoring.",
    "documentation_agent": "Focus on developer- or user-facing documentation.",
}


class TaskExecutorAgent(BaseAgent):
    """Executes a single engineering Task by role (Modules 9-10).

    One class parameterized by the task's assigned_agent role rather than a
    separate class per role -- the roles differ only in what part of the
    stack they touch, which is a prompt-focus difference, not a behavioral
    one.
    """

    prompt_role = "task_executor"

    async def execute(self, task: dict, context: dict, user_id: str = None, initiative_id: str = None, org_id: str = None) -> dict:
        role = task.get("assigned_agent", "backend_agent")
        focus = ROLE_FOCUS.get(role, ROLE_FOCUS["backend_agent"])

        prompt_context = {
            "project_vision": context.get("vision"),
            "tech_stack": context.get("tech_stack"),
            "epic": context.get("epic_title"),
            "story": context.get("story_title"),
            "story_acceptance_criteria": context.get("acceptance_criteria"),
            "task": {
                "title": task.get("title"),
                "description": task.get("description"),
                "category": task.get("category"),
                "required_skills": task.get("required_skills"),
            },
            "existing_files": list((context.get("existing_files") or {}).keys()),
        }
        messages = [{"role": "user", "content": f"Task context:\n{json.dumps(prompt_context, indent=2)}"}]

        usage: dict = {}
        response = await self.run(
            messages,
            extra_system=focus,
            max_tokens=8192,
            user_id=user_id,
            project_id=initiative_id,
            org_id=org_id,
            usage_out=usage,
        )
        result = parse_json_response(response)
        result["_usage"] = usage
        return result
