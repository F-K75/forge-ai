from agents.base import BaseAgent
from core.models import AgentType
from typing import AsyncGenerator
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
    ) -> dict:
        messages = [
            {
                "role": "user",
                "content": (
                    f"Generate all code files.\n\n"
                    f"Blueprint:\n{json.dumps(blueprint, indent=2)}\n\n"
                    f"Design:\n{json.dumps(design, indent=2)}"
                )
            }
        ]

        if stream_callback:
            full = ""
            async for chunk in self.stream(messages, max_tokens=16000):
                full += chunk
                await stream_callback(chunk)
        else:
            full = await self.run(messages, max_tokens=16000)

        clean = full.strip()
        # Strip markdown fences if present
        if "```json" in clean:
            clean = clean.split("```json")[1].split("```")[0].strip()
        elif clean.startswith("```"):
            clean = clean[3:].strip()
            if clean.endswith("```"):
                clean = clean[:-3].strip()

        return json.loads(clean)

    async def patch_files(
        self,
        existing_files: dict,
        error_report: str,
        blueprint: dict,
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
        full = await self.run(messages, max_tokens=8192)
        clean = full.strip().strip("```json").strip("```").strip()
        return json.loads(clean)
