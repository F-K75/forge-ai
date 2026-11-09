"""Real-LLM validation for Developer -> Architect clarifications.

The unit tests (tests/test_agent_communication.py) use stub agents, so they
prove the orchestration but not model behaviour. This script runs the real
DeveloperAgent and ArchitectAgent against a configured provider for four
checks:

  1. ambiguous  -- an underspecified blueprint should make the Developer ask
                   at least one question.
  2. clear      -- a fully specified, trivial blueprint should produce zero
                   questions.
  3. conflict   -- a question that presupposes a choice contradicting the
                   blueprint (PostgreSQL vs the blueprint's MongoDB) should
                   get an answer that keeps the blueprint's decision.
  4. binding    -- an Architect answer with a distinctive decision must show
                   up in the files the Developer generates.

Requires a provider key in the backend settings (e.g. ANTHROPIC_API_KEY),
plus the settings the backend always needs (MONGODB_URL, JWT_SECRET of 32+
chars, FIELD_ENCRYPTION_KEY of 64 hex chars). Mongo need not be running:
usage/audit writes fail open, just slowly. If your shell exports
ANTHROPIC_BASE_URL for another tool, unset it for this run.
Makes real, billed API calls -- roughly 6 small calls and one full file
generation. Run from backend/:

    python scripts/validate_clarifications.py            # all checks
    python scripts/validate_clarifications.py ambiguous  # one check

Exits non-zero if any check fails. Prints every question/answer so a human
can judge quality, not just the pass/fail heuristics.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agents.architect import ArchitectAgent  # noqa: E402
from agents.developer import DeveloperAgent  # noqa: E402

DESIGN = {"theme": "light", "colors": {"primary": "#2563eb", "background": "#ffffff"}, "font": "Inter"}

AMBIGUOUS_BLUEPRINT = {
    "app_name": "TeamNotes",
    "description": "Notes app where people can share notes with their team.",
    "pages": [
        {"name": "Notes", "route": "/", "description": "List of notes", "components": ["NoteList"]},
        {"name": "Editor", "route": "/notes/:id", "description": "Edit a note", "components": ["NoteEditor"]},
    ],
    "data_models": [
        {"name": "Note", "fields": [
            {"name": "title", "type": "string", "required": True},
            {"name": "body", "type": "string", "required": True},
        ]},
    ],
    "api_endpoints": [
        {"method": "GET", "path": "/notes", "description": "List notes", "auth_required": True},
        {"method": "PUT", "path": "/notes/{id}", "description": "Update a note", "auth_required": True},
        {"method": "POST", "path": "/notes/{id}/share", "description": "Share a note", "auth_required": True},
    ],
    "features": ["Share notes with your team", "Edit notes"],
    "integrations": [],
    "auth_required": True,
    "clarifications": [],
}

CLEAR_BLUEPRINT = {
    "app_name": "ClickCounter",
    "description": "A single page with a button that increments a number shown on screen. "
                   "The count lives in React state only and resets on reload.",
    "pages": [{"name": "Home", "route": "/", "description": "Shows the count and one '+1' button",
               "components": ["Counter"]}],
    "data_models": [],
    "api_endpoints": [],
    "features": ["Clicking '+1' increases the displayed count by one; it starts at 0"],
    "integrations": [],
    "auth_required": False,
    "clarifications": [],
}

CONFLICT_QUESTION = (
    "Should note sharing be stored in a PostgreSQL join table with foreign keys "
    "between users and notes?"
)

BINDING_QUESTION = "What should the frontend do when an API call returns 401 because the session expired?"
BINDING_ANSWER = (
    "Clear the token stored under localStorage key 'forge_session_token' and "
    "redirect the user to the route /session-expired, which shows a 'Your session "
    "expired' message with a link back to /login."
)


async def check_ambiguous(dev: DeveloperAgent, arch: ArchitectAgent) -> bool:
    questions = await dev.identify_questions(AMBIGUOUS_BLUEPRINT, DESIGN, max_questions=3, raise_errors=True)
    print(f"  questions ({len(questions)}):")
    for q in questions:
        print(f"    - {q}")
        print(f"      architect: {await arch.answer(q, AMBIGUOUS_BLUEPRINT, DESIGN)}")
    return len(questions) >= 1


async def check_clear(dev: DeveloperAgent, arch: ArchitectAgent) -> bool:
    questions = await dev.identify_questions(CLEAR_BLUEPRINT, DESIGN, max_questions=3, raise_errors=True)
    print(f"  questions ({len(questions)}): {questions}")
    return len(questions) == 0


async def check_conflict(dev: DeveloperAgent, arch: ArchitectAgent) -> bool:
    blueprint = dict(AMBIGUOUS_BLUEPRINT, description=AMBIGUOUS_BLUEPRINT["description"] +
                     " Backend: FastAPI with MongoDB (Motor).")
    answer = await arch.answer(CONFLICT_QUESTION, blueprint, DESIGN)
    print(f"  question: {CONFLICT_QUESTION}\n  architect: {answer}")
    lower = answer.lower()
    keeps_mongo = "mongo" in lower
    adopts_postgres = "postgres" in lower and not any(
        w in lower for w in ("not postgres", "no postgres", "instead of postgres", "rather than postgres",
                             "not use postgres", "don't use postgres", "do not use postgres", "isn't postgres")
    ) and not keeps_mongo
    return keeps_mongo and not adopts_postgres


async def check_binding(dev: DeveloperAgent, arch: ArchitectAgent) -> bool:
    print("  generating files with a binding clarification (this takes a while)...")

    async def _sink(_chunk: str) -> None:
        return None

    result = await dev.generate_files(
        AMBIGUOUS_BLUEPRINT, DESIGN, stream_callback=_sink,
        clarifications=[{"question": BINDING_QUESTION, "answer": BINDING_ANSWER}],
    )
    files = result.get("files", result) if isinstance(result, dict) else {}
    if not isinstance(files, dict) or not files:
        print("  no files parsed from the generation")
        return False
    blob = "\n".join(str(v) for v in files.values())
    found = {
        "/session-expired route": "/session-expired" in blob,
        "forge_session_token key": "forge_session_token" in blob,
        "401 handling": "401" in blob,
    }
    print(f"  {len(files)} files; markers: {json.dumps(found)}")
    return all(found.values())


CHECKS = {
    "ambiguous": check_ambiguous,
    "clear": check_clear,
    "conflict": check_conflict,
    "binding": check_binding,
}


async def main(selected: list[str]) -> int:
    dev, arch = DeveloperAgent(), ArchitectAgent()
    failed = []
    for name in selected:
        print(f"[{name}]")
        try:
            ok = await CHECKS[name](dev, arch)
        except Exception as exc:  # report and continue with the other checks
            print(f"  ERROR: {type(exc).__name__}: {exc}")
            ok = False
        print(f"  -> {'PASS' if ok else 'FAIL'}\n")
        if not ok:
            failed.append(name)
    print(f"{len(selected) - len(failed)}/{len(selected)} checks passed" + (f"; failed: {failed}" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    names = sys.argv[1:] or list(CHECKS)
    unknown = [n for n in names if n not in CHECKS]
    if unknown:
        sys.exit(f"unknown check(s) {unknown}; choose from {list(CHECKS)}")
    sys.exit(asyncio.run(main(names)))
