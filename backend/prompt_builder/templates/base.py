from __future__ import annotations

from dataclasses import dataclass
from typing import List

from prompt_builder.models import PromptContext

# Section order mirrors the spec: Identity, Responsibilities, Goals,
# Constraints, Required Inputs, Output Format, Quality Rules. Sections with
# no content for a given context are omitted entirely, which is how "only
# relevant context" is enforced rather than left to convention.


@dataclass
class PromptTemplate:
    role: str
    version: str
    identity: str
    responsibilities: List[str]
    goals: List[str]
    constraints: List[str]
    required_inputs: List[str]
    output_format: str
    quality_rules: List[str]

    def render(self, context: PromptContext) -> str:
        sections: List[str] = [f"# Identity\n{self.identity.strip()}"]

        if self.responsibilities:
            sections.append("# Responsibilities\n" + "\n".join(f"- {r}" for r in self.responsibilities))

        if self.goals:
            sections.append("# Goals\n" + "\n".join(f"- {g}" for g in self.goals))

        if self.constraints:
            sections.append("# Constraints\n" + "\n".join(f"- {c}" for c in self.constraints))

        state_block = _render_project_state(context)
        if state_block:
            sections.append(f"# Project State\n{state_block}")

        if context.relevant_files:
            sections.append("# Relevant Files\n" + "\n".join(f"- {f}" for f in context.relevant_files))

        if context.previous_outputs:
            prev = "\n".join(f"## {role}\n{output}" for role, output in context.previous_outputs.items())
            sections.append(f"# Previous Agent Outputs\n{prev}")

        if context.task:
            sections.append(f"# Current Task\n{context.task.strip()}")

        if context.user_request:
            sections.append(f"# User Request\n{context.user_request.strip()}")

        if self.output_format:
            sections.append(f"# Output Format\n{self.output_format.strip()}")

        if self.quality_rules:
            sections.append("# Quality Rules\n" + "\n".join(f"- {q}" for q in self.quality_rules))

        return "\n\n".join(sections)


def _render_project_state(context: PromptContext) -> str:
    state = context.project_state
    lines: List[str] = []
    if state.project_name:
        lines.append(f"- Project: {state.project_name}")
    if state.tech_stack:
        lines.append(f"- Tech stack: {', '.join(state.tech_stack)}")
    if state.architecture_summary:
        lines.append(f"- Architecture: {state.architecture_summary}")
    if state.current_milestone:
        lines.append(f"- Current milestone: {state.current_milestone}")
    if state.completed_tasks:
        lines.append(f"- Completed: {', '.join(state.completed_tasks)}")
    if state.pending_tasks:
        lines.append(f"- Pending: {', '.join(state.pending_tasks)}")
    if state.dependencies:
        lines.append(f"- Dependencies: {', '.join(state.dependencies)}")
    if state.coding_standards:
        lines.append(f"- Coding standards: {state.coding_standards}")
    return "\n".join(lines)
