"""Prompt composition: combine multiple prompt templates or sources into a
single coherent prompt.

Supports sequential composition (run templates one after another, linked by
previous outputs), section merging (combine sections from multiple templates),
and router composition (select the best template based on task analysis).
"""

from __future__ import annotations

from typing import Any, Dict, List

from prompt_builder.models import PromptContext
from prompt_builder.templates.base import PromptTemplate
from prompt_engineer.models import CompositionPlan


class PromptComposer:
    """Compose multiple prompt templates into unified prompts.

    Usage::

        composer = PromptComposer()
        plan = CompositionPlan(
            plan_id="full-build",
            roles=["architect", "developer", "qa"],
            composition_strategy="sequential",
        )
        result = composer.compose([architect_tmpl, dev_tmpl, qa_tmpl], plan, context)
    """

    def __init__(self) -> None:
        self._registry: Dict[str, PromptTemplate] = {}

    def compose(
        self,
        templates: List[PromptTemplate],
        plan: CompositionPlan,
        context: PromptContext,
    ) -> str:
        """Compose multiple templates according to the composition plan.

        Args:
            templates: The templates to compose, in the order they should be applied.
            plan: The composition plan defining strategy and constraints.
            context: The prompt context to use for rendering.

        Returns:
            A single composed prompt string.

        Raises:
            ValueError: If the composition strategy is unknown or templates don't match.
        """
        if not templates:
            return ""

        if plan.section_filter:
            templates = [self._filter_sections(t, plan.section_filter) for t in templates]

        if plan.composition_strategy == "sequential":
            return self._sequential(templates, plan, context)

        if plan.composition_strategy == "merge_sections":
            return self._merge_sections(templates, plan, context)

        if plan.composition_strategy == "router":
            return self._router(templates, plan, context)

        raise ValueError(f"Unknown composition strategy: {plan.composition_strategy!r}")

    def _sequential(
        self, templates: List[PromptTemplate], plan: CompositionPlan, context: PromptContext
    ) -> str:
        """Run templates sequentially — each template's output becomes context
        for the next via previous_outputs."""
        parts: List[str] = []
        current_context = context

        for i, template in enumerate(templates):
            # Render with current context
            rendered = template.render(current_context)
            parts.append(rendered)

            # Update context: set the output of this stage as previous_output
            # for the next stage in the chain
            if i < len(templates) - 1:
                next_role = templates[i + 1].role
                current_context = current_context.model_copy(
                    update={
                        "previous_outputs": {
                            **current_context.previous_outputs,
                            template.role: f"[Stage {i + 1} output for {template.role}]",
                        },
                        "agent_role": next_role,
                    }
                )

        return plan.separator.join(parts)

    def _merge_sections(
        self, templates: List[PromptTemplate], plan: CompositionPlan, context: PromptContext
    ) -> str:
        """Merge templates by combining their corresponding sections.

        Identity sections are concatenated, responsibilities and goals are
        unioned, constraints are unioned with dedup, and quality rules are
        unioned. The first template's output_format takes precedence.
        """
        if not templates:
            return ""

        base = templates[0]
        merged = PromptTemplate(
            role="composed",
            version=plan.plan_id,
            identity=templates[0].identity,
            responsibilities=list(base.responsibilities),
            goals=list(base.goals),
            constraints=list(base.constraints),
            required_inputs=list(base.required_inputs),
            output_format=base.output_format,
            quality_rules=list(base.quality_rules),
        )

        for t in templates[1:]:
            merged.identity += f"\n---\n{t.identity}"
            merged.responsibilities.extend(r for r in t.responsibilities if r not in merged.responsibilities)
            merged.goals.extend(g for g in t.goals if g not in merged.goals)
            merged.constraints.extend(c for c in t.constraints if c not in merged.constraints)
            merged.quality_rules.extend(q for q in t.quality_rules if q not in merged.quality_rules)
            merged.required_inputs.extend(r for r in t.required_inputs if r not in merged.required_inputs)

        return merged.render(context)

    def _router(
        self, templates: List[PromptTemplate], plan: CompositionPlan, context: PromptContext
    ) -> str:
        """Select the best template based on task analysis and render only that one.

        Analyzes the task for keywords matching each template's role identity,
        then renders the best-matching template.
        """
        if not templates:
            return ""

        task_lower = context.task.lower()
        scored = []

        for t in templates:
            score = 0.0
            # Score based on keyword overlap with identity and responsibilities
            identity_text = (t.identity + " " + " ".join(t.responsibilities)).lower()
            identity_tokens = set(identity_text.split())
            task_tokens = set(task_lower.split())
            overlap = len(identity_tokens & task_tokens)
            score = overlap / max(len(task_tokens), 1)

            # Boost for exact role match
            if t.role.lower() in task_lower:
                score += 0.5

            scored.append((score, t))

        scored.sort(key=lambda x: -x[0])
        best = scored[0][1]
        return best.render(context)

    def _filter_sections(
        self, template: PromptTemplate, allowed_sections: List[str]
    ) -> PromptTemplate:
        """Strip sections from a template to only include those in the allow list."""
        section_map: Dict[str, Any] = {
            "identity": template.identity,
            "responsibilities": template.responsibilities,
            "goals": template.goals,
            "constraints": template.constraints,
            "required_inputs": template.required_inputs,
            "output_format": template.output_format,
            "quality_rules": template.quality_rules,
        }

        filtered: Dict[str, Any] = {}
        for section in allowed_sections:
            if section in section_map:
                filtered[section] = section_map[section]

        return PromptTemplate(
            role=template.role,
            version=template.version,
            identity=filtered.get("identity", ""),
            responsibilities=filtered.get("responsibilities", []),
            goals=filtered.get("goals", []),
            constraints=filtered.get("constraints", []),
            required_inputs=filtered.get("required_inputs", []),
            output_format=filtered.get("output_format", ""),
            quality_rules=filtered.get("quality_rules", []),
        )