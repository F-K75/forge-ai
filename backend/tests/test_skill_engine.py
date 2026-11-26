"""Automated tests for Phase 3: Intelligent Skill Engine.

Verifies:
- Real `.agents/skills/*/SKILL.md` filesystem discovery & frontmatter parsing
- Transitive dependency resolution & cycle detection
- Least-privilege department & permission enforcement
- Task routing + AgentKernel automatic skill activation
- File-based catalogue (backend/skills/<name>/SKILL.md): loading, fallback, domain
  coverage, dependency integrity, and hardened parsing (malformed, duplicate, cycles)
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.agent_kernel import AgentKernel, KernelRun, KernelTask  # noqa: E402
from core.skill_engine import (  # noqa: E402
    DEFAULT_CATALOG_DIR,
    FALLBACK_SKILLS,
    SkillDependencyError,
    SkillDomain,
    SkillDuplicateError,
    SkillManifest,
    SkillParseError,
    SkillRegistry,
    SkillRouter,
    _parse_frontmatter_minimal,
    get_skill_registry,
    parse_skill_markdown,
)


class TestSkillEngine(unittest.IsolatedAsyncioTestCase):
    def test_discovers_real_repo_skills_and_builtin_domains(self) -> None:
        registry = get_skill_registry()
        summary = registry.domain_summary()
        self.assertGreaterEqual(summary["filesystem_skills"], 5)
        self.assertGreaterEqual(summary["total_skills"], 15)
        # Real skill from .agents/skills/design-system/SKILL.md should be discovered
        ds = registry.get("design-system")
        self.assertIsNotNone(ds)
        self.assertEqual(ds.origin, "filesystem")

    def test_parse_skill_markdown_extracts_frontmatter(self) -> None:
        raw = """---
name: custom-k8s-audit
description: Audit Kubernetes network policies and RBAC roles
version: "2.1.0"
dependencies: [container-k8s-delivery]
permissions: [read_repo, run_security_scan]
---
# Custom K8s Audit
Check pod security standards and egress rules.
"""
        manifest = parse_skill_markdown(raw, fallback_name="fallback")
        self.assertEqual(manifest.name, "custom-k8s-audit")
        self.assertEqual(manifest.version, "2.1.0")
        self.assertEqual(manifest.dependencies, ["container-k8s-delivery"])
        self.assertEqual(manifest.required_permissions, ["read_repo", "run_security_scan"])

    def test_dependency_resolution_and_cycle_detection(self) -> None:
        reg = SkillRegistry(load_builtins=False)
        reg.register(SkillManifest("base", SkillDomain.SOFTWARE_ENGINEERING, "Base"))
        reg.register(
            SkillManifest("mid", SkillDomain.SOFTWARE_ENGINEERING, "Mid", dependencies=["base"])
        )
        reg.register(
            SkillManifest("top", SkillDomain.SOFTWARE_ENGINEERING, "Top", dependencies=["mid"])
        )
        ordered = reg.resolve_dependencies(["top"])
        self.assertEqual([m.name for m in ordered], ["base", "mid", "top"])

        # Add cycle: base -> top
        reg.register(
            SkillManifest("base", SkillDomain.SOFTWARE_ENGINEERING, "Base", dependencies=["top"])
        )
        with self.assertRaises(SkillDependencyError):
            reg.resolve_dependencies(["top"])

    def test_permission_enforcement_blocks_unauthorized_department(self) -> None:
        reg = SkillRegistry(load_builtins=True)
        sec_skill = reg.get("security-threat-audit")
        self.assertIsNotNone(sec_skill)

        ok_sec, _ = reg.validate_permissions(sec_skill, department="security")
        self.assertTrue(ok_sec)

        ok_biz, reason = reg.validate_permissions(sec_skill, department="business")
        self.assertFalse(ok_biz)
        self.assertIn("not permitted", reason or "")

    def test_router_selects_and_resolves_skill_dependencies(self) -> None:
        router = SkillRouter(get_skill_registry())
        activations = router.route_for_task(
            role="backend_engineer",
            department="engineering",
            objective="Build FastAPI backend API endpoint with validation",
            top_k=3,
        )
        names = [a.skill_name for a in activations]
        self.assertIn("api-hardening", names)
        hardening = [a for a in activations if a.skill_name == "api-hardening"][0]
        self.assertIn("fullstack-architecture", hardening.resolved_dependencies)

    def test_discover_from_directory_confines_symlinks_outside_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "skills"
            outside = Path(tmp) / "outside.md"
            outside.write_text("---\nname: escaped\n---\nsecret", encoding="utf-8")
            bad_dir = root / "bad-skill"
            bad_dir.mkdir(parents=True)
            (bad_dir / "SKILL.md").symlink_to(outside)

            reg = SkillRegistry(load_builtins=False)
            found = reg.discover_from_directory(root)
            self.assertEqual(found, [])

    async def test_kernel_automatically_activates_skills_per_task(self) -> None:
        captured_skills = []

        async def executor(task: KernelTask, ctx, _dctx):
            captured_skills.append((task.role, ctx.get("skill_context") or []))
            return {"summary": f"Executed {task.role} with routed skills"}

        run = KernelRun(
            id="krun_skills",
            project_id="proj_1",
            objective="Build FastAPI backend API and run security audit",
            tasks=[
                KernelTask("t_be", "API", "backend_engineer", "engineering", "Build FastAPI route"),
                KernelTask("t_sec", "Audit", "security_engineer", "security", "Audit auth", depends_on=["t_be"]),
            ],
        )
        res = await AgentKernel(task_executor=executor).execute_run(run)
        self.assertTrue(len(res.skill_activations) >= 2)
        self.assertTrue(any(s["skill_name"] == "security-threat-audit" for s in res.skill_activations))
        self.assertTrue(len(captured_skills[0][1]) >= 1)


def _write_skill(root: Path, dirname: str, content: str) -> None:
    d = root / dirname
    d.mkdir(parents=True, exist_ok=True)
    (d / "SKILL.md").write_text(content, encoding="utf-8")


def _skill_doc(name: str, *, domain: str = "devops", deps: str = "[]", extra: str = "") -> str:
    return (
        f"---\nname: {name}\nversion: 1.0.0\ndomain: {domain}\n"
        f"description: Test skill {name}\nkeywords: [{name}]\n"
        f"dependencies: {deps}\npermissions: [read_repo]\ndepartments: [infrastructure]\n{extra}"
        f"---\nDo the {name} thing.\n"
    )


class TestFileBasedCatalog(unittest.TestCase):
    """The canonical catalogue is loaded from backend/skills/<name>/SKILL.md."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.registry = SkillRegistry(load_builtins=True)
        cls.catalog = [s for s in cls.registry.all_skills() if s.origin == "builtin"]

    def test_catalog_loads_every_skill_directory(self) -> None:
        dirs = sorted(p.parent.name for p in DEFAULT_CATALOG_DIR.glob("*/SKILL.md"))
        self.assertEqual(DEFAULT_CATALOG_DIR, BACKEND_DIR / "skills")
        self.assertGreaterEqual(len(dirs), 36)
        self.assertEqual(sorted(s.name for s in self.catalog), dirs)
        for skill in self.catalog:
            self.assertEqual(skill.source_path, f"{skill.name}/SKILL.md")

    def test_catalog_is_not_excluded_from_docker_image(self) -> None:
        # backend/ is the Docker build context and the Dockerfile does `COPY . .`.
        import fnmatch

        dockerfile = (BACKEND_DIR / "Dockerfile").read_text(encoding="utf-8")
        self.assertRegex(dockerfile, r"(?m)^COPY \. \.")
        ignore = BACKEND_DIR / ".dockerignore"
        patterns = []
        if ignore.exists():
            patterns = [
                ln.strip().rstrip("/")
                for ln in ignore.read_text(encoding="utf-8").splitlines()
                if ln.strip() and not ln.startswith("#") and not ln.startswith("!")
            ]
        sample = "skills/api-hardening/SKILL.md"
        parts = sample.split("/")
        prefixes = ["/".join(parts[: i + 1]) for i in range(len(parts))]
        for pat in patterns:
            for candidate in prefixes + parts:
                self.assertFalse(fnmatch.fnmatch(candidate, pat), f".dockerignore '{pat}' excludes {sample}")

    def test_every_domain_has_at_least_four_skills(self) -> None:
        for domain in SkillDomain:
            with self.subTest(domain=domain.value):
                count = sum(1 for s in self.catalog if s.domain == domain)
                self.assertGreaterEqual(count, 4)

    def test_every_dependency_exists_and_graph_is_acyclic(self) -> None:
        for skill in self.catalog:
            for dep in skill.dependencies:
                with self.subTest(skill=skill.name, dep=dep):
                    self.assertIsNotNone(self.registry.get(dep))
        self.assertEqual(self.registry.validate(), [])
        self.assertEqual(get_skill_registry().validate(), [])

    def test_every_skill_is_activatable_by_an_allowed_department(self) -> None:
        for skill in self.catalog:
            with self.subTest(skill=skill.name):
                self.assertTrue(skill.allowed_departments)
                chain = self.registry.resolve_dependencies([skill.name])
                usable = [
                    dept
                    for dept in skill.allowed_departments
                    if all(self.registry.validate_permissions(m, department=dept)[0] for m in chain)
                ]
                self.assertTrue(usable, f"no allowed department can run {skill.name}'s chain")

    def test_catalog_entries_are_substantive(self) -> None:
        for skill in self.catalog:
            with self.subTest(skill=skill.name):
                self.assertGreaterEqual(len(skill.keywords), 5)
                self.assertGreater(len(skill.description), 30)
                lines = skill.instructions.splitlines()
                self.assertTrue(15 <= len(lines) <= 40, f"{len(lines)} instruction lines")
                # First line is a plain summary so routing excerpts read well.
                self.assertFalse(lines[0].startswith("#"))

    def test_fallback_skills_mirror_catalog_files(self) -> None:
        for fb in FALLBACK_SKILLS:
            with self.subTest(skill=fb.name):
                disk = self.registry.get(fb.name)
                self.assertIsNotNone(disk)
                for attr in ("domain", "description", "version", "keywords", "dependencies",
                             "required_permissions", "allowed_departments"):
                    self.assertEqual(getattr(disk, attr), getattr(fb, attr), attr)
                self.assertTrue(disk.instructions.startswith(fb.instructions))

    def test_missing_catalog_falls_back_to_minimal_builtins(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertLogs("core.skill_engine", level="WARNING"):
                reg = SkillRegistry(load_builtins=True, catalog_dir=Path(tmp) / "missing")
        self.assertEqual(
            sorted(s.name for s in reg.all_skills()), sorted(s.name for s in FALLBACK_SKILLS)
        )
        self.assertEqual(reg.validate(), [])

    def test_routing_picks_sensible_skill_for_sample_tasks(self) -> None:
        router = SkillRouter(SkillRegistry(load_builtins=True))
        cases = [
            ("devops_engineer", "infrastructure", "Add a Terraform module for the staging VPC", "infrastructure-as-code"),
            ("qa_engineer", "quality", "Triage flaky tests that fail intermittently in CI", "flaky-test-triage"),
            ("ml_engineer", "engineering", "Build RAG retrieval over docs with embeddings and citations", "rag-context-engineering"),
            ("product_manager", "business", "Write a PRD with pricing tiers and KPIs", "prd-product-strategy"),
            ("security_engineer", "security", "Rotate the leaked API key and move secrets into Vault", "secrets-management"),
            ("data_engineer", "engineering", "Build an ETL pipeline to backfill events into the warehouse", "etl-pipeline-design"),
            ("security_engineer", "security", "Defend the agent against prompt injection from untrusted tool output", "prompt-injection-defense"),
            ("designer", "design", "Design dashboard charts with KPI tiles and a legend", "dashboard-data-visualization"),
            ("sre", "infrastructure", "Write a runbook and postmortem for the outage", "incident-response-runbooks"),
            ("backend_engineer", "engineering", "Fix slow query on the projects collection", "query-performance-tuning"),
            ("backend_engineer", "engineering", "Add retries with exponential backoff and timeouts", "error-handling-resilience"),
            ("qa_engineer", "quality", "Load test the API with k6 to find p95 latency", "load-performance-testing"),
        ]
        for role, dept, objective, expected in cases:
            with self.subTest(objective=objective):
                acts = router.route_for_task(role=role, department=dept, objective=objective, top_k=3)
                self.assertTrue(acts)
                self.assertEqual(acts[0].skill_name, expected, [a.skill_name for a in acts])

    def test_routing_resolves_catalog_dependency_chain(self) -> None:
        router = SkillRouter(SkillRegistry(load_builtins=True))
        acts = router.route_for_task(
            role="agent_engineer",
            department="engineering",
            objective="Agent is stuck in an infinite loop; add a repair loop with critique and escalation",
            top_k=1,
        )
        self.assertEqual(acts[0].skill_name, "agent-failure-recovery")
        self.assertEqual(
            acts[0].resolved_dependencies,
            ["multi-agent-orchestration", "fullstack-architecture", "api-hardening", "error-handling-resilience"],
        )

    def test_short_keywords_match_whole_words_only(self) -> None:
        reg = SkillRegistry(load_builtins=False)
        reg.register(SkillManifest("ui-only", SkillDomain.DESIGN_TOOLS, "UI", keywords=["ui"]))
        router = SkillRouter(reg)
        self.assertEqual(router.route_for_task(role="x", department="ops", objective="build the guild"), [])
        self.assertEqual(
            [a.skill_name for a in router.route_for_task(role="x", department="ops", objective="polish the UI")],
            ["ui-only"],
        )


class TestCatalogParsingHardening(unittest.TestCase):
    def test_malformed_skill_files_are_skipped_with_warning(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_skill(root, "good-skill", _skill_doc("good-skill"))
            _write_skill(root, "unterminated", "---\nname: unterminated\ndomain: devops\nno closing fence\n")
            _write_skill(root, "bad-yaml", "---\nname: bad-yaml\nkeywords: [a, b\n---\nbody\n")
            _write_skill(root, "not-a-mapping", "---\n- just\n- a list\n---\nbody\n")
            _write_skill(root, "unknown-domain", _skill_doc("unknown-domain", domain="astrology"))
            _write_skill(root, "no-frontmatter", "# Just markdown\nNo metadata here.\n")
            _write_skill(root, "bad-list", _skill_doc("bad-list").replace("keywords: [bad-list]", "keywords: {a: 1}"))
            _write_skill(root, "self-dep", _skill_doc("self-dep", deps="[self-dep]"))
            _write_skill(root, "Bad_Name", _skill_doc("Bad_Name"))
            _write_skill(root, "empty-body", _skill_doc("empty-body").replace("Do the empty-body thing.\n", ""))
            _write_skill(root, "bad-dept", _skill_doc("bad-dept").replace("[infrastructure]", "[marketing]"))

            reg = SkillRegistry(load_builtins=False)
            with self.assertLogs("core.skill_engine", level="WARNING") as logs:
                found = reg.discover_from_directory(root, strict=True)
        self.assertEqual([m.name for m in found], ["good-skill"])
        self.assertEqual(len(logs.records), 10)
        self.assertTrue(any("astrology" in r.getMessage() for r in logs.records))

    def test_unknown_domain_rejected_even_in_lenient_mode(self) -> None:
        with self.assertRaises(SkillParseError):
            parse_skill_markdown(_skill_doc("x-skill", domain="quantum"), fallback_name="x-skill")
        # Omitted domain is still inferred for lenient (.agents) skills.
        m = parse_skill_markdown("---\nname: k8s-thing\ndescription: deploy to k8s\n---\nbody", fallback_name="f")
        self.assertEqual(m.domain, SkillDomain.DEVOPS)

    def test_duplicate_names_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_skill(root, "a-first", _skill_doc("dup-skill"))
            _write_skill(root, "b-second", _skill_doc("dup-skill").replace("Do the", "Overridden"))
            reg = SkillRegistry(load_builtins=False)
            with self.assertLogs("core.skill_engine", level="WARNING") as logs:
                found = reg.discover_from_directory(root)
            self.assertEqual(len(found), 1)
            self.assertIn("Do the", reg.get("dup-skill").instructions)
            self.assertTrue(any("Duplicate" in r.getMessage() for r in logs.records))

            # Strict catalogue mode also requires name == directory name.
            strict_reg = SkillRegistry(load_builtins=False)
            with self.assertLogs("core.skill_engine", level="WARNING"):
                self.assertEqual(strict_reg.discover_from_directory(root, strict=True), [])

        reg = SkillRegistry(load_builtins=False)
        reg.register(SkillManifest("one", SkillDomain.DEVOPS, "One"))
        with self.assertRaises(SkillDuplicateError):
            reg.register(SkillManifest("one", SkillDomain.DEVOPS, "Again"), replace=False)

    def test_repo_skill_cannot_shadow_catalog_skill(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_skill(root, "api-hardening", "---\nname: api-hardening\ndescription: impostor\n---\nbody")
            with self.assertLogs("core.skill_engine", level="WARNING"):
                reg = SkillRegistry(load_builtins=True, skills_dir=root)
        self.assertEqual(reg.get("api-hardening").origin, "builtin")
        self.assertNotEqual(reg.get("api-hardening").description, "impostor")

    def test_dependency_cycles_and_missing_deps_detected_from_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _write_skill(root, "cyc-a", _skill_doc("cyc-a", deps="[cyc-b]"))
            _write_skill(root, "cyc-b", _skill_doc("cyc-b", deps="[cyc-c]"))
            _write_skill(root, "cyc-c", _skill_doc("cyc-c", deps="[cyc-a]"))
            _write_skill(root, "orphan", _skill_doc("orphan", deps="[does-not-exist]"))
            reg = SkillRegistry(load_builtins=False)
            self.assertEqual(len(reg.discover_from_directory(root, strict=True)), 4)

        with self.assertRaises(SkillDependencyError) as ctx:
            reg.resolve_dependencies(["cyc-a"])
        self.assertIn("cyc-a -> cyc-b -> cyc-c -> cyc-a", str(ctx.exception))
        with self.assertRaises(SkillDependencyError):
            reg.resolve_dependencies(["orphan"])
        problems = reg.validate()
        self.assertEqual(len(problems), 4)
        # Router never activates a skill whose chain is broken.
        acts = SkillRouter(reg).route_for_task(
            role="sre", department="infrastructure", objective="cyc-a cyc-b orphan", top_k=8
        )
        self.assertEqual(acts, [])

    def test_block_lists_and_aliases_parse(self) -> None:
        raw = (
            "---\nname: block-list\ndomain: security\ndescription: Block list skill\n"
            "keywords:\n  - Alpha\n  - beta gamma\nrequired_permissions:\n  - read_repo\n  - emit_findings\n"
            "allowed_departments: [security]\n---\nBody line\n"
        )
        m = parse_skill_markdown(raw, fallback_name="x", strict=True)
        self.assertEqual(m.keywords, ["alpha", "beta gamma"])
        self.assertEqual(m.required_permissions, ["read_repo", "emit_findings"])
        self.assertEqual(m.allowed_departments, ["security"])

    def test_minimal_frontmatter_parser_without_pyyaml(self) -> None:
        data = _parse_frontmatter_minimal(
            "name: mini\nkeywords: [a, 'b c']\ndependencies:\n  - dep-one\nmetadata:\n  version: \"3.0.0\"\n"
        )
        self.assertEqual(data["keywords"], ["a", "b c"])
        self.assertEqual(data["dependencies"], ["dep-one"])
        self.assertEqual(data["metadata"], {"version": "3.0.0"})
        with self.assertRaises(SkillParseError):
            _parse_frontmatter_minimal("name: x\nthis line has no colon\n")
        with self.assertRaises(SkillParseError):
            _parse_frontmatter_minimal("keywords: [a, b\n")


if __name__ == "__main__":
    unittest.main()
