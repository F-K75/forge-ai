"""Multi-Agent Collaboration Primitives: Shared Blackboard, File-Conflict
Detection, Autonomous Critique-Repair Loops, Human-in-the-Loop Approval Gates,
and Specialist Agent Dispatch.

Pure-Python async primitives designed to compose cleanly with
`backend/core/agent_kernel.py` and Forge AI's existing `backend/agents/*`
specialist classes.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence, Set

logger = logging.getLogger(__name__)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# --------------------------------------------------------------------------- #
# 1. Shared Blackboard & Parallel File-Conflict Detection
# --------------------------------------------------------------------------- #


class ArtifactType(str, Enum):
    PRD = "prd"
    ADR = "adr"
    API_CONTRACT = "api_contract"
    UI_SPEC = "ui_spec"
    CODE_PATCH = "code_patch"
    INFRA_PLAN = "infra_plan"
    SECURITY_AUDIT = "security_audit"
    QA_REPORT = "qa_report"
    RELEASE_CHECKLIST = "release_checklist"
    REVIEW_NOTE = "review_note"


DEPARTMENT_DEFAULT_ARTIFACT: Dict[str, ArtifactType] = {
    "leadership": ArtifactType.ADR,
    "business": ArtifactType.PRD,
    "architecture": ArtifactType.API_CONTRACT,
    "design": ArtifactType.UI_SPEC,
    "engineering": ArtifactType.CODE_PATCH,
    "infrastructure": ArtifactType.INFRA_PLAN,
    "security": ArtifactType.SECURITY_AUDIT,
    "quality": ArtifactType.QA_REPORT,
    "delivery": ArtifactType.RELEASE_CHECKLIST,
}


@dataclass
class BlackboardArtifact:
    artifact_id: str
    key: str
    artifact_type: ArtifactType
    version: int
    producer_task_id: str
    producer_role: str
    department: str
    wave_index: int
    summary: str
    touched_files: List[str] = field(default_factory=list)
    payload: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["artifact_type"] = self.artifact_type.value
        return d


@dataclass
class FileConflict:
    conflict_id: str
    file_path: str
    wave_index: int
    task_ids: List[str]
    roles: List[str]
    status: str = "detected"  # detected | resolved
    detected_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class AgentBlackboard:
    """Async-safe shared artifact memory for a single multi-agent KernelRun."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._artifacts: List[BlackboardArtifact] = []
        self._versions: Dict[str, int] = {}
        self._wave_file_owners: Dict[int, Dict[str, List[tuple[str, str]]]] = {}
        self._conflicts: List[FileConflict] = []

    async def publish(
        self,
        *,
        key: str,
        artifact_type: ArtifactType,
        producer_task_id: str,
        producer_role: str,
        department: str,
        wave_index: int,
        summary: str,
        touched_files: Optional[Sequence[str]] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> tuple[BlackboardArtifact, List[FileConflict]]:
        clean_key = (key or producer_role).strip()
        clean_files = sorted(
            {f.strip() for f in (touched_files or []) if isinstance(f, str) and f.strip()}
        )

        async with self._lock:
            version_key = f"{artifact_type.value}:{clean_key}"
            next_version = self._versions.get(version_key, 0) + 1
            self._versions[version_key] = next_version

            artifact = BlackboardArtifact(
                artifact_id=_new_id("art"),
                key=clean_key,
                artifact_type=artifact_type,
                version=next_version,
                producer_task_id=producer_task_id,
                producer_role=producer_role,
                department=department,
                wave_index=wave_index,
                summary=summary[:1000],
                touched_files=clean_files,
                payload=dict(payload or {}),
            )
            self._artifacts.append(artifact)

            new_conflicts: List[FileConflict] = []
            wave_map = self._wave_file_owners.setdefault(wave_index, {})
            for path in clean_files:
                owners = wave_map.setdefault(path, [])
                existing_task_ids = {tid for tid, _ in owners}
                if producer_task_id not in existing_task_ids:
                    owners.append((producer_task_id, producer_role))
                if len(owners) > 1:
                    conflict = self._upsert_conflict_locked(wave_index, path, owners)
                    new_conflicts.append(conflict)

            return artifact, new_conflicts

    def _upsert_conflict_locked(
        self,
        wave_index: int,
        file_path: str,
        owners: List[tuple[str, str]],
    ) -> FileConflict:
        task_ids = [tid for tid, _ in owners]
        roles = [role for _, role in owners]
        for existing in self._conflicts:
            if existing.wave_index == wave_index and existing.file_path == file_path:
                existing.task_ids = task_ids
                existing.roles = roles
                return existing
        conflict = FileConflict(
            conflict_id=_new_id("conf"),
            file_path=file_path,
            wave_index=wave_index,
            task_ids=task_ids,
            roles=roles,
        )
        self._conflicts.append(conflict)
        return conflict

    def query(
        self,
        *,
        artifact_types: Optional[Sequence[ArtifactType]] = None,
        department: Optional[str] = None,
        producer_role: Optional[str] = None,
        latest_only: bool = True,
    ) -> List[BlackboardArtifact]:
        type_set: Optional[Set[ArtifactType]] = set(artifact_types) if artifact_types else None
        filtered = [
            a
            for a in self._artifacts
            if (type_set is None or a.artifact_type in type_set)
            and (department is None or a.department == department)
            and (producer_role is None or a.producer_role == producer_role)
        ]
        if not latest_only:
            return list(filtered)
        latest: Dict[str, BlackboardArtifact] = {}
        for a in filtered:
            latest[f"{a.artifact_type.value}:{a.key}"] = a
        return list(latest.values())

    @property
    def artifacts(self) -> List[BlackboardArtifact]:
        return list(self._artifacts)

    @property
    def conflicts(self) -> List[FileConflict]:
        return list(self._conflicts)

    def snapshot(self) -> Dict[str, Any]:
        return {
            "artifacts": [a.to_dict() for a in self._artifacts],
            "conflicts": [c.to_dict() for c in self._conflicts],
        }


# --------------------------------------------------------------------------- #
# 2. Autonomous Critique -> Remediation -> Re-Verification Models
# --------------------------------------------------------------------------- #


@dataclass
class ReviewFinding:
    finding_id: str
    severity: str  # critical | high | medium | low
    blocking: bool
    message: str
    target_role: Optional[str] = None
    suggested_fix: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class RepairCycleRecord:
    cycle_id: str
    round_number: int
    reviewer_task_id: str
    reviewer_role: str
    target_task_id: str
    target_role: str
    findings: List[Dict[str, Any]]
    outcome: str  # resolved | retrying | escalated | failed
    started_at: str = field(default_factory=_utc_now)
    finished_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def extract_blocking_findings(output: Optional[Dict[str, Any]]) -> List[ReviewFinding]:
    """Extract normalized blocking ReviewFindings from a security/quality task output."""
    if not isinstance(output, dict):
        return []
    raw_findings = output.get("findings") or output.get("blocking_findings") or []
    if not isinstance(raw_findings, list):
        return []

    results: List[ReviewFinding] = []
    for item in raw_findings:
        if not isinstance(item, dict):
            continue
        severity = str(item.get("severity") or "medium").lower()
        blocking = bool(
            item.get("blocking")
            if "blocking" in item
            else severity in ("critical", "high")
        )
        if not blocking:
            continue
        results.append(
            ReviewFinding(
                finding_id=str(item.get("finding_id") or _new_id("find")),
                severity=severity,
                blocking=True,
                message=str(item.get("message") or item.get("title") or "Blocking issue detected")[:500],
                target_role=str(item["target_role"]) if item.get("target_role") else None,
                suggested_fix=str(item.get("suggested_fix") or item.get("fix") or "")[:500],
            )
        )
    return results


# --------------------------------------------------------------------------- #
# 3. Human-in-the-Loop Governance Approval Gates
# --------------------------------------------------------------------------- #


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


@dataclass
class ApprovalGate:
    gate_id: str
    gate_name: str
    reason: str
    wave_index: int
    status: ApprovalStatus = ApprovalStatus.PENDING
    decided_by: Optional[str] = None
    note: str = ""
    created_at: str = field(default_factory=_utc_now)
    decided_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["status"] = self.status.value
        return d


# --------------------------------------------------------------------------- #
# 4. Specialist Agent Dispatcher (Bridges backend/agents/* into AgentKernel)
# --------------------------------------------------------------------------- #


async def dispatch_specialist_agent(
    *,
    role: str,
    department: str,
    objective: str,
    task_description: str,
    blackboard_context: str,
    repair_findings: Optional[List[Dict[str, Any]]] = None,
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    org_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Invoke Forge AI's real specialist agent classes when available.

    Returns a normalized dict result if a specialist agent handled the role, or
    None so the caller can fall back to the unified AIGateway role prompt.
    """
    prompt_body = (
        f"Objective: {objective}\n"
        f"Role: {role} ({department})\n"
        f"Task: {task_description}\n"
        f"Shared Blackboard Context:\n{blackboard_context}\n"
    )
    if repair_findings:
        prompt_body += f"\nBlocking Findings to Remediate:\n{repair_findings}\n"

    try:
        if department == "security":
            from agents.security import SecurityAgent

            result = await SecurityAgent().audit(
                prompt_body,
                user_id=user_id,
                project_id=project_id,
                org_id=org_id,
            )
            return {
                "role": role,
                "department": department,
                "agent_class": "SecurityAgent",
                "summary": result.get("summary") or "Security audit completed.",
                "findings": result.get("findings") or [],
                "payload": result,
            }

        if department == "quality":
            from agents.qa import QAAgent

            result = await QAAgent().review(
                prompt_body,
                user_id=user_id,
                project_id=project_id,
                org_id=org_id,
            )
            return {
                "role": role,
                "department": department,
                "agent_class": "QAAgent",
                "summary": result.get("summary") or "QA review completed.",
                "findings": result.get("findings") or [],
                "payload": result,
            }

        if department in ("infrastructure", "delivery") and role != "documentation_agent":
            from agents.devops import DevOpsAgent

            result = await DevOpsAgent().plan(
                prompt_body,
                user_id=user_id,
                project_id=project_id,
                org_id=org_id,
            )
            return {
                "role": role,
                "department": department,
                "agent_class": "DevOpsAgent",
                "summary": result.get("summary") or "Infrastructure/delivery plan completed.",
                "touched_files": result.get("files") or [],
                "payload": result,
            }
    except Exception:
        logger.debug(
            "SpecialistAgentDispatcher falling back to AIGateway for role=%s",
            role,
            exc_info=True,
        )
        return None

    return None
