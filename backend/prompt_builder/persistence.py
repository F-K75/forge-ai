"""MongoDB-backed persistence for the Prompt TemplateRegistry overlay (8.9).

The in-memory ``TemplateRegistry`` (``prompt_builder/registry.py``) is the
source of truth during a process lifetime, but its runtime create/update/delete
overlay is lost on restart and is not shared across workers. This module makes
that overlay durable and fleet-wide:

* ``load_overlay(registry)`` -- hydrate the registry's overlay from the
  ``prompt_templates`` collection at startup (survive restart, sync workers).
* ``upsert_template(template)`` / ``delete_template(role, version)`` -- persist
  each runtime mutation, called by the async API layer after it mutates the
  in-memory registry.

Every operation is best-effort and never raises: if MongoDB is unreachable (e.g.
local dev without Mongo, or a transient hiccup) the in-memory registry still
works and the failure is logged. Code-defined static templates are NOT persisted;
only the overlay (overrides and new templates) is written, keyed uniquely by
``(role, version)``.
"""

import logging

from prompt_builder.registry import TemplateNotFoundError
from prompt_builder.templates.base import PromptTemplate

logger = logging.getLogger(__name__)

_COLLECTION = "prompt_templates"


def _to_doc(template: PromptTemplate) -> dict:
    return {
        "role": template.role,
        "version": template.version,
        "identity": template.identity,
        "responsibilities": template.responsibilities,
        "goals": template.goals,
        "constraints": template.constraints,
        "required_inputs": template.required_inputs,
        "output_format": template.output_format,
        "quality_rules": template.quality_rules,
    }


def _from_doc(doc: dict) -> PromptTemplate:
    return PromptTemplate(
        role=doc["role"],
        version=doc["version"],
        identity=doc.get("identity", ""),
        responsibilities=doc.get("responsibilities") or [],
        goals=doc.get("goals") or [],
        constraints=doc.get("constraints") or [],
        required_inputs=doc.get("required_inputs") or [],
        output_format=doc.get("output_format") or "",
        quality_rules=doc.get("quality_rules") or [],
    )


async def _collection():
    from core.database import get_db

    return (await get_db())[_COLLECTION]


async def upsert_template(template: PromptTemplate) -> bool:
    """Persist a template overlay (create or update). Returns True on success,
    False if persistence is unavailable. Never raises."""
    try:
        coll = await _collection()
        await coll.replace_one(
            {"role": template.role, "version": template.version},
            _to_doc(template),
            upsert=True,
        )
        return True
    except Exception:
        logger.warning(
            "prompt_template persistence failed for %s:%s",
            template.role, template.version, exc_info=True,
        )
        return False


async def delete_template(role: str, version: str) -> bool:
    """Remove a template overlay from persistence. Never raises."""
    try:
        coll = await _collection()
        await coll.delete_one({"role": role, "version": version})
        return True
    except Exception:
        logger.warning("prompt_template delete failed for %s:%s", role, version, exc_info=True)
        return False


async def load_overlay(registry) -> int:
    """Hydrate the in-memory registry's overlay from MongoDB. Returns the
    number of persisted templates applied (0 if none or persistence down).

    A persisted doc whose (role, version) already exists in the static,
    code-defined registry is treated as an overlay override and applied via
    ``update``; otherwise it is a brand-new template and applied via ``create``.
    All failures are swallowed so startup is never blocked by this step.
    """
    try:
        coll = await _collection()
        cursor = coll.find({}, {"_id": 0})
        docs = await cursor.to_list(length=None)
    except Exception:
        logger.warning("prompt_template overlay load failed; starting with static registry", exc_info=True)
        return 0

    applied = 0
    for doc in docs:
        try:
            template = _from_doc(doc)
            try:
                registry.update(template.role, template.version, template)
            except TemplateNotFoundError:
                registry.create(template)
            applied += 1
        except Exception:
            logger.warning("skipping malformed persisted template: %r", doc.get("role"), exc_info=True)
    if applied:
        logger.info("Loaded %d prompt template overlay record(s) from MongoDB", applied)
    return applied
