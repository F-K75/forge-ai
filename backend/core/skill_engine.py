"""Intelligent Skill Engine — SKILL.md Discovery, 9-Domain Catalog,
Dependency Resolution, Least-Privilege Permission Validation, and Task Routing.

Pure-Python stdlib implementation so it runs cleanly in both FastAPI production
and standalone unit tests. Discovers real `.agents/skills/*/SKILL.md` files on
disk with strict path confinement and combines them with Forge AI's canonical
9-domain engineering skill catalog.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, FrozenSet, List, Optional, Sequence, Set, Tuple

logger = logging.getLogger(__name__)


class SkillDomain(str, Enum):
    SOFTWARE_ENGINEERING = "software_engineering"
    AI_ENGINEERING = "ai_engineering"
    AGENT_ENGINEERING = "agent_engineering"
    DEVOPS = "devops"
    SECURITY = "security"
    QUALITY_ENGINEERING = "quality_engineering"
    PRODUCT_BUSINESS = "product_business"
    DATA_ENGINEERING = "data_engineering"
    DESIGN_TOOLS = "design_tools"


class SkillError(Exception):
    """Base error for Intelligent Skill Engine."""


class SkillDependencyError(SkillError):
    """Raised on missing or cyclic skill dependencies."""


class SkillPermissionError(SkillError):
    """Raised when a role/department lacks required permissions for a skill."""


# Default least-privilege permissions granted to each autonomous department.
DEPARTMENT_DEFAULT_PERMISSIONS: Dict[str, FrozenSet[str]] = {
    "leadership": frozenset({"read_repo", "read_blackboard", "write_decisions", "approve_gates"}),
    "business": frozenset({"read_repo", "read_blackboard", "write_specs"}),
    "architecture": frozenset({"read_repo", "read_blackboard", "write_specs", "write_decisions"}),
    "design": frozenset({"read_repo", "read_blackboard", "write_ui_assets", "write_specs"}),
    "engineering": frozenset({"read_repo", "read_blackboard", "write_code", "run_tests"}),
    "infrastructure": frozenset({"read_repo", "read_blackboard", "write_infra", "run_checks"}),
    "security": frozenset({"read_repo", "read_blackboard", "run_security_scan", "emit_findings"}),
    "quality": frozenset({"read_repo", "read_blackboard", "run_tests", "emit_findings"}),
    "delivery": frozenset({"read_repo", "read_blackboard", "write_docs", "prepare_release"}),
}


@dataclass
class SkillManifest:
    name: str
    domain: SkillDomain
    description: str
    version: str = "1.0.0"
    keywords: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    required_permissions: List[str] = field(default_factory=lambda: ["read_repo"])
    allowed_departments: List[str] = field(default_factory=list)
    instructions: str = ""
    source_path: Optional[str] = None
    origin: str = "builtin"  # filesystem | builtin

    def to_dict(self, *, include_instructions: bool = False) -> Dict[str, Any]:
        d = asdict(self)
        d["domain"] = self.domain.value
        if not include_instructions:
            d.pop("instructions", None)
        return d


@dataclass
class SkillActivation:
    skill_name: str
    domain: str
    version: str
    origin: str
    score: float
    resolved_dependencies: List[str]
    instructions_excerpt: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Canonical built-in skill definitions spanning all 9 Forge AI OS domains.
BUILTIN_SKILLS: Tuple[SkillManifest, ...] = (
    SkillManifest(
        name="fullstack-architecture",
        domain=SkillDomain.SOFTWARE_ENGINEERING,
        description="API contract design, modular service decomposition, and clean TypeScript/Python interfaces.",
        keywords=["api", "fastapi", "endpoint", "contract", "backend", "frontend", "react", "typescript", "architecture"],
        required_permissions=["read_repo"],
        allowed_departments=["architecture", "engineering", "leadership"],
        instructions="Define typed API contracts first, isolate side effects behind repository interfaces, and avoid circular imports.",
    ),
    SkillManifest(
        name="api-hardening",
        domain=SkillDomain.SOFTWARE_ENGINEERING,
        description="Input validation, bounded pagination, structured error responses, and backward-compatible routing.",
        keywords=["api", "endpoint", "route", "fastapi", "validation", "pydantic", "rest", "backend"],
        dependencies=["fullstack-architecture"],
        required_permissions=["read_repo", "write_code"],
        allowed_departments=["engineering", "architecture", "security"],
        instructions="Validate all query/body parameters with strict bounds, enforce auth/ownership checks, and never expose stack traces.",
    ),
    SkillManifest(
        name="rag-context-engineering",
        domain=SkillDomain.AI_ENGINEERING,
        description="Hybrid retrieval, chunking, embedding pipelines, prompt structuring, and citation grounding.",
        keywords=["rag", "embedding", "retrieval", "llm", "prompt", "context", "vector", "ai"],
        required_permissions=["read_repo"],
        allowed_departments=["engineering", "architecture", "leadership"],
        instructions="Bound retrieved context budgets, preserve source citations, and enforce grounded abstention when evidence is missing.",
    ),
    SkillManifest(
        name="multi-agent-orchestration",
        domain=SkillDomain.AGENT_ENGINEERING,
        description="DAG wave scheduling, shared blackboard artifacts, bounded delegation, and self-healing critique loops.",
        keywords=["agent", "multi-agent", "dag", "workflow", "orchestrate", "delegate", "blackboard"],
        required_permissions=["read_blackboard"],
        allowed_departments=["leadership", "architecture", "engineering"],
        instructions="Schedule independent tasks in parallel waves, validate acyclic dependencies, and cap delegation depth and repair rounds.",
    ),
    SkillManifest(
        name="container-k8s-delivery",
        domain=SkillDomain.DEVOPS,
        description="Dockerfiles, Kubernetes manifests, CI/CD pipelines, health probes, and rollback runbooks.",
        keywords=["docker", "kubernetes", "k8s", "ci/cd", "deploy", "release", "rollout", "observability", "prometheus"],
        required_permissions=["read_repo"],
        allowed_departments=["infrastructure", "delivery", "architecture"],
        instructions="Ensure non-root containers, explicit readiness/liveness probes, resource limits, and tested rollback steps.",
    ),
    SkillManifest(
        name="security-threat-audit",
        domain=SkillDomain.SECURITY,
        description="OWASP verification, auth/RBAC boundary checks, SSRF/path-traversal defense, and secrets hygiene.",
        keywords=["security", "auth", "oauth", "jwt", "rbac", "csrf", "xss", "audit", "compliance", "gdpr", "vulnerability"],
        required_permissions=["read_repo", "emit_findings"],
        allowed_departments=["security", "architecture", "leadership"],
        instructions="Verify server-side authentication and resource ownership on every protected route, reject path traversal and unsafe URLs, and emit structured blocking findings.",
    ),
    SkillManifest(
        name="automated-qa-verification",
        domain=SkillDomain.QUALITY_ENGINEERING,
        description="Unit, integration, and E2E test authoring with regression coverage and deterministic assertions.",
        keywords=["test", "pytest", "vitest", "playwright", "e2e", "qa", "coverage", "regression", "verify"],
        required_permissions=["read_repo", "run_tests"],
        allowed_departments=["quality", "engineering"],
        instructions="Cover happy paths, boundary conditions, failure propagation, and authorization denial paths with isolated deterministic tests.",
    ),
    SkillManifest(
        name="prd-product-strategy",
        domain=SkillDomain.PRODUCT_BUSINESS,
        description="PRD authorship, unit economics, pricing models, ICP validation, and measurable KPI definitions.",
        keywords=["prd", "pricing", "monetiz", "revenue", "business", "roadmap", "requirement", "kpi", "market"],
        required_permissions=["read_repo"],
        allowed_departments=["business", "leadership"],
        instructions="Link customer problems to measurable acceptance criteria, explicit scope boundaries, and sustainable unit economics.",
    ),
    SkillManifest(
        name="database-schema-modeling",
        domain=SkillDomain.DATA_ENGINEERING,
        description="Schema design, composite indexing, safe non-destructive migrations, and query performance.",
        keywords=["database", "mongo", "postgres", "sql", "schema", "migration", "index", "billing", "data"],
        required_permissions=["read_repo"],
        allowed_departments=["engineering", "architecture"],
        instructions="Design idempotent, backward-compatible migrations, index hot filter keys, and parameterize every query.",
    ),
    SkillManifest(
        name="accessible-design-systems",
        domain=SkillDomain.DESIGN_TOOLS,
        description="Semantic design tokens, WCAG AA contrast, keyboard navigation, and responsive grid layouts.",
        keywords=["ui", "ux", "design", "token", "component", "layout", "accessibility", "wcag", "dashboard", "tailwind"],
        required_permissions=["read_repo"],
        allowed_departments=["design", "engineering"],
        instructions="Use semantic CSS tokens instead of hardcoded colors, enforce WCAG AA contrast, and ensure full keyboard navigability.",
    ),
)


def _infer_domain_from_skill(name: str, description: str) -> SkillDomain:
    blob = f"{name} {description}".lower()
    if any(k in blob for k in ("design", "brand", "banner", "slide", "ui", "ux", "styling", "token")):
        return SkillDomain.DESIGN_TOOLS
    if any(k in blob for k in ("security", "auth", "threat", "secret")):
        return SkillDomain.SECURITY
    if any(k in blob for k in ("test", "qa", "playwright", "vitest")):
        return SkillDomain.QUALITY_ENGINEERING
    if any(k in blob for k in ("docker", "k8s", "deploy", "local", "redis", "mongo", "ci/cd")):
        return SkillDomain.DEVOPS
    if any(k in blob for k in ("sql", "database", "etl", "data")):
        return SkillDomain.DATA_ENGINEERING
    if any(k in blob for k in ("rag", "llm", "embedding", "prompt")):
        return SkillDomain.AI_ENGINEERING
    if any(k in blob for k in ("agent", "orchestrat", "workflow")):
        return SkillDomain.AGENT_ENGINEERING
    if any(k in blob for k in ("prd", "market", "business", "pricing")):
        return SkillDomain.PRODUCT_BUSINESS
    return SkillDomain.SOFTWARE_ENGINEERING


def parse_skill_markdown(content: str, *, fallback_name: str, source_path: Optional[str] = None) -> SkillManifest:
    """Parse YAML frontmatter + markdown body from a SKILL.md document without PyYAML."""
    name = fallback_name
    description = ""
    version = "1.0.0"
    dependencies: List[str] = []
    required_permissions: List[str] = ["read_repo"]
    body = content

    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", content, flags=re.DOTALL)
    if fm_match:
        fm_block, body = fm_match.group(1), fm_match.group(2)
        for line in fm_block.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or ":" not in stripped:
                continue
            key, raw_val = stripped.split(":", 1)
            key = key.strip().lower()
            val = raw_val.strip().strip('"').strip("'")
            if key == "name" and val:
                name = val
            elif key == "description" and val:
                description = val
            elif key == "version" and val:
                version = val
            elif key == "dependencies" and val:
                cleaned = val.strip("[]")
                dependencies = [d.strip().strip('"').strip("'") for d in cleaned.split(",") if d.strip()]
            elif key == "permissions" and val:
                cleaned = val.strip("[]")
                perms = [p.strip().strip('"').strip("'") for p in cleaned.split(",") if p.strip()]
                if perms:
                    required_permissions = perms

    if not description:
        first_para = next((ln.strip() for ln in body.splitlines() if ln.strip() and not ln.startswith("#")), "")
        description = first_para[:300] or f"Skill definition for {name}"

    domain = _infer_domain_from_skill(name, description)
    tokens = sorted({tok for tok in re.findall(r"[a-z0-9][a-z0-9_-]{2,}", f"{name} {description}".lower())})
    return SkillManifest(
        name=name,
        domain=domain,
        description=description[:500],
        version=version,
        keywords=tokens[:24],
        dependencies=dependencies,
        required_permissions=required_permissions,
        allowed_departments=[],
        instructions=body.strip()[:1200],
        source_path=source_path,
        origin="filesystem",
    )


class SkillRegistry:
    """Central registry for discovering, validating, and resolving skills."""

    def __init__(self, *, load_builtins: bool = True, skills_dir: Optional[Path] = None) -> None:
        self._skills: Dict[str, SkillManifest] = {}
        self._telemetry: Dict[str, Dict[str, Any]] = {}
        if load_builtins:
            for manifest in BUILTIN_SKILLS:
                self.register(manifest)
        if skills_dir is not None:
            self.discover_from_directory(skills_dir)

    def record_outcome(
        self,
        skill_name: str,
        *,
        quality_score: float,
        latency_ms: int = 0,
        cost_usd: float = 0.0,
        passed: bool = True,
    ) -> Dict[str, Any]:
        """Record observed execution quality & cost telemetry for outcome-driven routing."""
        clamped_q = max(0.0, min(1.0, float(quality_score)))
        rec = self._telemetry.setdefault(
            skill_name,
            {
                "skill_name": skill_name,
                "invocations": 0,
                "passed_count": 0,
                "avg_quality_score": 0.0,
                "avg_latency_ms": 0.0,
                "total_cost_usd": 0.0,
            },
        )
        n = rec["invocations"] + 1
        rec["invocations"] = n
        if passed:
            rec["passed_count"] += 1
        rec["avg_quality_score"] = round(((rec["avg_quality_score"] * (n - 1)) + clamped_q) / n, 4)
        rec["avg_latency_ms"] = round(((rec["avg_latency_ms"] * (n - 1)) + max(0, int(latency_ms))) / n, 1)
        rec["total_cost_usd"] = round(rec["total_cost_usd"] + max(0.0, float(cost_usd)), 6)
        return dict(rec)

    def routing_boost(self, skill_name: str) -> float:
        """Return bounded quality-feedback score adjustment in [-0.5, +1.0]."""
        rec = self._telemetry.get(skill_name)
        if not rec or rec["invocations"] < 1:
            return 0.0
        # Center around 0.75 quality baseline; confidence scales up over first 5 runs
        confidence = min(1.0, rec["invocations"] / 5.0)
        delta = (rec["avg_quality_score"] - 0.75) * 4.0 * confidence
        return round(max(-0.5, min(1.0, delta)), 3)

    def get_telemetry(self) -> List[Dict[str, Any]]:
        return [
            {**rec, "routing_boost": self.routing_boost(name)}
            for name, rec in sorted(
                self._telemetry.items(),
                key=lambda pair: (-pair[1]["invocations"], pair[0]),
            )
        ]

    def register(self, manifest: SkillManifest) -> None:
        self._skills[manifest.name] = manifest

    def get(self, name: str) -> Optional[SkillManifest]:
        return self._skills.get(name)

    def discover_from_directory(self, base_dir: Path) -> List[SkillManifest]:
        """Discover SKILL.md manifests strictly confined within `base_dir`."""
        discovered: List[SkillManifest] = []
        root = base_dir.resolve()
        if not root.exists() or not root.is_dir():
            return discovered

        for entry in sorted(root.iterdir()):
            if not entry.is_dir():
                continue
            skill_file = (entry / "SKILL.md").resolve()
            # Path confinement guard
            if not skill_file.is_relative_to(root):
                logger.warning("Skipping skill outside base directory: %s", skill_file)
                continue
            if not skill_file.is_file():
                continue
            try:
                content = skill_file.read_text(encoding="utf-8", errors="replace")
                manifest = parse_skill_markdown(
                    content,
                    fallback_name=entry.name,
                    source_path=str(skill_file.relative_to(root)),
                )
                self.register(manifest)
                discovered.append(manifest)
            except OSError:
                logger.debug("Failed to read SKILL.md at %s", skill_file, exc_info=True)
        return discovered

    def list_skills(
        self,
        *,
        domain: Optional[str] = None,
        department: Optional[str] = None,
        search: Optional[str] = None,
        include_instructions: bool = False,
    ) -> List[Dict[str, Any]]:
        q = (search or "").strip().lower()
        results: List[Dict[str, Any]] = []
        for skill in sorted(self._skills.values(), key=lambda s: (s.domain.value, s.name)):
            if domain and skill.domain.value != domain:
                continue
            if department and skill.allowed_departments and department not in skill.allowed_departments:
                continue
            if q and q not in f"{skill.name} {skill.description} {' '.join(skill.keywords)}".lower():
                continue
            results.append(skill.to_dict(include_instructions=include_instructions))
        return results

    def domain_summary(self) -> Dict[str, Any]:
        counts: Dict[str, int] = {d.value: 0 for d in SkillDomain}
        fs_count = 0
        for s in self._skills.values():
            counts[s.domain.value] = counts.get(s.domain.value, 0) + 1
            if s.origin == "filesystem":
                fs_count += 1
        return {
            "total_skills": len(self._skills),
            "filesystem_skills": fs_count,
            "builtin_skills": len(self._skills) - fs_count,
            "domains": counts,
        }

    def resolve_dependencies(self, skill_names: Sequence[str]) -> List[SkillManifest]:
        """Resolve transitive skill dependencies in topological order with cycle detection."""
        ordered: List[SkillManifest] = []
        visiting: Set[str] = set()
        visited: Set[str] = set()

        def _visit(name: str) -> None:
            if name in visited:
                return
            if name in visiting:
                raise SkillDependencyError(f"Cyclic skill dependency detected at '{name}'")
            manifest = self._skills.get(name)
            if manifest is None:
                raise SkillDependencyError(f"Unknown skill dependency '{name}'")
            visiting.add(name)
            for dep in manifest.dependencies:
                _visit(dep)
            visiting.remove(name)
            visited.add(name)
            ordered.append(manifest)

        for name in skill_names:
            _visit(name)
        return ordered

    def validate_permissions(
        self,
        manifest: SkillManifest,
        *,
        department: str,
        granted_permissions: Optional[Set[str]] = None,
    ) -> Tuple[bool, Optional[str]]:
        if manifest.allowed_departments and department not in manifest.allowed_departments:
            return (
                False,
                f"Skill '{manifest.name}' is not permitted for department '{department}'",
            )
        effective_perms = (
            granted_permissions
            if granted_permissions is not None
            else set(DEPARTMENT_DEFAULT_PERMISSIONS.get(department, frozenset({"read_repo"})))
        )
        missing = [p for p in manifest.required_permissions if p not in effective_perms]
        if missing:
            return (
                False,
                f"Department '{department}' lacks permission(s) {missing} for skill '{manifest.name}'",
            )
        return True, None


class SkillRouter:
    """Scores, permission-checks, and resolves skills for a KernelTask."""

    def __init__(self, registry: SkillRegistry) -> None:
        self._registry = registry

    def route_for_task(
        self,
        *,
        role: str,
        department: str,
        objective: str,
        task_description: str = "",
        top_k: int = 3,
        granted_permissions: Optional[Set[str]] = None,
    ) -> List[SkillActivation]:
        query_blob = f"{role.replace('_', ' ')} {department} {objective} {task_description}".lower()
        scored: List[Tuple[float, SkillManifest]] = []

        for skill in self._registry._skills.values():
            allowed, _ = self._registry.validate_permissions(
                skill, department=department, granted_permissions=granted_permissions
            )
            if not allowed:
                continue
            hits = sum(1 for kw in skill.keywords if kw in query_blob)
            dept_bonus = 1.5 if department in skill.allowed_departments else 0.0
            base_score = hits + dept_bonus
            if base_score > 0:
                score = max(0.1, base_score + self._registry.routing_boost(skill.name))
                scored.append((score, skill))

        scored.sort(key=lambda item: (-item[0], item[1].name))
        activations: List[SkillActivation] = []
        for score, skill in scored[: max(1, min(top_k, 8))]:
            try:
                chain = self._registry.resolve_dependencies([skill.name])
            except SkillDependencyError:
                continue
            # Ensure every transitive dependency is also permitted
            all_ok = all(
                self._registry.validate_permissions(
                    dep, department=department, granted_permissions=granted_permissions
                )[0]
                for dep in chain
            )
            if not all_ok:
                continue
            activations.append(
                SkillActivation(
                    skill_name=skill.name,
                    domain=skill.domain.value,
                    version=skill.version,
                    origin=skill.origin,
                    score=round(score, 2),
                    resolved_dependencies=[m.name for m in chain if m.name != skill.name],
                    instructions_excerpt=skill.instructions[:280],
                )
            )
        return activations


_default_registry: Optional[SkillRegistry] = None


def get_skill_registry() -> SkillRegistry:
    global _default_registry
    if _default_registry is None:
        repo_root = Path(__file__).resolve().parents[2]
        agents_skills_dir = repo_root / ".agents" / "skills"
        _default_registry = SkillRegistry(load_builtins=True, skills_dir=agents_skills_dir)
    return _default_registry


def get_skill_router() -> SkillRouter:
    return SkillRouter(get_skill_registry())
