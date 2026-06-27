from agents.base import BaseAgent
from core.models import AgentType
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

    async def blueprint(self, prompt: str, conversation_history: list = None) -> dict:
        messages = []
        if conversation_history:
            messages.extend(conversation_history)
        messages.append({"role": "user", "content": f"App idea: {prompt}"})

        response = await self.run(messages, max_tokens=4096)

        # Strip any markdown fences
        clean = response.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip().rstrip("```")

        return json.loads(clean)
