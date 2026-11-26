"""Isolated Execution Layer — Git Worktree Lease Manager & Sandboxed Verification Runner.

Eliminates parallel agent file-collision risk by assigning isolated worktree/workspace
leases per concurrent engineering/infrastructure task, and provides strictly allowlisted
verification checks (zero shell=True, zero arbitrary command execution) whose failures
convert cleanly into blocking ReviewFindings for the autonomous critique-repair loop.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import tempfile
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)

_SAFE_IDENTIFIER_RE = re.compile(r"^[a-zA-Z0-9._-]{1,64}$")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sanitize_identifier(raw: str, *, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]", "-", (raw or "").strip())[:64].strip("-.")
    if not cleaned or not _SAFE_IDENTIFIER_RE.match(cleaned):
        return fallback
    return cleaned


@dataclass
class WorktreeLease:
    lease_id: str
    run_id: str
    task_id: str
    role: str
    department: str
    branch_name: str
    worktree_path: str
    isolation_mode: str  # git_worktree | isolated_dir
    status: str = "active"  # active | released | failed
    created_at: str = field(default_factory=_utc_now)
    released_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class WorktreeDiffSummary:
    lease_id: str
    task_id: str
    role: str
    branch_name: str
    modified_files: List[str] = field(default_factory=list)
    status: str = "clean"  # clean | modified

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class WaveReconciliationReport:
    wave_index: int
    leases_checked: int
    clean_files: List[str] = field(default_factory=list)
    conflicting_files: List[Dict[str, Any]] = field(default_factory=list)
    merge_order: List[str] = field(default_factory=list)
    status: str = "clean"  # clean | conflicts_detected
    reconciled_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class WorktreeManager:
    """Manages isolated per-task workspace leases with strict path confinement & wave patch reconciliation."""

    def __init__(
        self,
        *,
        base_dir: Optional[Path] = None,
        repo_dir: Optional[Path] = None,
        enable_git_worktrees: bool = False,
    ) -> None:
        self._base_dir = (
            Path(base_dir).resolve()
            if base_dir is not None
            else (Path(tempfile.gettempdir()) / "forge-ai-worktrees").resolve()
        )
        self._repo_dir = repo_dir.resolve() if repo_dir else None
        self._enable_git = enable_git_worktrees
        self._lock = asyncio.Lock()
        self._leases: Dict[str, WorktreeLease] = {}

    async def acquire(
        self,
        *,
        run_id: str,
        task_id: str,
        role: str,
        department: str,
    ) -> WorktreeLease:
        safe_run = _sanitize_identifier(run_id, fallback="run")
        safe_task = _sanitize_identifier(task_id, fallback="task")
        safe_role = _sanitize_identifier(role, fallback="agent")
        lease_id = f"wt_{uuid.uuid4().hex[:10]}"
        branch_name = f"agent/{safe_run[:16]}/{safe_role[:20]}-{lease_id[-6:]}"

        target_path = (self._base_dir / safe_run / f"{safe_task}-{lease_id[-6:]}").resolve()
        if not target_path.is_relative_to(self._base_dir):
            raise ValueError("Resolved worktree path escapes configured base directory")

        isolation_mode = "isolated_dir"
        async with self._lock:
            target_path.parent.mkdir(parents=True, exist_ok=True)
            if self._enable_git and self._repo_dir and (self._repo_dir / ".git").exists():
                proc = await asyncio.create_subprocess_exec(
                    "git",
                    "-C",
                    str(self._repo_dir),
                    "worktree",
                    "add",
                    "-b",
                    branch_name,
                    str(target_path),
                    "HEAD",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                _, stderr = await asyncio.wait_for(proc.communicate(), timeout=20.0)
                if proc.returncode == 0:
                    isolation_mode = "git_worktree"
                else:
                    logger.debug(
                        "git worktree fallback to isolated_dir: %s",
                        stderr.decode("utf-8", errors="replace")[:200],
                    )
                    target_path.mkdir(parents=True, exist_ok=True)
            else:
                target_path.mkdir(parents=True, exist_ok=True)

            lease = WorktreeLease(
                lease_id=lease_id,
                run_id=run_id,
                task_id=task_id,
                role=role,
                department=department,
                branch_name=branch_name,
                worktree_path=str(target_path),
                isolation_mode=isolation_mode,
            )
            self._leases[lease_id] = lease
            return lease

    def record_workspace_write(self, lease_id: str, relative_path: str, content: str) -> Path:
        """Write an artifact file strictly confined inside the lease's isolated directory."""
        lease = self._leases.get(lease_id)
        if lease is None or lease.status != "active":
            raise ValueError(f"Worktree lease '{lease_id}' is not active")
        lease_root = Path(lease.worktree_path).resolve()
        if not lease_root.is_relative_to(self._base_dir):
            raise ValueError("Worktree lease root escapes base directory")
        candidate = (lease_root / relative_path).resolve()
        if not candidate.is_relative_to(lease_root) or candidate == lease_root:
            raise ValueError(f"Write path '{relative_path}' escapes isolated worktree boundary")
        candidate.parent.mkdir(parents=True, exist_ok=True)
        candidate.write_text(content, encoding="utf-8")
        return candidate

    async def capture_diff(
        self,
        lease_id: str,
        *,
        declared_files: Optional[Sequence[str]] = None,
    ) -> WorktreeDiffSummary:
        """Inspect modified files in an isolated worktree lease (Git diff or confined dir scan)."""
        lease = self._leases.get(lease_id)
        if lease is None:
            raise ValueError(f"Unknown worktree lease '{lease_id}'")

        modified: List[str] = []
        root = Path(lease.worktree_path).resolve()
        if lease.isolation_mode == "git_worktree" and root.exists():
            proc = await asyncio.create_subprocess_exec(
                "git",
                "-C",
                str(root),
                "status",
                "--porcelain",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10.0)
            for line in stdout.decode("utf-8", errors="replace").splitlines():
                if len(line) > 3:
                    modified.append(line[3:].strip())
        elif root.exists() and root.is_relative_to(self._base_dir):
            for path in sorted(root.rglob("*")):
                if path.is_file():
                    modified.append(str(path.relative_to(root)))

        for fp in declared_files or []:
            clean = str(fp).strip().lstrip("/")
            if clean and clean not in modified:
                modified.append(clean)

        return WorktreeDiffSummary(
            lease_id=lease.lease_id,
            task_id=lease.task_id,
            role=lease.role,
            branch_name=lease.branch_name,
            modified_files=sorted(set(modified)),
            status="modified" if modified else "clean",
        )

    async def reconcile_wave_patches(
        self,
        *,
        wave_index: int,
        leases: Sequence[WorktreeLease],
        declared_files_by_task: Optional[Dict[str, Sequence[str]]] = None,
    ) -> WaveReconciliationReport:
        """Reconcile parallel worktree patches in a wave and detect exact merge conflicts."""
        file_owners: Dict[str, List[Dict[str, str]]] = {}
        merge_order: List[str] = []

        for lease in leases:
            declared = (declared_files_by_task or {}).get(lease.task_id)
            diff = await self.capture_diff(lease.lease_id, declared_files=declared)
            merge_order.append(f"{lease.role}:{lease.branch_name}")
            for fp in diff.modified_files:
                file_owners.setdefault(fp, []).append(
                    {"lease_id": lease.lease_id, "task_id": lease.task_id, "role": lease.role}
                )

        clean_files: List[str] = []
        conflicting_files: List[Dict[str, Any]] = []
        for fp, owners in sorted(file_owners.items()):
            if len(owners) > 1:
                conflicting_files.append(
                    {
                        "file_path": fp,
                        "roles": [o["role"] for o in owners],
                        "lease_ids": [o["lease_id"] for o in owners],
                    }
                )
            else:
                clean_files.append(fp)

        return WaveReconciliationReport(
            wave_index=wave_index,
            leases_checked=len(leases),
            clean_files=clean_files,
            conflicting_files=conflicting_files,
            merge_order=merge_order,
            status="conflicts_detected" if conflicting_files else "clean",
        )

    async def release(self, lease_id: str) -> Optional[WorktreeLease]:
        async with self._lock:
            lease = self._leases.get(lease_id)
            if lease is None or lease.status == "released":
                return lease

            target = Path(lease.worktree_path).resolve()
            if target.is_relative_to(self._base_dir):
                if lease.isolation_mode == "git_worktree" and self._repo_dir:
                    try:
                        proc = await asyncio.create_subprocess_exec(
                            "git",
                            "-C",
                            str(self._repo_dir),
                            "worktree",
                            "remove",
                            "--force",
                            str(target),
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        await asyncio.wait_for(proc.communicate(), timeout=15.0)
                    except Exception:
                        logger.debug("git worktree remove cleanup skipped", exc_info=True)
                elif target.exists() and target.is_dir():
                    try:
                        shutil.rmtree(target, ignore_errors=True)
                    except OSError:
                        pass

            lease.status = "released"
            lease.released_at = _utc_now()
            return lease

    def list_leases(self, *, run_id: Optional[str] = None) -> List[WorktreeLease]:
        leases = list(self._leases.values())
        if run_id:
            leases = [l for l in leases if l.run_id == run_id]
        return leases


# --------------------------------------------------------------------------- #
# Sandboxed Static Security Hygiene & Allowlisted Verification Runner
# --------------------------------------------------------------------------- #

_SECRET_PATTERNS: Sequence[tuple[str, re.Pattern[str], str]] = (
    ("hardcoded_api_key", re.compile(r"\b(AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z]{20,}|ghp_[0-9A-Za-z]{20,})\b"), "Move secret to server-side environment variables"),
    ("unsafe_html_sink", re.compile(r"(dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write\s*\()"), "Use safe framework text bindings instead of raw HTML injection"),
    ("shell_injection_risk", re.compile(r"subprocess\.(run|Popen|call)\([^)]*shell\s*=\s*True"), "Use argument-list subprocess execution without shell=True"),
)


def run_static_security_hygiene_scan(code_text: str) -> List[Dict[str, Any]]:
    """Deterministic static scan returning normalized blocking ReviewFinding dicts."""
    findings: List[Dict[str, Any]] = []
    if not code_text:
        return findings
    for rule_id, pattern, suggested_fix in _SECRET_PATTERNS:
        if pattern.search(code_text):
            findings.append(
                {
                    "finding_id": f"sec_{rule_id}",
                    "severity": "critical",
                    "blocking": True,
                    "message": f"Static verification flagged '{rule_id}' pattern in generated artifact",
                    "target_role": "backend_engineer",
                    "suggested_fix": suggested_fix,
                }
            )
    return findings


@dataclass
class VerificationResult:
    profile: str
    passed: bool
    exit_code: int
    stdout_excerpt: str
    findings: List[Dict[str, Any]] = field(default_factory=list)
    sandbox_mode: str = "local_allowlisted"  # local_allowlisted | docker_hardened
    checked_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class VerificationSandbox:
    """Runs strictly allowlisted verification profiles (never arbitrary shell strings).

    Supports hardened Docker container execution (`--network=none --read-only
    --cap-drop=ALL --pids-limit=64 --memory=512m`) when available, with a
    deterministic local allowlisted fallback.
    """

    ALLOWED_PROFILES = frozenset(
        {"python_syntax", "security_hygiene", "python_unittest", "containerized_python_syntax"}
    )

    @staticmethod
    def build_hardened_docker_args(
        *, workspace_dir: Path, inner_command: Sequence[str], image: str = "python:3.11-slim"
    ) -> List[str]:
        """Build an argument-list Docker invocation with network/capability/memory isolation."""
        return [
            "docker",
            "run",
            "--rm",
            "--network=none",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            "--pids-limit=64",
            "--memory=512m",
            "--cpus=1.0",
            "-v",
            f"{workspace_dir.resolve()}:/workspace:ro",
            "-w",
            "/workspace",
            image,
            *inner_command,
        ]

    @staticmethod
    def _docker_available() -> bool:
        return bool(shutil.which("docker")) and os.getenv("FORGE_ENABLE_DOCKER_SANDBOX") == "1"

    def _confine_python_files(self, base_cwd: Path, target_files: Optional[Sequence[str]]) -> List[Path]:
        safe_paths: List[Path] = []
        for raw in target_files or []:
            candidate = (base_cwd / raw).resolve()
            if not candidate.is_relative_to(base_cwd):
                raise ValueError(f"Verification path escapes workspace root: {raw}")
            if candidate.suffix == ".py" and candidate.is_file():
                safe_paths.append(candidate)
        return safe_paths

    async def run_profile(
        self,
        *,
        profile: str,
        target_files: Optional[Sequence[str]] = None,
        code_snippet: str = "",
        cwd: Optional[Path] = None,
        timeout_seconds: float = 15.0,
    ) -> VerificationResult:
        if profile not in self.ALLOWED_PROFILES:
            raise ValueError(f"Unsupported verification profile '{profile}'")

        if profile == "security_hygiene":
            findings = run_static_security_hygiene_scan(code_snippet)
            return VerificationResult(
                profile=profile,
                passed=(len(findings) == 0),
                exit_code=0 if not findings else 1,
                stdout_excerpt=(
                    "Static security hygiene check passed with 0 findings."
                    if not findings
                    else f"Detected {len(findings)} blocking security hygiene finding(s)."
                ),
                findings=findings,
            )

        base_cwd = (cwd or Path.cwd()).resolve()
        safe_paths = self._confine_python_files(base_cwd, target_files)
        if not safe_paths:
            return VerificationResult(
                profile=profile,
                passed=True,
                exit_code=0,
                stdout_excerpt="No Python files to verify.",
            )

        sandbox_mode = "local_allowlisted"
        if profile == "python_unittest":
            cmd = ["python3", "-m", "unittest", *[str(p) for p in safe_paths]]
        elif profile == "containerized_python_syntax" and self._docker_available():
            rel_files = [str(p.relative_to(base_cwd)) for p in safe_paths]
            cmd = self.build_hardened_docker_args(
                workspace_dir=base_cwd,
                inner_command=["python3", "-m", "py_compile", *rel_files],
            )
            sandbox_mode = "docker_hardened"
        else:
            cmd = ["python3", "-m", "py_compile", *[str(p) for p in safe_paths]]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(base_cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
        combined = (stdout + stderr).decode("utf-8", errors="replace").strip()[:1000]
        passed = proc.returncode == 0
        finding_id = "qa_unittest_failure" if profile == "python_unittest" else "qa_syntax_error"
        findings = (
            []
            if passed
            else [
                {
                    "finding_id": finding_id,
                    "severity": "critical",
                    "blocking": True,
                    "target_role": "backend_engineer",
                    "message": f"Verification profile '{profile}' failed: {combined[:240]}",
                    "suggested_fix": "Fix the failing code or assertion and re-run verification",
                }
            ]
        )
        return VerificationResult(
            profile=profile,
            passed=passed,
            exit_code=proc.returncode or 0,
            stdout_excerpt=combined or f"Verification profile '{profile}' passed.",
            findings=findings,
            sandbox_mode=sandbox_mode,
        )


_default_worktree_manager: Optional[WorktreeManager] = None


def get_worktree_manager() -> WorktreeManager:
    global _default_worktree_manager
    if _default_worktree_manager is None:
        _default_worktree_manager = WorktreeManager(enable_git_worktrees=False)
    return _default_worktree_manager
