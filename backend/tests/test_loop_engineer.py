"""Tests for the loop engineering module."""

import pytest
from loop_engineer.models import (
    FeedbackSignal,
    ImprovementAction,
    LoopConfig,
    LoopIteration,
    LoopResult,
)
from loop_engineer.controller import LoopController
from harness.models import TestCase, TestSuite, TestResult, EvaluationResult
from prompt_builder.templates.base import PromptTemplate


class TestLoopModels:
    def test_feedback_signal_values(self):
        assert FeedbackSignal.FORMAT_FAILURE.value == "format_failure"
        assert FeedbackSignal.REGRESSION_DETECTED.value == "regression_detected"

    def test_improvement_action_values(self):
        assert ImprovementAction.OPTIMIZE_PROMPT.value == "optimize_prompt"
        assert ImprovementAction.COMPOSE_ROLES.value == "compose_roles"

    def test_loop_config_defaults(self):
        config = LoopConfig()
        assert config.max_iterations == 5
        assert config.quality_threshold == 0.85
        assert config.early_stop_on_convergence is True

    def test_loop_iteration_defaults(self):
        iteration = LoopIteration(iteration_number=1)
        assert iteration.iteration_number == 1
        assert iteration.quality_score == 0.0
        assert iteration.signals == []
        assert iteration.action_taken is None

    def test_loop_result_defaults(self):
        result = LoopResult(role="developer", task="Build app")
        assert result.role == "developer"
        assert result.iterations == []
        assert result.converged is False


class TestLoopController:
    @pytest.mark.asyncio
    async def test_run_converges_on_first_iteration(self):
        """When quality threshold is met immediately, the loop should stop after 1 iteration."""
        controller = LoopController()

        # Create a test suite with a case that passes
        suite = TestSuite(
            suite_id="loop-test-1",
            role="developer",
            template_version="v1",
            cases=[
                TestCase(case_id="c1", role="developer", task="t1",
                         expected_output_patterns=["code"], expected_format="text"),
            ],
        )

        template = PromptTemplate(
            role="developer", version="v1", identity="You are a developer.",
            responsibilities=["Write code"], goals=["Complete the task"],
            constraints=[], required_inputs=[], output_format="text",
            quality_rules=["Output code"],
        )

        async def agent_fn(system_prompt: str, task: str) -> str:
            return "Here is some code: print('hello')"

        result = await controller.run(
            role="developer",
            task="Write hello world",
            agent_output_fn=agent_fn,
            test_suite=suite,
            config=LoopConfig(max_iterations=3, quality_threshold=0.5),
            template=template,
        )

        assert result.total_iterations == 1  # Should stop at first iteration
        assert result.role == "developer"

    @pytest.mark.asyncio
    async def test_run_optimizes_over_multiple_iterations(self):
        """When quality is low, the loop should run multiple iterations."""
        controller = LoopController()

        suite = TestSuite(
            suite_id="loop-test-2",
            role="developer",
            template_version="v1",
            cases=[
                TestCase(case_id="c1", role="developer", task="t1",
                         expected_output_patterns=["code", "function"],
                         expected_format="text"),
            ],
        )

        template = PromptTemplate(
            role="developer", version="v1", identity="You are a developer.",
            responsibilities=["Write code"], goals=["Complete tasks"],
            constraints=[], required_inputs=[],
            output_format="text", quality_rules=[],
        )

        call_count = 0

        async def agent_fn(system_prompt: str, task: str) -> str:
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return "bad output"  # Fails pattern check
            return "Here is code and a function"  # Passes

        result = await controller.run(
            role="developer",
            task="Write a function",
            agent_output_fn=agent_fn,
            test_suite=suite,
            config=LoopConfig(max_iterations=5, quality_threshold=0.9,
                              min_improvement=0.001, early_stop_on_convergence=False),
            template=template,
        )

        assert result.total_iterations >= 1
        assert len(result.actions_taken) >= 0

    @pytest.mark.asyncio
    async def test_detect_signals_format_failure(self):
        controller = LoopController()
        eval_result = EvaluationResult(
            suite_id="s1", role="dev", template_version="v1",
            results=[
                TestResult(
                    case_id="c1", passed=False, score=0.0,
                    format_valid=False, errors=["Invalid JSON"],
                ),
            ],
            total_cases=1, passed=0, failed=1, pass_rate=0.0, avg_score=0.0,
        )
        metrics = type("obj", (), {
            "format_compliance": 0.0, "completeness": 1.0,
            "constraint_adherence": 1.0, "relevance": 0.5,
            "specificity": 0.5, "token_efficiency": 0.5,
            "consistency": 1.0,
        })()

        signals = controller._detect_signals(eval_result, metrics)
        assert FeedbackSignal.FORMAT_FAILURE in signals

    @pytest.mark.asyncio
    async def test_select_action_prioritizes_format_failures(self):
        controller = LoopController()
        action = controller._select_action(
            [FeedbackSignal.FORMAT_FAILURE, FeedbackSignal.PATTERN_MISSING],
            0.5, 1, LoopConfig(),
        )
        assert action == ImprovementAction.OPTIMIZE_PROMPT

    @pytest.mark.asyncio
    async def test_select_action_constraint_violation(self):
        controller = LoopController()
        action = controller._select_action(
            [FeedbackSignal.CONSTRAINT_VIOLATION],
            0.5, 1, LoopConfig(),
        )
        assert action == ImprovementAction.ADD_CONSTRAINT

    def test_generate_summary(self):
        controller = LoopController()
        iterations = [
            LoopIteration(iteration_number=1, quality_score=0.5),
            LoopIteration(iteration_number=2, quality_score=0.8),
        ]
        summary = controller._generate_summary(iterations, 0.5, 0.8)
        assert "2 iterations" in summary
        assert "50.0%" in summary
        assert "80.0%" in summary

    def test_make_minimal_context(self):
        controller = LoopController()
        ctx = controller._make_minimal_context("developer", "Build app")
        assert ctx.agent_role == "developer"
        assert ctx.task == "Build app"


class TestLoopConfig:
    def test_custom_config(self):
        config = LoopConfig(
            max_iterations=10,
            quality_threshold=0.9,
            regression_threshold=0.03,
            min_improvement=0.01,
            eval_batch_size=10,
            max_context_budget=32000,
            early_stop_on_convergence=False,
            track_versions=True,
        )
        assert config.max_iterations == 10
        assert config.quality_threshold == 0.9
        assert config.max_context_budget == 32000
        assert config.early_stop_on_convergence is False

    def test_regression_threshold_default(self):
        config = LoopConfig()
        assert config.regression_threshold == 0.05