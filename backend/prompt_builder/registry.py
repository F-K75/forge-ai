from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from prompt_builder.templates import TEMPLATE_REGISTRY
from prompt_builder.templates.base import PromptTemplate


class TemplateNotFoundError(KeyError):
    pass


class TemplateRegistry:
    """In-memory template store, seeded from the static TEMPLATE_REGISTRY.
    Runtime create/update/delete only affect this instance's overlay, so the
    code-defined defaults are never mutated."""

    def __init__(self) -> None:
        self._templates: Dict[Tuple[str, str], PromptTemplate] = dict(TEMPLATE_REGISTRY)

    def get(self, role: str, version: str = "v1") -> PromptTemplate:
        key = (role, version)
        if key not in self._templates:
            raise TemplateNotFoundError(f"No template registered for role={role!r} version={version!r}")
        return self._templates[key]

    def list(self) -> List[PromptTemplate]:
        return list(self._templates.values())

    def create(self, template: PromptTemplate) -> None:
        key = (template.role, template.version)
        if key in self._templates:
            raise ValueError(f"Template already exists for role={template.role!r} version={template.version!r}")
        self._templates[key] = template

    def update(self, role: str, version: str, template: PromptTemplate) -> None:
        key = (role, version)
        if key not in self._templates:
            raise TemplateNotFoundError(f"No template registered for role={role!r} version={version!r}")
        self._templates[key] = template

    def delete(self, role: str, version: str) -> None:
        key = (role, version)
        if key not in self._templates:
            raise TemplateNotFoundError(f"No template registered for role={role!r} version={version!r}")
        del self._templates[key]


_registry: Optional[TemplateRegistry] = None


def get_template_registry() -> TemplateRegistry:
    global _registry
    if _registry is None:
        _registry = TemplateRegistry()
    return _registry
