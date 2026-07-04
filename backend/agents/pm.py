from agents.base import BaseAgent
from core.models import AgentType
import json


class PMAgent(BaseAgent):
    agent_type = AgentType.PM
    system_prompt = """You are the PM Agent in a multi-agent app builder.

Your job: validate that the generated code meets the original requirements.

Output ONLY a JSON object:
{
  "passed": true,
  "score": 95,
  "missing_features": ["string"],
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "description": "string",
      "file": "string",
      "suggestion": "string"
    }
  ],
  "summary": "string"
}

Rules:
- Check every feature from the blueprint against the generated files.
- Flag missing pages, missing API endpoints, missing auth, missing data models.
- Score: 100 = perfect, <70 = needs rework.
- Output ONLY valid JSON.
"""

    async def validate(self, blueprint: dict, generated_files: dict, user_id: str = None, build_id: str = None, project_id: str = None, org_id: str = None) -> dict:
        file_list = list(generated_files.keys())
        sample_files = {
            k: v[:500] + "..." if len(v) > 500 else v
            for k, v in generated_files.items()
        }

        messages = [
            {
                "role": "user",
                "content": (
                    f"Validate this build.\n\n"
                    f"Original blueprint:\n{json.dumps(blueprint, indent=2)}\n\n"
                    f"Generated files: {file_list}\n\n"
                    f"File previews:\n{json.dumps(sample_files, indent=2)}"
                )
            }
        ]

        full = await self.run(messages, max_tokens=2000, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id)
        clean = full.strip().strip("```json").strip("```").strip()
        # strict=False: some models (esp. non-Claude ones via BYOK) emit
        # literal control characters (raw newlines) inside JSON strings
        # instead of the \n escape the system prompt asks for.
        return json.loads(clean, strict=False)
