"""Context builder: file tree, trigger scoping, and token-budget guard.

Trigger scoping is the cost-control mechanism (acceptance criterion #2):
an agent only runs when its glob patterns match the candidate file set —
the changed files in diff mode, or the whole repo in full-audit mode.

Glob semantics are gitignore-style (``**`` spans directories, a leading
bare ``*.py`` matches at any depth) via :mod:`pathspec`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from pathspec import PathSpec
from pathspec.patterns import GitWildMatchPattern

from .config import get_settings

# Directories/files never worth feeding to a reviewer.
_IGNORED_DIRS = {
    ".git", "node_modules", "venv", ".venv", "__pycache__", "dist",
    "build", ".next", ".cache", ".mypy_cache", ".pytest_cache", ".idea",
    ".vscode", "coverage", ".tox", "vendor", "target", "site-packages",
}
_BINARY_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".pdf", ".zip", ".gz",
    ".tar", ".bz2", ".7z", ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3",
    ".wav", ".mov", ".bin", ".so", ".dylib", ".dll", ".exe", ".class", ".jar",
    ".pyc", ".lock", ".wasm", ".db", ".sqlite",
}
_MAX_BYTES_PER_FILE = 512 * 1024  # skip giant files entirely from full scans


def estimate_tokens(text: str) -> int:
    """Cheap, provider-agnostic token estimate (~4 chars/token)."""
    return len(text) // 4 + 1


# --------------------------------------------------------------------------- #
# Trigger matching
# --------------------------------------------------------------------------- #
def _spec(triggers: Iterable[str]) -> PathSpec:
    return PathSpec.from_lines(GitWildMatchPattern, list(triggers))


def match_triggers(triggers: list[str], files: Iterable[str]) -> list[str]:
    """Return the subset of ``files`` matching any trigger pattern.

    An empty trigger list means the agent is unscoped and matches every
    file (documented assumption — see README).
    """
    files = list(files)
    if not triggers:
        return files
    spec = _spec(triggers)
    return [f for f in files if spec.match_file(f)]


def agent_is_triggered(triggers: list[str], candidate_files: Iterable[str]) -> bool:
    return bool(match_triggers(triggers, candidate_files))


# --------------------------------------------------------------------------- #
# Repo / diff scanning
# --------------------------------------------------------------------------- #
def _is_ignored(rel_parts: tuple[str, ...], name: str) -> bool:
    if any(part in _IGNORED_DIRS for part in rel_parts):
        return True
    return Path(name).suffix.lower() in _BINARY_EXTS


def list_repo_files(repo_path: str | Path) -> list[str]:
    """Posix-style relative paths of reviewable files under ``repo_path``."""
    root = Path(repo_path).resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Repo snapshot not found: {root}")

    out: list[str] = []
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(root)
        if _is_ignored(rel.parts[:-1], rel.name):
            continue
        out.append(rel.as_posix())
    out.sort()
    return out


_DIFF_FILE_RE = re.compile(r"^\+\+\+ b/(.+)$", re.MULTILINE)
_DIFF_DEL_RE = re.compile(r"^--- a/(.+)$", re.MULTILINE)


def parse_diff(diff: str) -> dict[str, str]:
    """Map changed file path -> the raw hunk text touching it.

    Handles standard unified ``git diff`` output. ``/dev/null`` targets
    (pure deletions) are recorded under their ``a/`` path.
    """
    if not diff:
        return {}

    hunks: dict[str, list[str]] = {}
    current: str | None = None
    lines = diff.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("+++ "):
            target = line[4:].strip()
            if target == "/dev/null":
                continue  # keep the a/ path captured below
            current = target[2:] if target.startswith("b/") else target
            hunks.setdefault(current, [])
        elif line.startswith("--- ") and (
            i + 1 >= len(lines) or not lines[i + 1].startswith("+++ ")
        ):
            # deletion with no +++ b/ line
            src = line[4:].strip()
            if src != "/dev/null":
                current = src[2:] if src.startswith("a/") else src
                hunks.setdefault(current, [])
        elif current is not None and (
            line.startswith("@@") or line.startswith(("+", "-", " "))
        ):
            hunks[current].append(line)

    return {path: "\n".join(body) for path, body in hunks.items()}


def changed_files(diff: str) -> list[str]:
    return sorted(parse_diff(diff).keys())


def candidate_files(repo_path: str | Path, diff: str | None) -> list[str]:
    """Files to scope agents against: changed files (diff) or whole repo."""
    if diff:
        return changed_files(diff)
    return list_repo_files(repo_path)


# --------------------------------------------------------------------------- #
# Context bundle
# --------------------------------------------------------------------------- #
@dataclass
class ContextBundle:
    file_tree: str
    files_included: list[str] = field(default_factory=list)
    files_truncated: list[str] = field(default_factory=list)
    files_omitted: list[str] = field(default_factory=list)
    body: str = ""
    estimated_tokens: int = 0

    def to_prompt(self) -> str:
        return self.body


def _render_tree(files: list[str], limit: int) -> str:
    shown = files[:limit]
    lines = [f"  {f}" for f in shown]
    if len(files) > limit:
        lines.append(f"  ... ({len(files) - limit} more files omitted)")
    return "FILE TREE:\n" + "\n".join(lines)


def _read_text(path: Path) -> str | None:
    try:
        if path.stat().st_size > _MAX_BYTES_PER_FILE:
            data = path.read_bytes()[:_MAX_BYTES_PER_FILE]
            return data.decode("utf-8", errors="replace")
        return path.read_text(encoding="utf-8", errors="replace")
    except (OSError, UnicodeError):
        return None


def _file_block(rel: str, content: str) -> str:
    return f"\n===== FILE: {rel} =====\n{content}\n"


def build_context(
    repo_path: str | Path,
    relevant_files: list[str],
    diff: str | None = None,
    max_input_tokens: int | None = None,
) -> ContextBundle:
    """Assemble a token-bounded context bundle for one agent.

    Whole small files are preferred; when the budget is tight a large file
    is sent as head + the diff hunks touching it (diff mode) or just a
    truncated head (full mode). Files that don't fit at all are listed as
    omitted so the model knows coverage was incomplete.
    """
    settings = get_settings()
    root = Path(repo_path).resolve()
    budget = (max_input_tokens or settings.max_input_tokens) - settings.context_token_reserve
    budget = max(budget, 1_000)

    diff_hunks = parse_diff(diff) if diff else {}

    tree = _render_tree(relevant_files, settings.max_file_tree_entries)
    bundle = ContextBundle(file_tree=tree)
    parts: list[str] = [tree]
    used = estimate_tokens(tree)

    # Read + size everything first so we can prefer small whole files.
    sized: list[tuple[str, str]] = []
    for rel in relevant_files:
        content = _read_text(root / rel)
        if content is None:
            continue
        sized.append((rel, content))
    sized.sort(key=lambda rc: len(rc[1]))  # small files first

    for rel, content in sized:
        remaining = budget - used
        if remaining <= 200:
            bundle.files_omitted.append(rel)
            continue

        block = _file_block(rel, content)
        cost = estimate_tokens(block)

        if cost <= remaining:
            parts.append(block)
            used += cost
            bundle.files_included.append(rel)
            continue

        # Doesn't fit whole -> build a truncated version.
        truncated = _truncate_file(rel, content, diff_hunks.get(rel), remaining)
        if truncated is None:
            bundle.files_omitted.append(rel)
            continue
        parts.append(truncated)
        used += estimate_tokens(truncated)
        bundle.files_truncated.append(rel)

    bundle.body = "".join(parts)
    bundle.estimated_tokens = used
    return bundle


def _truncate_file(
    rel: str, content: str, hunk: str | None, token_budget: int
) -> str | None:
    """Produce a head (+ optional diff hunk) view that fits the budget."""
    if token_budget <= 200:
        return None

    char_budget = (token_budget - 100) * 4  # leave room for headers
    if char_budget <= 0:
        return None

    pieces = []
    if hunk:
        hunk_chars = min(len(hunk), char_budget // 2)
        pieces.append(f"[changed hunks]\n{hunk[:hunk_chars]}")
        char_budget -= hunk_chars

    head = content[: max(char_budget, 0)]
    pieces.append(f"[file head, truncated]\n{head}")

    body = "\n".join(pieces) + "\n...[truncated]..."
    return _file_block(rel, body)
