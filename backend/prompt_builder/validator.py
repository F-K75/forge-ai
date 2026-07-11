from __future__ import annotations

from prompt_builder.models import PromptContext, ValidationError, ValidationResult
from prompt_builder.templates.base import PromptTemplate

_FIELD_PRESENCE = {
    "task": lambda c: bool(c.task and c.task.strip()),
    "relevant_files": lambda c: bool(c.relevant_files),
    "project_state": lambda c: bool(
        c.project_state.project_name or c.project_state.tech_stack or c.project_state.extra
    ),
    "previous_outputs": lambda c: bool(c.previous_outputs),
    "user_request": lambda c: bool(c.user_request and c.user_request.strip()),
}


def validate(context: PromptContext, template: PromptTemplate) -> ValidationResult:
    errors: list[ValidationError] = []

    if template.role.split("-")[0] != context.agent_role.split("-")[0] and template.role != context.agent_role:
        errors.append(
            ValidationError(
                code="invalid_template",
                message=f"Template role {template.role!r} does not match context agent_role {context.agent_role!r}",
                severity="error",
            )
        )

    for required in template.required_inputs:
        check = _FIELD_PRESENCE.get(required)
        if check is None:
            continue
        if not check(context):
            errors.append(
                ValidationError(
                    code="missing_variable",
                    message=f"Required input {required!r} is missing or empty",
                    severity="error",
                )
            )

    if not template.identity.strip():
        errors.append(ValidationError(code="empty_context", message="Template identity is empty", severity="warning"))

    seen_outputs: dict[str, str] = {}
    for role, output in context.previous_outputs.items():
        if output in seen_outputs.values():
            errors.append(
                ValidationError(
                    code="duplicate_context",
                    message=f"previous_outputs[{role!r}] duplicates another agent's output",
                    severity="warning",
                )
            )
        seen_outputs[role] = output
        if role == context.agent_role:
            errors.append(
                ValidationError(
                    code="circular_reference",
                    message=f"previous_outputs contains an entry for the current agent role {role!r}",
                    severity="error",
                )
            )

    is_valid = not any(e.severity == "error" for e in errors)
    return ValidationResult(is_valid=is_valid, errors=errors)
