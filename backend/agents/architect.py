from agents.base import BaseAgent
from core.models import AgentType
from typing import Optional
import json


class ArchitectAgent(BaseAgent):
    agent_type = AgentType.ARCHITECT
    system_prompt = """You are the Architect Agent in a multi-agent full-stack app builder.

Your job: analyze the user's app idea and produce a precise technical blueprint.

Output ONLY a JSON object with this exact structure:
{
  "app_name": "string",
  "description": "string",
  "pages": [
    {
      "name": "string",
      "route": "string",
      "description": "string",
      "components": ["string"]
    }
  ],
  "data_models": [
    {
      "name": "string",
      "fields": [{"name": "string", "type": "string", "required": true}]
    }
  ],
  "api_endpoints": [
    {
      "method": "GET|POST|PUT|DELETE",
      "path": "string",
      "description": "string",
      "auth_required": true
    }
  ],
  "features": ["string"],
  "integrations": ["string"],
  "auth_required": true,
  "clarifications": ["string"]
}

Rules:
- Be precise. Downstream agents depend on this blueprint.
- List every page, every data model, every API endpoint the app needs.
- integrations: only list services actually needed (Stripe, Slack, etc.)
- clarifications: things that are ambiguous in the prompt that would change the architecture.
- Output ONLY the JSON. No prose, no markdown, no explanation.
"""

    async def blueprint(self, prompt: str, conversation_history: list = None, user_id: str = None, build_id: str = None, project_id: str = None, org_id: str = None, template: Optional[str] = None) -> dict:
        messages = []
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": f"App idea: {prompt}"})

        # The project's chosen starter/template (e.g. "SaaS dashboard") was
        # previously stored on the project but never actually influenced
        # generation anywhere in the pipeline (PROD-002). Passed as system
        # context rather than folded into the stored prompt so it doesn't
        # show up as text the user never actually typed.
        extra_system = (
            f"The user picked the '{template}' starter template for this project. "
            "Lean into the conventions and typical features of that kind of app "
            "unless the app idea below says otherwise."
            if template
            else ""
        )

        response = await self.run(messages, extra_system=extra_system, max_tokens=4096, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id)

        clean = response.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip().rstrip("```")

        # strict=False: some models (esp. non-Claude ones via BYOK) emit
        # literal control characters (raw newlines) inside JSON strings
        # instead of the \n escape the system prompt asks for.
        return json.loads(clean, strict=False)
