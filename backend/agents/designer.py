from agents.base import BaseAgent
from core.models import AgentType
import json


class DesignerAgent(BaseAgent):
    agent_type = AgentType.DESIGNER
    system_prompt = """You are the Designer Agent in a multi-agent full-stack app builder.

Your job: given an app blueprint, produce design decisions and Tailwind-based component specs.

Output ONLY a JSON object:
{
  "theme": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#hex",
    "surface": "#hex",
    "text_primary": "#hex",
    "text_secondary": "#hex",
    "border_radius": "sm|md|lg",
    "font_family": "Inter|Geist|Plus Jakarta Sans|DM Sans",
    "style": "minimal|corporate|playful|dark-pro"
  },
  "layout": {
    "sidebar": true,
    "topbar": true,
    "sidebar_width": "64px|256px",
    "content_max_width": "1280px"
  },
  "components": {
    "page_name": {
      "layout": "description of layout",
      "key_elements": ["element descriptions"],
      "tailwind_classes": {"element": "classes"}
    }
  },
  "design_notes": "string"
}

Rules:
- Match style to the app type: SaaS → clean minimal, marketplace → cards-heavy, dashboard → dense data
- dark-pro style for developer tools, analytics platforms
- Output ONLY the JSON. No prose, no markdown.
"""

    async def design(self, blueprint: dict) -> dict:
        messages = [
            {
                "role": "user",
                "content": f"Create design system for this app:\n{json.dumps(blueprint, indent=2)}"
            }
        ]
        response = await self.run(messages, max_tokens=3000)
        clean = response.strip().strip("```json").strip("```").strip()
        return json.loads(clean)
