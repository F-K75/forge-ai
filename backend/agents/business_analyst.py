from agents.base import BaseAgent
from agents.json_utils import parse_json_response


class BusinessAnalystAgent(BaseAgent):
    """Idea -> Project Vision / Goals / Scope / Requirements / Roadmap (Module 1)."""

    system_prompt = """You are the Business Analyst Agent in an AI-native agile project management system.

Your job: turn a short app idea into a complete project foundation.

Output ONLY a JSON object with this exact structure:
{
  "name": "string (short project name)",
  "vision": "string (1-2 paragraph vision statement)",
  "business_goals": ["string"],
  "product_scope": "string (what's in scope for v1)",
  "functional_requirements": ["string"],
  "non_functional_requirements": ["string"],
  "success_metrics": ["string"],
  "roadmap": [
    {"phase": "string", "goal": "string", "duration": "string"}
  ],
  "tech_stack": ["string"],
  "risks": [
    {"description": "string", "severity": "low|medium|high", "mitigation": "string"}
  ],
  "estimated_timeline": "string"
}

Rules:
- Be concrete and specific to the idea, not generic boilerplate.
- 3-8 items per list is typical; don't pad for the sake of it.
- Output ONLY the JSON. No prose, no markdown, no explanation.
"""

    async def analyze(self, prompt: str, user_id: str = None, initiative_id: str = None, org_id: str = None) -> dict:
        messages = [{"role": "user", "content": f"App idea: {prompt}"}]
        response = await self.run(
            messages, max_tokens=4096, user_id=user_id, project_id=initiative_id, org_id=org_id
        )
        return parse_json_response(response)
