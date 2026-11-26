"""Automated tests for Phase 3: Intelligent Skill Engine.

Verifies:
- Real `.agents/skills/*/SKILL.md` filesystem discovery & frontmatter parsing
- Transitive dependency resolution & cycle detection
- Least-privilege department & permission enforcement
- Task routing + AgentKernel automatic skill activation
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
    SkillDependencyError,
    SkillDomain,
    SkillManifest,
    SkillRegistry,
    SkillRouter,
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


if __name__ == "__main__":
    unittest.main()
