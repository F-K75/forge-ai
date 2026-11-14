from agents.base import BaseAgent
from agents.structured_schemas import DEVELOPER_FILES_SCHEMA
from core.models import AgentType
from typing import Optional
import json


def _normalize_files_result(result: object) -> dict:
    """Normalize DeveloperAgent file outputs to always have shape {"files": <dict>}."""
    if not isinstance(result, dict):
        return {"files": {}}
    if "files" in result:
        files = result["files"]
        return {"files": files if isinstance(files, dict) else {}}
    return {"files": result}


class DeveloperAgent(BaseAgent):
    agent_type = AgentType.DEVELOPER
    prompt_role = "developer"
    output_schema = DEVELOPER_FILES_SCHEMA

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
        clarifications: Optional[list] = None,
    ) -> dict:
        """clarifications: answered Developer -> Architect exchanges
        ([{"question", "answer"}]) from the orchestrator's clarification
        phase; they are binding decisions layered on top of the blueprint."""
        clarifications_block = ""
        if clarifications:
            qa = "\n\n".join(
                f"Q: {c['question']}\nA: {c['answer']}" for c in clarifications
            )
            clarifications_block = (
                f"\n\nClarifications from the Architect (follow these where "
                f"the blueprint is ambiguous):\n{qa}"
            )

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
                    f"{clarifications_block}"
                    f"{existing_files_block}"
                )
            }
        ]

        if stream_callback:
            full = ""
            async for chunk in self.stream(messages, max_tokens=8000, user_id=user_id, build_id=build_id, project_id=project_id, org_id=org_id):
                full += chunk
                await stream_callback(chunk)
            clean = full.strip()
            if "```json" in clean:
                clean = clean.split("```json")[1].split("```")[0].strip()
            elif clean.startswith("```"):
                clean = clean[3:].strip()
                if clean.endswith("```"):
                    clean = clean[:-3].strip()
            try:
                parsed = json.loads(clean, strict=False)
            except json.JSONDecodeError:
                parsed = {"files": {}}
            return _normalize_files_result(parsed)
        else:
            result = await self._call_structured(
                messages,
                max_tokens=8000,
                user_id=user_id,
                build_id=build_id,
                project_id=project_id,
                org_id=org_id,
            )
            return _normalize_files_result(result)

    async def identify_questions(
        self,
        blueprint: dict,
        design: dict,
        max_questions: int,
        user_id: str = None,
        build_id: str = None,
        project_id: str = None,
        org_id: str = None,
        raise_errors: bool = False,
    ) -> list[str]:
        """Questions for the Architect about ambiguities that would otherwise
        force a guess during implementation. Best-effort like
        ArchitectAgent.clarify: any LLM/parse failure returns [] so the
        build continues exactly as it did before clarifications existed.

        raise_errors: re-raise LLM/parse failures instead -- for validation
        (scripts/validate_clarifications.py), where "no questions" must not
        be confused with "the call failed"."""
        if max_questions <= 0:
            return []
        try:
            response = await self.run(
                [{
                    "role": "user",
                    "content": (
                        f"List at most {max_questions} clarifying questions.\n\n"
                        f"Blueprint:\n{json.dumps(blueprint, indent=2)}\n\n"
                        f"Design:\n{json.dumps(design, indent=2)}"
                    ),
                }],
                max_tokens=512,
                user_id=user_id,
                build_id=build_id,
                project_id=project_id,
                org_id=org_id,
                prompt_template_version="questions-v1",
            )
            clean = response.strip()
            if clean.startswith("```"):
                clean = clean.split("```")[1]
                if clean.startswith("json"):
                    clean = clean[4:]
            questions = json.loads(clean.strip(), strict=False)
        except Exception:
            if raise_errors:
                raise
            return []
        if not isinstance(questions, list):
            if raise_errors:
                raise ValueError(f"expected a JSON array of questions, got {type(questions).__name__}")
            return []
        return [q.strip() for q in questions if isinstance(q, str) and q.strip()][:max_questions]

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
        result = await self._call_structured(
            messages,
            max_tokens=8192,
            user_id=user_id,
            build_id=build_id,
            project_id=project_id,
            org_id=org_id,
        )
        return _normalize_files_result(result)
