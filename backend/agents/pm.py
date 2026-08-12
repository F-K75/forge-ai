from agents.base import BaseAgent
from agents.structured_schemas import PM_VALIDATION_SCHEMA
from core.models import AgentType
import json


class PMAgent(BaseAgent):
    agent_type = AgentType.PM
    prompt_role = "product_manager"
    output_schema = PM_VALIDATION_SCHEMA

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

        # 8.8: schema-validated + gateway-repaired structured output instead of
        # the hand-rolled fence-strip + json.loads(strict=False) below.
        return await self._call_structured(
            messages, max_tokens=2000, user_id=user_id, build_id=build_id,
            project_id=project_id, org_id=org_id,
        )
