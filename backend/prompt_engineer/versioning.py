"""Prompt version management: track, diff, rollback, and compare prompt
template versions over time.

Supports the full lifecycle of prompt evolution — every change to a template
is recorded with a reason, author, and optional metrics snapshot so teams can
trace which version introduced a regression and roll back safely.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from prompt_builder.templates.base import PromptTemplate
from prompt_engineer.models import (
    PromptChangeType,
    PromptHistory,
    PromptVersion,
)


class VersionManager:
    """Manages prompt template version histories.

    Usage::

        vm = VersionManager()
        vm.record(template, PromptChangeType.IDENTITY_CHANGED, "Clarified role")
        vm.record(template, PromptChangeType.CONSTRAINT_ADDED, "Added max_tokens=8000")
        history = vm.get_history("developer", "v1")
        vm.rollback("developer", "v1", 0)  # back to original
    """

    def __init__(self) -> None:
        self._histories: Dict[str, PromptHistory] = {}

    def _key(self, role: str, version: str) -> str:
        return f"{role}::{version}"

    def get_history(self, role: str, version: str) -> Optional[PromptHistory]:
        return self._histories.get(self._key(role, version))

    def record(
        self,
        template: PromptTemplate,
        change_type: PromptChangeType,
        change_reason: str = "",
        author: str = "system",
        metrics_snapshot: Optional[Dict[str, float]] = None,
        tags: Optional[List[str]] = None,
    ) -> PromptVersion:
        """Record a new version entry for a template change."""
        key = self._key(template.role, template.version)

        history = self._histories.get(key)
        parent = history.current.version if history and history.current else None

        pv = PromptVersion(
            role=template.role,
            version=template.version,
            template_json=self._serialize_template(template),
            change_type=change_type,
            change_reason=change_reason,
            author=author,
            created_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            parent_version=parent,
            metrics_snapshot=metrics_snapshot or {},
            tags=tags or [],
        )

        if history is None:
            history = PromptHistory(role=template.role, version=template.version)
            self._histories[key] = history

        history.add_version(pv)
        return pv

    def rollback(self, role: str, version: str, target_index: int) -> Optional[PromptTemplate]:
        """Roll back to a previous version and return the restored template.

        Returns None if the target index is out of range.
        """
        history = self._histories.get(self._key(role, version))
        if history is None:
            return None
        rolled = history.rollback(target_index)
        if rolled is None:
            return None
        return self._deserialize_template(rolled.template_json, role, version)

    def diff(self, role: str, version: str, index_a: int, index_b: int) -> List[str]:
        """Return a human-readable list of differences between two versions."""
        history = self._histories.get(self._key(role, version))
        if history is None:
            return ["No history found."]
        if index_a < 0 or index_a >= len(history.versions) or index_b < 0 or index_b >= len(history.versions):
            return ["One or both indices out of range."]

        v_a = json.loads(history.versions[index_a].template_json)
        v_b = json.loads(history.versions[index_b].template_json)

        diffs: List[str] = []
        all_keys = set(v_a.keys()) | set(v_b.keys())
        for key in sorted(all_keys):
            val_a = v_a.get(key)
            val_b = v_b.get(key)
            if val_a != val_b:
                diffs.append(f"  [{key}]: changed\n    - {json.dumps(val_a, indent=2)}\n    + {json.dumps(val_b, indent=2)}")
        return diffs

    def list_versions(self, role: str, version: str) -> List[PromptVersion]:
        """List all recorded versions for a (role, version) key, newest first."""
        history = self._histories.get(self._key(role, version))
        if history is None:
            return []
        return list(reversed(history.versions))

    def _serialize_template(self, template: PromptTemplate) -> str:
        return json.dumps(asdict(template), default=str)

    def _deserialize_template(self, json_str: str, role: str, version: str) -> PromptTemplate:
        data = json.loads(json_str)
        return PromptTemplate(
            role=data.get("role", role),
            version=data.get("version", version),
            identity=data.get("identity", ""),
            responsibilities=data.get("responsibilities", []),
            goals=data.get("goals", []),
            constraints=data.get("constraints", []),
            required_inputs=data.get("required_inputs", []),
            output_format=data.get("output_format", ""),
            quality_rules=data.get("quality_rules", []),
        )