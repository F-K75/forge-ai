"""Tests for the prompt engineering module."""

import pytest
from prompt_builder.templates.base import PromptTemplate
from prompt_engineer.models import (
    FewShotExample,
    FewShotSet,
    OptimizationConfig,
    PromptChangeType,
    PromptVersion,
)
from prompt_engineer.versioning import VersionManager
from prompt_engineer.few_shot import FewShotManager


class TestVersionManager:
    def test_record_and_get_history(self):
        vm = VersionManager()
        template = PromptTemplate(
            role="test_role", version="v1", identity="Test",
            responsibilities=[], goals=[], constraints=[],
            required_inputs=[], output_format="json", quality_rules=[],
        )
        pv = vm.record(template, PromptChangeType.IDENTITY_CHANGED, "Initial")
        assert pv.role == "test_role"
        assert pv.change_type == PromptChangeType.IDENTITY_CHANGED

        history = vm.get_history("test_role", "v1")
        assert history is not None
        assert len(history.versions) == 1

    def test_rollback(self):
        vm = VersionManager()
        t1 = PromptTemplate(
            role="r", version="v1", identity="v1",
            responsibilities=[], goals=[], constraints=[],
            required_inputs=[], output_format="", quality_rules=[],
        )
        vm.record(t1, PromptChangeType.IDENTITY_CHANGED, "v1")
        t2 = PromptTemplate(
            role="r", version="v1", identity="v2",
            responsibilities=[], goals=[], constraints=[],
            required_inputs=[], output_format="", quality_rules=[],
        )
        vm.record(t2, PromptChangeType.IDENTITY_CHANGED, "v2")

        rolled = vm.rollback("r", "v1", 0)
        assert rolled is not None
        assert rolled.identity == "v1"

    def test_list_versions(self):
        vm = VersionManager()
        t = PromptTemplate(
            role="r", version="v1", identity="x",
            responsibilities=[], goals=[], constraints=[],
            required_inputs=[], output_format="", quality_rules=[],
        )
        vm.record(t, PromptChangeType.IDENTITY_CHANGED, "first")
        vm.record(t, PromptChangeType.CONSTRAINT_ADDED, "second")

        versions = vm.list_versions("r", "v1")
        assert len(versions) == 2


class TestFewShotManager:
    def test_add_and_get_examples(self):
        fsm = FewShotManager()
        ex = FewShotExample(
            example_id="ex1", role="developer",
            input="Build a todo app",
            expected_output='{"files": {}}',
        )
        fsm.add_example(ex)
        examples = fsm.get_examples("developer")
        assert len(examples) == 1
        assert examples[0].example_id == "ex1"

    def test_select_fixed_strategy(self):
        fsm = FewShotManager()
        for i in range(5):
            fsm.add_example(FewShotExample(
                example_id=f"ex{i}", role="dev",
                input=f"Task {i}", expected_output=f"Output {i}",
            ))
        selected = fsm.select("dev", strategy="fixed", max_examples=3)
        assert len(selected) == 3

    def test_format_examples(self):
        fsm = FewShotManager()
        fsm.add_example(FewShotExample(
            example_id="ex1", role="dev",
            input="Test input", expected_output="Test output",
        ))
        formatted = fsm.format_examples(fsm.get_examples("dev"))
        assert "Test input" in formatted
        assert "Test output" in formatted

    def test_semantic_select(self):
        fsm = FewShotManager()
        fsm.add_example(FewShotExample(
            example_id="auth1", role="dev",
            input="Build authentication with JWT",
            expected_output="auth code",
            tags=["auth"],
        ))
        fsm.add_example(FewShotExample(
            example_id="ui1", role="dev",
            input="Create a dashboard UI",
            expected_output="ui code",
            tags=["ui"],
        ))
        selected = fsm.select("dev", task="JWT authentication", strategy="semantic")
        assert len(selected) > 0
        assert selected[0].example_id == "auth1"

    def test_diversity_select(self):
        fsm = FewShotManager()
        fsm.add_example(FewShotExample(
            example_id="a1", role="dev",
            input="Auth", expected_output="a", tags=["auth"],
        ))
        fsm.add_example(FewShotExample(
            example_id="u1", role="dev",
            input="UI", expected_output="u", tags=["ui"],
        ))
        selected = fsm.select("dev", strategy="diversity", max_examples=2)
        assert len(selected) == 2


class TestOptimizer:
    @pytest.mark.asyncio
    async def test_optimize_improves_quality_rules(self):
        from prompt_engineer.optimizer import PromptOptimizer
        optimizer = PromptOptimizer()
        template = PromptTemplate(
            role="test", version="v1", identity="Test",
            responsibilities=[], goals=[], constraints=[],
            required_inputs=[], output_format="", quality_rules=[],
        )
        eval_results = [
            {"passed": False, "feedback": "Format error: missing JSON structure"},
            {"passed": False, "feedback": "Constraint violation: missing auth"},
            {"passed": True, "feedback": "Good output"},
            {"passed": False, "feedback": "Quality issue: no error handling"},
        ]
        result = await optimizer.optimize(template, eval_results)
        assert result.success
        assert len(result.optimization_log) > 0


class TestComposer:
    def test_merge_sections(self):
        from prompt_engineer.composer import PromptComposer
        from prompt_engineer.models import CompositionPlan
        from prompt_builder.models import PromptContext

        composer = PromptComposer()
        t1 = PromptTemplate(
            role="a", version="v1", identity="Agent A",
            responsibilities=["Do X"], goals=["Goal A"],
            constraints=[], required_inputs=[],
            output_format="json", quality_rules=["Output JSON"],
        )
        t2 = PromptTemplate(
            role="b", version="v1", identity="Agent B",
            responsibilities=["Do Y"], goals=["Goal B"],
            constraints=[], required_inputs=[],
            output_format="", quality_rules=[],
        )
        plan = CompositionPlan(
            plan_id="merge-test",
            roles=["a", "b"],
            composition_strategy="merge_sections",
        )
        context = PromptContext(agent_role="a", task="test")
        result = composer.compose([t1, t2], plan, context)
        assert "Agent A" in result
        assert "Agent B" in result
        assert "Do X" in result
        assert "Do Y" in result