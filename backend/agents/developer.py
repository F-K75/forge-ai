from agents.base import BaseAgent
from core.models import AgentType
import json


class DeveloperAgent(BaseAgent):
    agent_type = AgentType.DEVELOPER
    prompt_role = "developer"

    async def generate_files(
        self,
        blueprint: dict,
        design: dict,
        stream_callback=None,
        existing_files: dict = None,
        user_id: str = None,
        build_id: str = None,
        project_id: str = None,
        org_id: str = None,
    ) -> dict:
        existing_files_block = ""
        if existing_files:
            existing_files_block = (
                f"\n\nExisting files from the previous build. This is a follow-up "
                f"prompt amending that app: preserve unrelated files/features as-is "
                f"and only change what the updated blueprint requires.\n"
                f"{json.dumps(existing_files, indent=2)}"
            )

        messages = [
            {
                "role": "user",
                "content": (
                    f"Generate all code files.\n\n"
                    f"Blueprint:\n{json.dumps(blueprint, indent=2)}\n\n"
                    f"Design:\n{json.dumps(design, indent=2)}"
                    f"{existing_files_block}"
                )
            }
        ]

        # 8000, not Claude's comfortable 16000: several free-tier BYOK
        # providers (e.g. Groq's higher-TPM models) hard-cap max_tokens at
        # 8192 regardless of remaining rate-limit budget, and larger app
        # generations that need more than this will come back truncated
        # (breaking JSON parsing) rather than erroring cleanly -- a real
        # trade-off accepted for BYOK testing on free tiers.
        if stream_callback:
            full = ""
            async for chunk in self.stream(messages, max_tokens=8000, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id):
                full += chunk
                await stream_callback(chunk)
        else:
            full = await self.run(messages, max_tokens=8000, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id)

        clean = full.strip()
        # Strip markdown fences if present
        if "```json" in clean:
            clean = clean.split("```json")[1].split("```")[0].strip()
        elif clean.startswith("```"):
            clean = clean[3:].strip()
            if clean.endswith("```"):
                clean = clean[:-3].strip()

        # strict=False: some models (esp. non-Claude ones via BYOK) emit
        # literal control characters (raw newlines) inside JSON strings
        # instead of the \n escape the system prompt asks for.
        return json.loads(clean, strict=False)

    async def patch_files(
        self,
        existing_files: dict,
        error_report: str,
        blueprint: dict,
        user_id: str = None,
        build_id: str = None,
        project_id: str = None,
        org_id: str = None,
    ) -> dict:
        """Fix errors found during sandbox execution."""
        messages = [
            {
                "role": "user",
                "content": (
                    f"Fix these errors in the generated code.\n\n"
                    f"Errors:\n{error_report}\n\n"
                    f"Current files (relevant ones):\n"
                    f"{json.dumps({k: v for k, v in existing_files.items() if any(e in k for e in ['main.py', 'App.tsx', 'api.ts'])}, indent=2)}\n\n"
                    f"Return the same JSON structure with fixed file contents."
                )
            }
        ]
        full = await self.run(messages, max_tokens=8192, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id)
        clean = full.strip().strip("```json").strip("```").strip()
        # strict=False: see generate_files above.
        return json.loads(clean, strict=False)
