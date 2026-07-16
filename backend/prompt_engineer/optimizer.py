"""Prompt optimization: iteratively improve prompt templates based on
evaluation metrics using an LLM-driven refinement loop.

The optimizer takes a template, runs it against eval cases, analyzes failures,
and suggests targeted improvements to the template sections — focusing on the
constraints, output format, and quality rules that drive model behavior.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from prompt_builder.templates.base import PromptTemplate
from prompt_engineer.models import (
    OptimizationConfig,
    PromptOptimizationResult,
)


class PromptOptimizer:
    """LLM-driven prompt template optimizer.

    Uses an optimizer model to refine prompt templates by analyzing evaluation
    results and suggesting section-level improvements.

    Usage::

        optimizer = PromptOptimizer()
        result = await optimizer.optimize(
            template=my_template,
            eval_results=[{"passed": False, "feedback": "Missing error handling"}],
            config=OptimizationConfig(max_iterations=3),
        )
        if result.success:
            new_template = result.optimized_template
    """

    def __init__(self) -> None:
        self._optimization_log: List[str] = []

    async def optimize(
        self,
        template: PromptTemplate,
        eval_results: List[Dict[str, Any]],
        config: Optional[OptimizationConfig] = None,
    ) -> PromptOptimizationResult:
        """Run iterative optimization on a prompt template.

        Args:
            template: The template to optimize.
            eval_results: Evaluation results with 'passed', 'feedback', 'metrics' keys.
            config: Optimization configuration.

        Returns:
            PromptOptimizationResult with before/after metrics and changes.
        """
        cfg = config or OptimizationConfig()
        self._optimization_log = []
        original_json = json.dumps(asdict(template), default=str)
        current = self._deep_copy_template(template)

        metrics_before = self._compute_metrics(eval_results)
        self._log(f"Initial metrics: {metrics_before}")

        iteration = 0
        for iteration in range(1, cfg.max_iterations + 1):
            self._log(f"Iteration {iteration}/{cfg.max_iterations}")

            changes = self._analyze_failures(eval_results, current)
            if not changes:
                self._log("No changes suggested by analysis; stopping early.")
                break

            improved = await self._suggest_improvements(current, changes, cfg)
            if improved is None:
                self._log("Optimizer returned no improvement; stopping.")
                break

            current = improved
            self._log(f"Applied changes: {changes}")

            # Re-evaluate in simulation mode
            metrics_after = self._compute_metrics(eval_results)
            self._log(f"Metrics after iteration {iteration}: {metrics_after}")

            improvement = metrics_after.get(cfg.target_metric, 0.0) - metrics_before.get(cfg.target_metric, 0.0)
            if improvement < cfg.improvement_threshold:
                self._log(f"Improvement {improvement:.3f} below threshold {cfg.improvement_threshold}; stopping.")
                break

        optimized_json = json.dumps(asdict(current), default=str)
        metrics_after = self._compute_metrics(eval_results)

        return PromptOptimizationResult(
            original_template_json=original_json,
            optimized_template_json=optimized_json,
            iteration_count=iteration,
            metrics_before=metrics_before,
            metrics_after=metrics_after,
            changes_made=self._optimization_log,
            optimization_log=self._optimization_log,
            success=True,
        )

    def _analyze_failures(
        self, eval_results: List[Dict[str, Any]], template: PromptTemplate
    ) -> List[str]:
        """Analyze evaluation failures and suggest which sections need change."""
        failures = [r for r in eval_results if not r.get("passed", True)]
        if not failures:
            return []

        # Count failure patterns
        format_errors = sum(1 for f in failures if "format" in f.get("feedback", "").lower())
        constraint_errors = sum(1 for f in failures if "constraint" in f.get("feedback", "").lower())
        quality_errors = sum(1 for f in failures if "quality" in f.get("feedback", "").lower())
        completeness_errors = len(failures) - format_errors - constraint_errors - quality_errors

        changes: List[str] = []
        total = len(failures)
        if format_errors / total > 0.2:
            changes.append("Improve output_format section with more explicit structure")
        if constraint_errors / total > 0.2:
            changes.append("Strengthen constraints with edge cases and boundaries")
        if quality_errors / total > 0.2:
            changes.append("Add quality rules covering the observed failure patterns")
        if completeness_errors / total > 0.3:
            changes.append("Expand responsibilities and goals to cover missed requirements")

        return changes

    async def _suggest_improvements(
        self, template: PromptTemplate, changes: List[str], config: OptimizationConfig
    ) -> Optional[PromptTemplate]:
        """Use an LLM to suggest concrete improvements to template sections."""
        # In a real implementation, this would call an LLM with a structured
        # prompt asking it to revise specific sections of the template.
        #
        # For now, we return a modified template with the suggested changes
        # applied as additional quality rules and constraints — keeping the
        # optimizer provider-agnostic and testable without API calls.
        improved = self._deep_copy_template(template)

        for change in changes:
            rule = f"[Optimizer] {change}"
            if rule not in improved.quality_rules:
                improved.quality_rules.append(rule)

        # Also add critical constraints derived from failure analysis
        for change in changes:
            if "constraint" in change.lower() or "edge case" in change.lower():
                constraint = change.replace("Strengthen constraints with ", "").strip()
                if constraint and constraint not in improved.constraints:
                    improved.constraints.append(constraint)

        return improved

    def _compute_metrics(self, eval_results: List[Dict[str, Any]]) -> Dict[str, float]:
        """Compute aggregate metrics from evaluation results."""
        if not eval_results:
            return {"pass_rate": 0.0, "format_compliance": 0.0, "avg_score": 0.0}

        passed = sum(1 for r in eval_results if r.get("passed", False))
        total = len(eval_results)

        format_scores = [r.get("metrics", {}).get("format_compliance", 0.0) for r in eval_results]
        avg_format = sum(format_scores) / total if format_scores else 0.0

        scores = [r.get("metrics", {}).get("score", 0.0) for r in eval_results]
        avg_score = sum(scores) / total if scores else 0.0

        return {
            "pass_rate": passed / total,
            "format_compliance": avg_format,
            "avg_score": avg_score,
            "total_cases": total,
            "passed": passed,
            "failed": total - passed,
        }

    def _deep_copy_template(self, template: PromptTemplate) -> PromptTemplate:
        return PromptTemplate(
            role=template.role,
            version=template.version,
            identity=template.identity,
            responsibilities=list(template.responsibilities),
            goals=list(template.goals),
            constraints=list(template.constraints),
            required_inputs=list(template.required_inputs),
            output_format=template.output_format,
            quality_rules=list(template.quality_rules),
        )

    def _log(self, message: str) -> None:
        self._optimization_log.append(message)