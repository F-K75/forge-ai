"""Enterprise Governance Policy Engine & Governed Agent/Skill Marketplace.

Provides:
1. Per-project/tenant Governance Policies (`TenantGovernancePolicy`) enforced by
   `AgentKernel` (budget ceiling, mandatory pre-delivery approval, external MCP
   control, local LLM toggle, and blocked high-risk skill permissions).
2. Curated & publishable `SKILL.md`-compatible Marketplace Packages
   (`SkillMarketplaceRegistry`) with policy-gated one-click installation into
   Forge AI's live `SkillRegistry`.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, FrozenSet, List, Optional, Sequence, Tuple

from core.skill_engine import SkillDomain, SkillManifest, get_skill_registry

logger = logging.getLogger(__name__)
AsyncPersistFn = Callable[[str, Dict[str, Any]], Awaitable[None]]


def _schedule_persist(fn: Optional[AsyncPersistFn], kind: str, payload: Dict[str, Any]) -> None:
    if fn is None:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return

    async def _run() -> None:
        try:
            await fn(kind, payload)
        except Exception:
            logger.debug("Enterprise OS persistence skipped for %s", kind, exc_info=True)

    loop.create_task(_run())

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")
_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
_FORBIDDEN_BY_DEFAULT: FrozenSet[str] = frozenset(
    {"exec_arbitrary_shell", "exfiltrate_network", "bypass_auth", "raw_host_fs"}
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class TenantGovernancePolicy:
    project_id: str
    max_run_budget_usd: float = 5.0
    require_approval_for_delivery: bool = False
    allow_external_mcp_servers: bool = True
    allow_local_llm_routing: bool = True
    allowed_mcp_domains: List[str] = field(default_factory=list)
    blocked_skill_permissions: List[str] = field(
        default_factory=lambda: sorted(_FORBIDDEN_BY_DEFAULT)
    )
    updated_by: str = "system"
    updated_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class MarketplaceSkillPackage:
    package_id: str
    name: str
    title: str
    domain: str
    version: str
    author: str
    description: str
    keywords: List[str]
    required_permissions: List[str]
    allowed_departments: List[str]
    instructions: str
    verified: bool = True
    installs: int = 0
    rating: float = 4.9
    published_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


BUILTIN_MARKETPLACE_PACKAGES: Tuple[MarketplaceSkillPackage, ...] = (
    MarketplaceSkillPackage(
        package_id="pkg_otel_observability",
        name="otel-distributed-tracing",
        title="OpenTelemetry Distributed Tracing & SLOs",
        domain=SkillDomain.DEVOPS.value,
        version="1.2.0",
        author="Forge Platform Team",
        description="Instruments FastAPI, async workers, and multi-agent pipelines with W3C Trace Context spans and latency SLO alerts.",
        keywords=["opentelemetry", "otel", "tracing", "span", "slo", "observability", "metrics"],
        required_permissions=["read_repo"],
        allowed_departments=["infrastructure", "engineering", "architecture"],
        instructions="Propagate W3C traceparent headers, avoid logging PII or secrets in span attributes, and track p95 latency per stage.",
        verified=True,
        installs=412,
        rating=4.9,
    ),
    MarketplaceSkillPackage(
        package_id="pkg_soc2_compliance",
        name="soc2-audit-controls",
        title="SOC 2 Type II Security & Audit Controls",
        domain=SkillDomain.SECURITY.value,
        version="1.1.0",
        author="Forge Security Guild",
        description="Verifies immutable audit trails, least-privilege RBAC, tenant isolation boundaries, and secrets rotation readiness.",
        keywords=["soc2", "compliance", "audit", "rbac", "tenant", "governance", "security"],
        required_permissions=["read_repo", "emit_findings"],
        allowed_departments=["security", "leadership", "architecture"],
        instructions="Confirm every protected endpoint checks authentication and tenant ownership, and verify audit logs record actor, action, and timestamp.",
        verified=True,
        installs=328,
        rating=4.9,
    ),
    MarketplaceSkillPackage(
        package_id="pkg_playwright_visual",
        name="playwright-visual-regression",
        title="Playwright E2E & Accessibility Regression Pack",
        domain=SkillDomain.QUALITY_ENGINEERING.value,
        version="1.0.4",
        author="Forge QA Engineering",
        description="Authors deterministic Playwright journeys with WCAG AA contrast checks, keyboard navigation assertions, and zero-flake waits.",
        keywords=["playwright", "e2e", "accessibility", "wcag", "regression", "qa", "browser"],
        required_permissions=["read_repo", "run_tests"],
        allowed_departments=["quality", "engineering", "design"],
        instructions="Assert interactive roles via getByRole/getByLabel, avoid fixed sleeps, and verify keyboard accessibility on modals and tabs.",
        verified=True,
        installs=275,
        rating=4.8,
    ),
    MarketplaceSkillPackage(
        package_id="pkg_finops_llm_cost",
        name="llm-finops-optimization",
        title="LLM FinOps & Hybrid Local/Cloud Routing",
        domain=SkillDomain.AI_ENGINEERING.value,
        version="1.3.0",
        author="Forge Applied AI Lab",
        description="Optimizes multi-agent token budgets using tiered model routing, semantic caching, and Ollama/vLLM local offload.",
        keywords=["finops", "cost", "budget", "ollama", "vllm", "routing", "tokens", "llm"],
        required_permissions=["read_repo", "read_blackboard"],
        allowed_departments=["engineering", "architecture", "leadership", "business"],
        instructions="Route balanced and fast agent steps to local inference when enabled, escalate complex security/repair rounds to reasoning models, and enforce hard per-run cost caps.",
        verified=True,
        installs=519,
        rating=5.0,
    ),
)


class GovernancePolicyStore:
    """In-memory project/tenant governance policy engine with strict validation."""

    def __init__(self) -> None:
        self._policies: Dict[str, TenantGovernancePolicy] = {}
        self._persister: Optional[AsyncPersistFn] = None

    def attach_persister(self, persister: AsyncPersistFn) -> None:
        self._persister = persister

    def hydrate_policy(self, doc: Dict[str, Any]) -> Optional[TenantGovernancePolicy]:
        project_id = str(doc.get("project_id") or "").strip()
        if not project_id:
            return None
        merged_blocked = sorted(
            set(_FORBIDDEN_BY_DEFAULT)
            | {str(p).strip().lower() for p in (doc.get("blocked_skill_permissions") or []) if p}
        )
        policy = TenantGovernancePolicy(
            project_id=project_id,
            max_run_budget_usd=float(doc.get("max_run_budget_usd", 5.0)),
            require_approval_for_delivery=bool(doc.get("require_approval_for_delivery", False)),
            allow_external_mcp_servers=bool(doc.get("allow_external_mcp_servers", True)),
            allow_local_llm_routing=bool(doc.get("allow_local_llm_routing", True)),
            allowed_mcp_domains=list(doc.get("allowed_mcp_domains") or []),
            blocked_skill_permissions=merged_blocked,
            updated_by=str(doc.get("updated_by") or "system"),
            updated_at=str(doc.get("updated_at") or _utc_now()),
        )
        self._policies[project_id] = policy
        return policy

    def get_policy(self, project_id: str) -> TenantGovernancePolicy:
        existing = self._policies.get(project_id)
        if existing is None:
            existing = TenantGovernancePolicy(project_id=project_id)
            self._policies[project_id] = existing
        return existing

    def update_policy(
        self,
        project_id: str,
        *,
        max_run_budget_usd: Optional[float] = None,
        require_approval_for_delivery: Optional[bool] = None,
        allow_external_mcp_servers: Optional[bool] = None,
        allow_local_llm_routing: Optional[bool] = None,
        allowed_mcp_domains: Optional[Sequence[str]] = None,
        blocked_skill_permissions: Optional[Sequence[str]] = None,
        updated_by: str = "operator",
    ) -> TenantGovernancePolicy:
        policy = self.get_policy(project_id)
        if max_run_budget_usd is not None:
            val = float(max_run_budget_usd)
            if val < 0.05 or val > 100.0:
                raise ValueError("max_run_budget_usd must be between $0.05 and $100.00")
            policy.max_run_budget_usd = round(val, 2)
        if require_approval_for_delivery is not None:
            policy.require_approval_for_delivery = bool(require_approval_for_delivery)
        if allow_external_mcp_servers is not None:
            policy.allow_external_mcp_servers = bool(allow_external_mcp_servers)
        if allow_local_llm_routing is not None:
            policy.allow_local_llm_routing = bool(allow_local_llm_routing)
        if allowed_mcp_domains is not None:
            policy.allowed_mcp_domains = [
                d.strip().lower() for d in allowed_mcp_domains if d and d.strip()
            ][:20]
        if blocked_skill_permissions is not None:
            merged = set(_FORBIDDEN_BY_DEFAULT) | {
                p.strip().lower() for p in blocked_skill_permissions if p and p.strip()
            }
            policy.blocked_skill_permissions = sorted(merged)
        policy.updated_by = updated_by
        policy.updated_at = _utc_now()
        _schedule_persist(self._persister, "policy", policy.to_dict())
        return policy

    def evaluate_run_config(
        self, project_id: str, config: Any
    ) -> Tuple[bool, List[str]]:
        """Apply tenant governance constraints onto a KernelExecutionConfig before run launch."""
        policy = self.get_policy(project_id)
        enforcements: List[str] = []
        if getattr(config, "max_budget_usd", 0.0) > policy.max_run_budget_usd:
            config.max_budget_usd = policy.max_run_budget_usd
            enforcements.append(
                f"Clamped run budget cap to tenant policy ceiling (${policy.max_run_budget_usd:.2f})"
            )
        if policy.require_approval_for_delivery and not getattr(
            config, "require_delivery_approval", False
        ):
            config.require_delivery_approval = True
            enforcements.append("Enforced mandatory Pre-Delivery Approval Gate per tenant policy")
        if not policy.allow_local_llm_routing and getattr(config, "prefer_local_llm", False):
            config.prefer_local_llm = False
            enforcements.append("Disabled local LLM routing per tenant policy")
        return True, enforcements


class SkillMarketplaceRegistry:
    """Curated & publishable Agent/Skill Marketplace with policy-gated installation."""

    def __init__(self, policy_store: Optional[GovernancePolicyStore] = None) -> None:
        self._policy_store = policy_store or get_governance_policy_store()
        self._packages: Dict[str, MarketplaceSkillPackage] = {
            pkg.package_id: MarketplaceSkillPackage(**asdict(pkg))
            for pkg in BUILTIN_MARKETPLACE_PACKAGES
        }
        self._installed_by_project: Dict[str, set[str]] = {}
        self._persister: Optional[AsyncPersistFn] = None

    def attach_persister(self, persister: AsyncPersistFn) -> None:
        self._persister = persister

    def hydrate_package(self, doc: Dict[str, Any]) -> Optional[MarketplaceSkillPackage]:
        pkg_id = str(doc.get("package_id") or "").strip()
        name = str(doc.get("name") or "").strip()
        if not pkg_id or not name:
            return None
        try:
            domain = SkillDomain(str(doc.get("domain") or "engineering")).value
        except ValueError:
            return None
        pkg = MarketplaceSkillPackage(
            package_id=pkg_id,
            name=name,
            title=str(doc.get("title") or name)[:120],
            domain=domain,
            version=str(doc.get("version") or "1.0.0"),
            author=str(doc.get("author") or "workspace-author")[:80],
            description=str(doc.get("description") or "")[:400],
            keywords=list(doc.get("keywords") or []),
            required_permissions=list(doc.get("required_permissions") or ["read_repo"]),
            allowed_departments=list(doc.get("allowed_departments") or []),
            instructions=str(doc.get("instructions") or "")[:2000],
            verified=bool(doc.get("verified", False)),
            installs=int(doc.get("installs", 0)),
            rating=float(doc.get("rating", 5.0)),
            published_at=str(doc.get("published_at") or _utc_now()),
        )
        self._packages[pkg_id] = pkg
        return pkg

    def hydrate_installation(self, project_id: str, package_id: str) -> None:
        if not project_id or not package_id:
            return
        self._installed_by_project.setdefault(project_id, set()).add(package_id)
        pkg = self._packages.get(package_id)
        if pkg is not None:
            manifest = SkillManifest(
                name=pkg.name,
                domain=SkillDomain(pkg.domain),
                description=pkg.description,
                version=pkg.version,
                keywords=list(pkg.keywords),
                dependencies=[],
                required_permissions=list(pkg.required_permissions),
                allowed_departments=list(pkg.allowed_departments),
                instructions=pkg.instructions,
                origin="marketplace",
            )
            get_skill_registry().register(manifest)

    def list_packages(
        self,
        *,
        project_id: Optional[str] = None,
        domain: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        installed = self._installed_by_project.get(project_id or "", set())
        q = (search or "").strip().lower()
        results: List[Dict[str, Any]] = []
        for pkg in self._packages.values():
            if domain and pkg.domain != domain:
                continue
            if q and q not in f"{pkg.name} {pkg.title} {pkg.description} {' '.join(pkg.keywords)}".lower():
                continue
            item = pkg.to_dict()
            item["installed"] = pkg.package_id in installed
            results.append(item)
        results.sort(key=lambda r: (-int(r.get("installs", 0)), r["name"]))
        return results

    def publish_package(
        self,
        *,
        name: str,
        title: str,
        domain: str,
        version: str,
        author: str,
        description: str,
        keywords: Sequence[str],
        required_permissions: Sequence[str],
        allowed_departments: Sequence[str],
        instructions: str,
    ) -> MarketplaceSkillPackage:
        clean_name = (name or "").strip().lower()
        if not _SLUG_RE.match(clean_name):
            raise ValueError("Skill package name must be lowercase alphanumeric/hyphen (3-64 chars)")
        if not _SEMVER_RE.match((version or "").strip()):
            raise ValueError("Skill package version must follow semver (e.g. 1.0.0)")
        try:
            valid_domain = SkillDomain(domain).value
        except ValueError as exc:
            raise ValueError(f"Unsupported skill domain '{domain}'") from exc
        perms = [p.strip().lower() for p in required_permissions if p and p.strip()]
        forbidden = set(perms) & _FORBIDDEN_BY_DEFAULT
        if forbidden:
            raise ValueError(
                f"Package requests forbidden permissions: {', '.join(sorted(forbidden))}"
            )
        pkg_id = f"pkg_{clean_name.replace('-', '_')}"
        pkg = MarketplaceSkillPackage(
            package_id=pkg_id,
            name=clean_name,
            title=title.strip()[:120],
            domain=valid_domain,
            version=version.strip(),
            author=author.strip()[:80] or "workspace-author",
            description=description.strip()[:400],
            keywords=[k.strip().lower() for k in keywords if k and k.strip()][:12],
            required_permissions=perms or ["read_repo"],
            allowed_departments=[d.strip().lower() for d in allowed_departments if d and d.strip()],
            instructions=instructions.strip()[:2000],
            verified=False,
            installs=0,
            rating=5.0,
        )
        self._packages[pkg_id] = pkg
        _schedule_persist(self._persister, "package", pkg.to_dict())
        return pkg

    def install_package(
        self,
        *,
        project_id: str,
        package_id: str,
    ) -> Dict[str, Any]:
        pkg = self._packages.get(package_id)
        if pkg is None:
            raise ValueError(f"Marketplace package '{package_id}' not found")
        policy = self._policy_store.get_policy(project_id)
        blocked = set(policy.blocked_skill_permissions) & set(pkg.required_permissions)
        if blocked:
            raise PermissionError(
                f"Blocked by tenant governance policy: forbidden permission(s) {', '.join(sorted(blocked))}"
            )

        manifest = SkillManifest(
            name=pkg.name,
            domain=SkillDomain(pkg.domain),
            description=pkg.description,
            version=pkg.version,
            keywords=list(pkg.keywords),
            dependencies=[],
            required_permissions=list(pkg.required_permissions),
            allowed_departments=list(pkg.allowed_departments),
            instructions=pkg.instructions,
            origin="marketplace",
        )
        get_skill_registry().register(manifest)

        installed_set = self._installed_by_project.setdefault(project_id, set())
        if package_id not in installed_set:
            installed_set.add(package_id)
            pkg.installs += 1
        _schedule_persist(
            self._persister,
            "installation",
            {"project_id": project_id, "package_id": package_id, "installed_at": _utc_now()},
        )

        return {
            "installed": True,
            "project_id": project_id,
            "package": pkg.to_dict(),
        }


_policy_store_singleton: Optional[GovernancePolicyStore] = None
_marketplace_singleton: Optional[SkillMarketplaceRegistry] = None


def get_governance_policy_store() -> GovernancePolicyStore:
    global _policy_store_singleton
    if _policy_store_singleton is None:
        _policy_store_singleton = GovernancePolicyStore()
    return _policy_store_singleton


def get_skill_marketplace() -> SkillMarketplaceRegistry:
    global _marketplace_singleton
    if _marketplace_singleton is None:
        _marketplace_singleton = SkillMarketplaceRegistry(get_governance_policy_store())
    return _marketplace_singleton
