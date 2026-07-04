from agents.base import BaseAgent
from core.models import AgentType
import json


DEVELOPER_SYSTEM = """You are the Developer Agent in a multi-agent full-stack app builder.

You generate production-ready code for a React + Vite + Tailwind frontend and FastAPI + MongoDB backend.

Given a blueprint and design spec, you output a complete set of files.

Output ONLY a JSON object:
{
  "files": {
    "frontend/src/App.tsx": "full file content",
    "frontend/src/pages/Home.tsx": "full file content",
    "frontend/src/components/Sidebar.tsx": "full file content",
    "frontend/src/lib/api.ts": "full file content",
    "frontend/tailwind.config.js": "full file content",
    "frontend/src/index.css": "full file content",
    "backend/main.py": "full file content",
    "backend/models.py": "full file content",
    "backend/routers/items.py": "full file content",
    "backend/database.py": "full file content",
    "backend/requirements.txt": "full file content"
  }
}

Rules:
- Generate COMPLETE files, not stubs or pseudocode.
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, React Router v6, React Query, Axios.
- Backend: FastAPI, Motor (async MongoDB), Pydantic v2, python-jose for JWT.
- Auth: JWT-based, /auth/register and /auth/login endpoints, Bearer token middleware.
- Always include: error boundaries, loading states, empty states.
- API calls use environment variable VITE_API_URL.
- Backend CORS allows frontend origin.
- All MongoDB operations are async with Motor.
- Use the design spec colors as CSS variables in index.css.
- Output ONLY valid JSON. No prose. No markdown. Escape all special chars in strings.
"""


class DeveloperAgent(BaseAgent):
    agent_type = AgentType.DEVELOPER
    system_prompt = DEVELOPER_SYSTEM

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
