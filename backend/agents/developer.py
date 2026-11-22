from agents.base import BaseAgent
from agents.json_utils import strip_markdown_fences
from agents.structured_schemas import DEVELOPER_FILES_SCHEMA
from core.collaboration import render_decisions_block
from core.models import AgentType
from typing import Optional
import json

_DECISIONS_HEADING = (
    "Decisions recorded on this build's blackboard by the other agents "
    "(binding where the blueprint is ambiguous):"
)


_PATCH_MAX_FILES = 20
_PATCH_MAX_CHARS = 40_000
_RELEVANT_FILE_PATTERNS = (
    "main.py",
    "app.py",
    "models.py",
    "database.py",
    "schemas.py",
    "config.py",
    "auth.py",
    "routers/",
    "routes/",
    "services/",
    "App.tsx",
    "App.jsx",
    "main.tsx",
    "index.tsx",
    "api.ts",
    "api.js",
    "types.ts",
    "pages/",
    "components/",
    "hooks/",
    "lib/",
    "utils/",
    "package.json",
    "requirements.txt",
    "pyproject.toml",
    "tsconfig.json",
    "vite.config.",
)
_IGNORED_PATH_PARTS = (
    "node_modules/",
    "__pycache__/",
    ".git/",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
)


def _select_relevant_files(
    existing_files: dict,
    error_report: str = "",
    max_files: int = _PATCH_MAX_FILES,
    max_chars: int = _PATCH_MAX_CHARS,
) -> dict:
    """Select relevant backend/frontend files for patch_files within context caps.

    Files referenced in `error_report` are prioritized first, followed by core
    application files (`models.py`, `database.py`, `schemas.py`, `routers/`,
    `routes/`, `pages/`, `components/`, `package.json`, `requirements.txt`, etc.).
    """
    if not existing_files:
        return {}

    mentioned: list[tuple[str, str]] = []
    pattern_matched: list[tuple[str, str]] = []
    err_text = error_report or ""

    for path, content in existing_files.items():
        if any(ign in path for ign in _IGNORED_PATH_PARTS):
            continue
        content_str = content if isinstance(content, str) else json.dumps(content)
        basename = path.rsplit("/", 1)[-1]
        if err_text and (path in err_text or (basename and basename in err_text)):
            mentioned.append((path, content_str))
        elif any(pat in path for pat in _RELEVANT_FILE_PATTERNS):
            pattern_matched.append((path, content_str))

    selected: dict[str, str] = {}
    total_chars = 0
    for path, content_str in mentioned + pattern_matched:
        if len(selected) >= max_files:
            break
        if total_chars + len(content_str) > max_chars:
            if not selected:
                selected[path] = content_str[:max_chars]
                total_chars += len(selected[path])
            continue
        selected[path] = content_str
        total_chars += len(content_str)

    return selected


def _normalize_files_result(result: object) -> dict:
    """Normalize DeveloperAgent file outputs to always have shape {"files": <dict>}."""
    if not isinstance(result, dict):
        return {"files": {}}
    if "files" in result:
        files = result["files"]
        return {"files": files if isinstance(files, dict) else {}}
    return {"files": result}


def parse_addressed_questions(items: object, default_recipient: str, max_questions: int, raise_errors: bool = False) -> list[dict]:
    """Parser shared by the v2 question passes (Developer, Designer,
    Integration): a JSON array of ``{"to", "question", "key"}`` objects,
    where a plain string is addressed to ``default_recipient``. Recipients
    are passed through as proposed: the orchestrator's route table decides
    whether each one is allowed."""
    if not isinstance(items, list):
        if raise_errors:
            raise ValueError(f"expected a JSON array of questions, got {type(items).__name__}")
        return []
    out: list[dict] = []
    for item in items:
        if isinstance(item, str) and item.strip():
            out.append({"to": default_recipient, "question": item.strip(), "key": None})
        elif isinstance(item, dict) and isinstance(item.get("question"), str) and item["question"].strip():
            to = item.get("to")
            key = item.get("key")
            out.append({
                "to": to.strip().lower() if isinstance(to, str) and to.strip() else default_recipient,
                "question": item["question"].strip(),
                "key": key.strip() if isinstance(key, str) and key.strip() else None,
            })
    return out[:max_questions]


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
        decisions: Optional[list] = None,
    ) -> dict:
        """clarifications: answered Developer -> Architect exchanges
        ([{"question", "answer"}]) from the orchestrator's clarification
        phase; they are binding decisions layered on top of the blueprint.

        decisions: the collaboration protocol v2 replacement for
        ``clarifications`` -- the build blackboard's current decisions
        ([{"key", "value", "owner_agent"}]), rendered inside the
        untrusted-content envelope."""
        clarifications_block = ""
        if clarifications:
            qa = "\n\n".join(
                f"Q: {c['question']}\nA: {c['answer']}" for c in clarifications
            )
            clarifications_block = (
                f"\n\nClarifications from the Architect (follow these where "
                f"the blueprint is ambiguous):\n{qa}"
            )
        if decisions:
            clarifications_block += render_decisions_block(decisions, _DECISIONS_HEADING)

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
        recipients: Optional[list] = None,
        decisions: Optional[list] = None,
    ) -> list:
        """Questions for the Architect about ambiguities that would otherwise
        force a guess during implementation. Best-effort like
        ArchitectAgent.clarify: any LLM/parse failure returns [] so the
        build continues exactly as it did before clarifications existed.

        raise_errors: re-raise LLM/parse failures instead -- for validation
        (scripts/validate_clarifications.py), where "no questions" must not
        be confused with "the call failed".

        recipients (collaboration protocol v2): the agents the route table
        lets the Developer ask. Each question is then addressed to one of
        them and the result is ``[{"to", "question", "key"}]``; the
        orchestrator's router, not this prompt, decides whether a proposed
        recipient is allowed. decisions: blackboard decisions already made,
        so they are not asked again."""
        if max_questions <= 0:
            return []
        if recipients:
            return await self._identify_addressed_questions(
                blueprint, design, max_questions, recipients, decisions,
                user_id=user_id, build_id=build_id, project_id=project_id,
                org_id=org_id, raise_errors=raise_errors,
            )
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
            questions = json.loads(strip_markdown_fences(response), strict=False)
        except Exception:
            if raise_errors:
                raise
            return []
        if not isinstance(questions, list):
            if raise_errors:
                raise ValueError(f"expected a JSON array of questions, got {type(questions).__name__}")
            return []
        return [q.strip() for q in questions if isinstance(q, str) and q.strip()][:max_questions]

    async def _identify_addressed_questions(
        self,
        blueprint: dict,
        design: dict,
        max_questions: int,
        recipients: list,
        decisions: Optional[list],
        user_id: str = None,
        build_id: str = None,
        project_id: str = None,
        org_id: str = None,
        raise_errors: bool = False,
    ) -> list[dict]:
        try:
            response = await self.run(
                [{
                    "role": "user",
                    "content": (
                        f"List at most {max_questions} clarifying questions. Address each "
                        f"one to exactly one of: {', '.join(recipients)}.\n\n"
                        f"Blueprint:\n{json.dumps(blueprint, indent=2)}\n\n"
                        f"Design:\n{json.dumps(design, indent=2)}"
                        f"{render_decisions_block(decisions or [], 'Already decided (do not ask about these again):')}"
                    ),
                }],
                max_tokens=700,
                user_id=user_id,
                build_id=build_id,
                project_id=project_id,
                org_id=org_id,
                prompt_template_version="questions-v2",
            )
            items = json.loads(strip_markdown_fences(response), strict=False)
        except Exception:
            if raise_errors:
                raise
            return []
        return parse_addressed_questions(items, recipients[0], max_questions, raise_errors=raise_errors)

    async def patch_files(
        self,
        existing_files: dict,
        error_report: str,
        blueprint: dict,
        user_id: str = None,
        build_id: str = None,
        project_id: str = None,
        org_id: str = None,
        decisions: Optional[list] = None,
    ) -> dict:
        """Fix errors found during sandbox execution. decisions: the build
        blackboard's decisions (collaboration protocol v2), so a fix stays
        consistent with them."""
        relevant_files = _select_relevant_files(existing_files, error_report=error_report)
        messages = [
            {
                "role": "user",
                "content": (
                    f"Fix these errors in the generated code.\n\n"
                    f"Errors:\n{error_report}\n\n"
                    f"Current files (relevant ones):\n"
                    f"{json.dumps(relevant_files, indent=2)}\n\n"
                    f"Return the same JSON structure with fixed file contents."
                    f"{render_decisions_block(decisions or [], _DECISIONS_HEADING)}"
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
