from agents.base import BaseAgent
from agents.structured_schemas import ARCHITECT_BLUEPRINT_SCHEMA
from core.models import AgentType
from typing import Optional
import json


class ArchitectAgent(BaseAgent):
    agent_type = AgentType.ARCHITECT
    prompt_role = "architect"
    output_schema = ARCHITECT_BLUEPRINT_SCHEMA

    async def clarify(self, prompt: str, user_id: str = None, build_id: str = None, project_id: str = None, org_id: str = None, template: Optional[str] = None) -> list[str]:
        """Questions worth asking before committing to a blueprint. Best-effort:
        any parse/LLM failure returns [] so the pipeline never stalls on it.

        Uses the 'clarify-v1' prompt template variant (see prompt_builder/
        templates/architect_v1.py) so it gets a different system prompt from
        blueprint() without needing a second agent class."""
        extra_system = (
            f"The user picked the '{template}' starter template for this project."
            if template
            else ""
        )
        try:
            response = await self.run(
                [{"role": "user", "content": f"App idea: {prompt}"}],
                extra_system=extra_system,
                max_tokens=512,
                user_id=user_id,
                build_id=build_id,
                project_id=project_id,
                org_id=org_id,
                prompt_template_version="clarify-v1",
            )
            questions = json.loads(_strip_fences(response), strict=False)
        except Exception:
            return []
        if not isinstance(questions, list):
            return []
        return [q.strip() for q in questions if isinstance(q, str) and q.strip()][:4]

    async def blueprint(self, prompt: str, conversation_history: list = None, user_id: str = None, build_id: str = None, project_id: str = None, org_id: str = None, template: Optional[str] = None) -> dict:
        messages = []
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": f"App idea: {prompt}"})

        extra_system = (
            f"The user picked the '{template}' starter template for this project. "
            "Lean into the conventions and typical features of that kind of app "
            "unless the app idea below says otherwise."
            if template
            else ""
        )

        return await self._call_structured(
            messages,
            extra_system=extra_system,
            max_tokens=4096,
            user_id=user_id,
            build_id=build_id,
            project_id=project_id,
            org_id=org_id,
        )


def _strip_fences(response: str) -> str:
    clean = response.strip()
    if clean.startswith("```"):
        clean = clean.split("```")[1]
        if clean.startswith("json"):
            clean = clean[4:]
    return clean.strip().rstrip("```")
