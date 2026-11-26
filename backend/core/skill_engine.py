"""Intelligent Skill Engine — SKILL.md Discovery, 9-Domain Catalog,
Dependency Resolution, Least-Privilege Permission Validation, and Task Routing.

Forge AI's canonical skill catalogue is file-based: one `backend/skills/<name>/SKILL.md`
per skill (YAML frontmatter + markdown instructions). The default registry loads that
catalogue, then discovers repo-level `.agents/skills/*/SKILL.md` files with strict path
confinement. Malformed files are skipped with a warning; duplicate names and unknown
domains are rejected; dependency cycles are detected at resolution time.

Uses PyYAML (a pinned backend dependency) for frontmatter when available and falls
back to a tiny stdlib parser otherwise, so it runs in both FastAPI and bare unit tests.
"""

from __future__ import annotations

import functools
import logging
import re
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, FrozenSet, List, Optional, Pattern, Sequence, Set, Tuple

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


class SkillParseError(SkillError):
    """Raised when a SKILL.md document is malformed or fails validation."""


class SkillDuplicateError(SkillError):
    """Raised when a skill name is registered twice without explicit replacement."""


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

# Forge AI's canonical skill catalogue lives on disk as `backend/skills/<name>/SKILL.md`.
# `backend/` is the Docker build context (`COPY . .`), so it ships in the image at /app/skills.
DEFAULT_CATALOG_DIR: Path = Path(__file__).resolve().parents[1] / "skills"

_SKILL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")
_MAX_INSTRUCTIONS_CHARS = 8000
_INFERRED_KEYWORD_STOPWORDS = frozenset(
    {
        "and", "the", "for", "with", "use", "using", "via", "into", "from", "that", "this",
        "when", "whenever", "you", "your", "are", "not", "any", "all", "can", "need",
        "skill", "skills", "rather", "than", "just",
    }
)


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
    origin: str = "builtin"  # builtin (catalogue/fallback) | filesystem (.agents) | marketplace

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


# Minimal emergency fallback, used only if the on-disk catalogue is missing or yields
# no valid skills (e.g. a broken image). Metadata mirrors the matching SKILL.md files;
# tests assert they stay in sync.
FALLBACK_SKILLS: Tuple[SkillManifest, ...] = (
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
)

# Backward-compatible alias: the full catalogue used to be hard-coded here.
BUILTIN_SKILLS = FALLBACK_SKILLS


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


def _unquote(val: str) -> str:
    val = val.strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
        return val[1:-1]
    return val


def _parse_frontmatter_minimal(block: str) -> Dict[str, Any]:
    """Tiny YAML-subset parser used only when PyYAML is unavailable.

    Supports top-level `key: scalar`, inline lists `key: [a, b]`, block lists
    (`key:` followed by `- item` lines) and ignores nested mappings except
    `metadata.version`.
    """
    data: Dict[str, Any] = {}
    current_key: Optional[str] = None
    for lineno, line in enumerate(block.splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        stripped = line.strip()
        if line[:1] in (" ", "\t") or stripped.startswith("- "):
            if current_key is None:
                raise SkillParseError(f"frontmatter line {lineno}: unexpected indentation")
            if stripped.startswith("- "):
                items = data.get(current_key)
                data[current_key] = (items if isinstance(items, list) else []) + [_unquote(stripped[2:])]
            elif current_key == "metadata" and ":" in stripped:
                k, v = stripped.split(":", 1)
                meta = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
                meta[k.strip()] = _unquote(v)
                data["metadata"] = meta
            continue
        if ":" not in stripped:
            raise SkillParseError(f"frontmatter line {lineno}: expected 'key: value'")
        key, raw_val = stripped.split(":", 1)
        current_key, raw_val = key.strip(), raw_val.strip()
        if raw_val.startswith("["):
            if not raw_val.endswith("]"):
                raise SkillParseError(f"frontmatter line {lineno}: unterminated list for '{current_key}'")
            data[current_key] = [_unquote(v) for v in raw_val[1:-1].split(",") if v.strip()]
        else:
            data[current_key] = _unquote(raw_val) if raw_val else None
    return data


def _load_frontmatter(block: str) -> Dict[str, Any]:
    try:
        import yaml
    except ImportError:  # pragma: no cover - only without PyYAML installed
        return _parse_frontmatter_minimal(block)
    try:
        data = yaml.safe_load(block)
    except yaml.YAMLError as exc:
        raise SkillParseError(f"invalid YAML frontmatter: {exc}") from exc
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise SkillParseError("frontmatter must be a mapping of key: value pairs")
    return data


def _as_str_list(value: Any, *, field_name: str) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [v.strip() for v in value.split(",") if v.strip()]
    if isinstance(value, (list, tuple)):
        out: List[str] = []
        for item in value:
            if item is None or isinstance(item, (dict, list, tuple)):
                raise SkillParseError(f"'{field_name}' entries must be plain strings")
            text = str(item).strip()
            if text:
                out.append(text)
        return out
    raise SkillParseError(f"'{field_name}' must be a list of strings")


def _first(data: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if data.get(key) is not None:
            return data[key]
    return None


def parse_skill_markdown(
    content: str,
    *,
    fallback_name: str,
    source_path: Optional[str] = None,
    strict: bool = False,
    origin: str = "filesystem",
) -> SkillManifest:
    """Parse YAML frontmatter + markdown body from a SKILL.md document.

    Frontmatter fields: name, version, domain, description, keywords, dependencies,
    permissions (alias: required_permissions), departments (alias: allowed_departments).

    An explicitly declared unknown domain is always rejected. `strict=True` (used for
    Forge's own catalogue) additionally requires frontmatter, an explicit domain, a
    description, a non-empty body and known departments. Raises `SkillParseError`.
    """
    content = content.lstrip("﻿").replace("\r\n", "\n")
    body = content
    data: Dict[str, Any] = {}

    fm_match = re.match(r"^---[ \t]*\n(.*?)\n---[ \t]*(?:\n(.*))?$", content, flags=re.DOTALL)
    if fm_match:
        data = _load_frontmatter(fm_match.group(1))
        body = fm_match.group(2) or ""
    elif content.startswith("---"):
        raise SkillParseError("unterminated frontmatter block (missing closing '---')")
    elif strict:
        raise SkillParseError("missing YAML frontmatter")

    name = str(_first(data, "name") or fallback_name).strip()
    if not _SKILL_NAME_RE.match(name):
        raise SkillParseError(f"invalid skill name {name!r}: use 2-64 lowercase letters, digits or hyphens")

    description = " ".join(str(_first(data, "description") or "").split())
    if not description:
        if strict:
            raise SkillParseError(f"skill '{name}' is missing a description")
        first_para = next((ln.strip() for ln in body.splitlines() if ln.strip() and not ln.startswith("#")), "")
        description = first_para[:300] or f"Skill definition for {name}"

    raw_domain = _first(data, "domain")
    if raw_domain is not None:
        try:
            domain = SkillDomain(str(raw_domain).strip().lower())
        except ValueError:
            raise SkillParseError(
                f"skill '{name}' declares unknown domain {raw_domain!r}; "
                f"expected one of {[d.value for d in SkillDomain]}"
            ) from None
    elif strict:
        raise SkillParseError(f"skill '{name}' is missing a domain")
    else:
        domain = _infer_domain_from_skill(name, description)

    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    version = str(_first(data, "version") or metadata.get("version") or "1.0.0").strip()

    keywords = [k.lower() for k in _as_str_list(_first(data, "keywords"), field_name="keywords")]
    if not keywords:
        tokens = re.findall(r"[a-z0-9][a-z0-9_-]{2,}", f"{name} {description}".lower())
        keywords = sorted({t for t in tokens if t not in _INFERRED_KEYWORD_STOPWORDS})[:24]

    dependencies = _as_str_list(_first(data, "dependencies"), field_name="dependencies")
    if name in dependencies:
        raise SkillParseError(f"skill '{name}' depends on itself")
    permissions = _as_str_list(
        _first(data, "permissions", "required_permissions"), field_name="permissions"
    ) or ["read_repo"]
    departments = _as_str_list(_first(data, "departments", "allowed_departments"), field_name="departments")
    unknown_depts = [d for d in departments if d not in DEPARTMENT_DEFAULT_PERMISSIONS]
    if strict and unknown_depts:
        raise SkillParseError(f"skill '{name}' lists unknown department(s) {unknown_depts}")

    instructions = body.strip()
    if strict and not instructions:
        raise SkillParseError(f"skill '{name}' has an empty instructions body")

    return SkillManifest(
        name=name,
        domain=domain,
        description=description[:500],
        version=version,
        keywords=keywords,
        dependencies=dependencies,
        required_permissions=permissions,
        allowed_departments=departments,
        instructions=instructions[:_MAX_INSTRUCTIONS_CHARS],
        source_path=source_path,
        origin=origin,
    )


@functools.lru_cache(maxsize=4096)
def _keyword_pattern(keyword: str) -> Pattern[str]:
    """Match keywords at a word start. Short keywords (<=3 chars, e.g. `ui`, `ci`, `api`)
    must be whole words (optionally plural) so `ui` no longer matches inside `build`;
    longer keywords are prefix matches (`monetiz` matches `monetization`)."""
    escaped = re.escape(keyword)
    if len(keyword) <= 3:
        return re.compile(rf"(?<![a-z0-9]){escaped}s?(?![a-z0-9])")
    return re.compile(rf"(?<![a-z0-9]){escaped}")


def _keyword_hits(keywords: Sequence[str], text: str) -> int:
    return sum(1 for kw in keywords if kw and _keyword_pattern(kw).search(text))


class SkillRegistry:
    """Central registry for discovering, validating, and resolving skills."""

    def __init__(
        self,
        *,
        load_builtins: bool = True,
        skills_dir: Optional[Path] = None,
        catalog_dir: Optional[Path] = None,
    ) -> None:
        """`load_builtins` loads Forge's canonical catalogue from `catalog_dir`
        (default `backend/skills/`), falling back to `FALLBACK_SKILLS` if it yields
        nothing. `skills_dir` additionally discovers repo-level (non-strict) skills."""
        self._skills: Dict[str, SkillManifest] = {}
        self._telemetry: Dict[str, Dict[str, Any]] = {}
        if load_builtins:
            self.load_catalog(catalog_dir if catalog_dir is not None else DEFAULT_CATALOG_DIR)
        if skills_dir is not None:
            self.discover_from_directory(skills_dir)

    def load_catalog(self, catalog_dir: Path) -> List[SkillManifest]:
        """Load the strict on-disk catalogue; fall back to FALLBACK_SKILLS if it is empty."""
        loaded = self.discover_from_directory(catalog_dir, strict=True, origin="builtin")
        if not loaded:
            logger.warning(
                "Skill catalogue at %s missing or empty; using %d fallback skills",
                catalog_dir,
                len(FALLBACK_SKILLS),
            )
            for manifest in FALLBACK_SKILLS:
                if manifest.name not in self._skills:
                    self.register(manifest)
        return loaded

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

    def register(self, manifest: SkillManifest, *, replace: bool = True) -> None:
        """Register a skill. With `replace=False`, an existing name raises SkillDuplicateError.

        Programmatic callers (e.g. the marketplace) may intentionally override; file
        discovery always registers with `replace=False`.
        """
        if not replace and manifest.name in self._skills:
            existing = self._skills[manifest.name]
            raise SkillDuplicateError(
                f"Duplicate skill name '{manifest.name}' "
                f"(already registered from {existing.source_path or existing.origin})"
            )
        self._skills[manifest.name] = manifest

    def get(self, name: str) -> Optional[SkillManifest]:
        return self._skills.get(name)

    def all_skills(self) -> List[SkillManifest]:
        return sorted(self._skills.values(), key=lambda s: (s.domain.value, s.name))

    def discover_from_directory(
        self,
        base_dir: Path,
        *,
        strict: bool = False,
        origin: str = "filesystem",
    ) -> List[SkillManifest]:
        """Discover `<base_dir>/<skill>/SKILL.md` manifests strictly confined within `base_dir`.

        Unreadable, malformed, or duplicate skills are skipped with a logged warning.
        In strict mode the frontmatter `name` must equal the directory name.
        """
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
            rel_path = str(skill_file.relative_to(root))
            try:
                content = skill_file.read_text(encoding="utf-8", errors="replace")
                manifest = parse_skill_markdown(
                    content,
                    fallback_name=entry.name,
                    source_path=rel_path,
                    strict=strict,
                    origin=origin,
                )
                if strict and manifest.name != entry.name:
                    raise SkillParseError(
                        f"skill name '{manifest.name}' does not match its directory '{entry.name}'"
                    )
                self.register(manifest, replace=False)
            except OSError:
                logger.warning("Failed to read SKILL.md at %s", skill_file, exc_info=True)
                continue
            except SkillError as exc:
                logger.warning("Skipping invalid skill %s: %s", rel_path, exc)
                continue
            discovered.append(manifest)
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
        for skill in self.all_skills():
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
        stack: List[str] = []
        visited: Set[str] = set()

        def _visit(name: str) -> None:
            if name in visited:
                return
            if name in stack:
                cycle = stack[stack.index(name):] + [name]
                raise SkillDependencyError(
                    f"Cyclic skill dependency detected at '{name}': {' -> '.join(cycle)}"
                )
            manifest = self._skills.get(name)
            if manifest is None:
                via = f" (required by '{stack[-1]}')" if stack else ""
                raise SkillDependencyError(f"Unknown skill dependency '{name}'{via}")
            stack.append(name)
            for dep in manifest.dependencies:
                _visit(dep)
            stack.pop()
            visited.add(name)
            ordered.append(manifest)

        for name in skill_names:
            _visit(name)
        return ordered

    def validate(self) -> List[str]:
        """Return human-readable problems (missing deps, cycles) across all registered skills."""
        problems: List[str] = []
        for skill in self.all_skills():
            try:
                self.resolve_dependencies([skill.name])
            except SkillDependencyError as exc:
                problems.append(f"{skill.name}: {exc}")
        return problems

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
            hits = _keyword_hits(skill.keywords, query_blob)
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
        registry = SkillRegistry(load_builtins=True, skills_dir=agents_skills_dir)
        for problem in registry.validate():
            logger.warning("Skill catalogue problem: %s", problem)
        _default_registry = registry
    return _default_registry


def get_skill_router() -> SkillRouter:
    return SkillRouter(get_skill_registry())
