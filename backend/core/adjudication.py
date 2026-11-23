"""Human adjudication store (docs/architecture/agent-collaboration-plan.md
§17.3; Revision 2 amended §10.3 and §12.3, PV-1…PV-6).

Collections
-----------

``adjudication_excerpts``: the minimum material for one finding, created
only by ``enqueue_finding_for_adjudication`` and only through the redactor
(``core.redaction``). One document per ``finding_id``::

    id, finding_id, build_id, project_id, owner_user_id,
    finding {finding_id, build_id, file, line, rule_or_category, message},
    file, line, excerpt_start_line, excerpt_end_line,
    redacted_excerpt        # the finding's line ±20 lines, redacted
    blueprint_fragment      # the relevant part of the build's blueprint, redacted
    redaction_report        # rule counts per field, never values
    consent_basis           # internal | opt_in
    status                  # pending | labelled
    created_at, expires_at  # TTL: 90 days after creation (U12)

``adjudication_access_log``: append-only. Exactly one row per adjudication
API request (list, view, expand, label), whatever its outcome (PV-5)::

    id, adjudicator_id, action, build_id, artifact_id, finding_id, item_id,
    fields, purpose, outcome, at        # TTL: 1 year (as audit_logs)

``finding_adjudications``: the labels. Kept after the excerpts expire, but
anonymized (``anonymize_expired_labels``; GDPR deletion does it at once)::

    id, finding_id, build_id, owner_user_id, rule_or_category, verdict,
    corrected_category, notes (redacted), adjudicator_id, consent_basis,
    created_at, updated_at, anonymized, anonymized_at

Findings
--------

Findings have no unified schema yet (B2). Until they do, a finding is the
minimal dict::

    {"finding_id": str,          # required, unique per finding
     "build_id": str,            # required
     "file": str | None,         # artifact path the finding points at
     "line": int | None,         # 1-based line in that file
     "rule_or_category": str,    # required, e.g. "secret-aws-access-key-id"
     "message": str | None}      # free text; redacted before storage

Any other key is ignored and never stored (minimum material).
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from core.models import utcnow
from core.redaction import merge_reports, redact_structure, redact_text

logger = logging.getLogger(__name__)

EXCERPTS = "adjudication_excerpts"
ACCESS_LOG = "adjudication_access_log"
LABELS = "finding_adjudications"

EXCERPT_CONTEXT_LINES = 20
# Lines on each side of the window that are redacted with it, so a
# multi-line secret (a PEM block) crossing the window edge is seen whole.
_REDACTION_MARGIN_LINES = 60
MAX_EXCERPT_LINE_CHARS = 400
MAX_ARTIFACT_CHARS = 200_000
MAX_MESSAGE_CHARS = 2_000
MAX_NOTES_CHARS = 2_000
MAX_BLUEPRINT_FRAGMENT_CHARS = 4_000

EXCERPT_TTL = timedelta(days=90)
ACCESS_LOG_TTL = timedelta(days=365)
# Labels outlive their excerpts but lose every link to the build and owner.
LABEL_ANONYMIZE_AFTER = EXCERPT_TTL

STATUS_PENDING = "pending"
STATUS_LABELLED = "labelled"
VERDICTS = ("true_positive", "false_positive", "uncertain")
EXPAND_TARGETS = ("artifact", "prompt")
MIN_PURPOSE_CHARS = 10
MAX_PURPOSE_CHARS = 500

# Fields returned by the default view: no full artifact (PV-4).
VIEW_FIELDS = (
    "item_id", "finding", "file", "excerpt_start_line", "excerpt_end_line", "redacted_excerpt",
    "blueprint_fragment", "redaction_report", "consent_basis", "status", "created_at", "expires_at",
    "my_label",
)
QUEUE_FIELDS = (
    "item_id", "finding_id", "build_id", "file", "line", "rule_or_category", "status",
    "consent_basis", "created_at", "expires_at",
)


class AdjudicationError(Exception):
    status_code = 400


class FindingError(AdjudicationError, ValueError):
    """The finding does not satisfy the minimal schema."""


class AdjudicationInvalid(AdjudicationError, ValueError):
    status_code = 422


class AdjudicationNotFound(AdjudicationError):
    status_code = 404


class AdjudicationDenied(AdjudicationError):
    """The build is not (or no longer) eligible for human adjudication."""

    status_code = 403


def _coll(db, name: str):
    return getattr(db, name)


# --------------------------------------------------------------------------- #
# Findings, excerpts, blueprint fragments
# --------------------------------------------------------------------------- #


def normalize_finding(finding: Dict[str, Any]) -> Dict[str, Any]:
    """Validate the minimal finding dict and keep only its keys."""
    if not isinstance(finding, dict):
        raise FindingError("finding must be a dict")
    out: Dict[str, Any] = {}
    for key in ("finding_id", "build_id", "rule_or_category"):
        value = finding.get(key)
        if not isinstance(value, str) or not value.strip():
            raise FindingError(f"finding.{key} is required")
        out[key] = value.strip()[:200]
    file = finding.get("file")
    out["file"] = file.strip()[:500] if isinstance(file, str) and file.strip() else None
    line = finding.get("line")
    try:
        out["line"] = int(line) if line is not None and not isinstance(line, bool) else None
    except (TypeError, ValueError):
        out["line"] = None
    if out["line"] is not None and out["line"] < 1:
        out["line"] = None
    message = finding.get("message")
    out["message"] = str(message)[:MAX_MESSAGE_CHARS] if message is not None else None
    return out


def build_redacted_excerpt(
    content: Optional[str], line: Optional[int], *, path: Optional[str] = None,
    context: int = EXCERPT_CONTEXT_LINES,
) -> Tuple[str, int, int, Dict[str, Any]]:
    """The finding's line ±``context`` lines, redacted. Returns ``(text,
    start_line, end_line, report)`` with 1-based inclusive line numbers
    (0, 0 for empty content)."""
    if not content:
        return "", 0, 0, redact_text("").report
    lines = content.split("\n")
    n = len(lines)
    center = min(max(int(line or 1), 1), n)
    start, end = max(1, center - context), min(n, center + context)
    region_start = max(1, start - _REDACTION_MARGIN_LINES)
    region_end = min(n, end + _REDACTION_MARGIN_LINES)
    region = "\n".join(lines[region_start - 1:region_end])
    redacted = redact_text(region, path=path)
    redacted_lines = redacted.text.split("\n")
    offset = start - region_start
    window = redacted_lines[offset:offset + (end - start + 1)]
    window = [ln if len(ln) <= MAX_EXCERPT_LINE_CHARS else ln[:MAX_EXCERPT_LINE_CHARS] + "..." for ln in window]
    # Report only the redactions inside the window, with window-relative lines.
    report = dict(redacted.report)
    lines_by_rule = {}
    counts = {}
    for rule, rule_lines in (redacted.report.get("lines") or {}).items():
        inside = [ln - offset for ln in rule_lines if offset < ln <= offset + len(window)]
        if inside:
            lines_by_rule[rule] = inside
            counts[rule] = len(inside)
    report.update(counts=counts, lines=lines_by_rule, total=sum(counts.values()))
    return "\n".join(window), start, end, report


def extract_blueprint(build_doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The Architect blueprint stored as the architect step's output."""
    for step in (build_doc or {}).get("agents") or []:
        agent = step.get("agent") if isinstance(step, dict) else None
        if getattr(agent, "value", agent) != "architect":
            continue
        output = step.get("output")
        if isinstance(output, dict):
            return output
        if isinstance(output, str) and output.strip():
            try:
                parsed = json.loads(output)
            except ValueError:
                return None
            return parsed if isinstance(parsed, dict) else None
    return None


_GENERIC_PATH_TOKENS = frozenset({
    "src", "app", "apps", "lib", "libs", "utils", "util", "components", "component", "pages", "page",
    "index", "main", "api", "routes", "route", "views", "view", "server", "client", "backend",
    "frontend", "public", "static", "js", "jsx", "ts", "tsx", "py", "css", "html", "json", "md",
    "test", "tests", "spec", "the", "and", "of",
})


def _tokens(text: Any) -> set:
    words = re.findall(r"[a-z0-9]+", re.sub(r"([a-z])([A-Z])", r"\1 \2", str(text or "")).lower())
    out = set()
    for w in words:
        if len(w) < 3 or w in _GENERIC_PATH_TOKENS:
            continue
        out.add(w)
        if w.endswith("s") and len(w) > 3:
            out.add(w[:-1])
    return out


def select_blueprint_fragment(blueprint: Optional[Dict[str, Any]], file_path: Optional[str]) -> Dict[str, Any]:
    """The part of the blueprint relevant to ``file_path``: the pages,
    endpoints and data models whose names or routes share a word with the
    path, plus the global ``auth_required`` and ``integrations``. Never the
    whole blueprint."""
    if not isinstance(blueprint, dict):
        return {}
    path_tokens = _tokens(file_path)
    fragment: Dict[str, Any] = {}
    if "auth_required" in blueprint:
        fragment["auth_required"] = blueprint.get("auth_required")
    if isinstance(blueprint.get("integrations"), list):
        fragment["integrations"] = blueprint["integrations"][:10]

    def related(*values: Any) -> bool:
        return bool(path_tokens) and bool(path_tokens & set().union(*(_tokens(v) for v in values)))

    pages = [
        {k: p.get(k) for k in ("name", "route", "components") if k in p}
        for p in blueprint.get("pages") or [] if isinstance(p, dict) and related(p.get("name"), p.get("route"))
    ]
    endpoints = [
        {k: (str(e.get(k))[:200] if k == "description" else e.get(k))
         for k in ("method", "path", "auth_required", "description") if k in e}
        for e in blueprint.get("api_endpoints") or [] if isinstance(e, dict) and related(e.get("path"))
    ]
    models = [
        {"name": m.get("name"), "fields": [
            {k: f.get(k) for k in ("name", "type", "required") if k in f}
            for f in (m.get("fields") or []) if isinstance(f, dict)
        ][:30]}
        for m in blueprint.get("data_models") or [] if isinstance(m, dict) and related(m.get("name"))
    ]
    for key, items in (("pages", pages), ("api_endpoints", endpoints), ("data_models", models)):
        if items:
            fragment[key] = items[:5]
    # Size cap: drop the largest list entries until it fits.
    while len(json.dumps(fragment, default=str)) > MAX_BLUEPRINT_FRAGMENT_CHARS:
        lists = [k for k in ("data_models", "api_endpoints", "pages", "integrations") if fragment.get(k)]
        if not lists:
            break
        biggest = max(lists, key=lambda k: len(json.dumps(fragment[k], default=str)))
        fragment[biggest] = fragment[biggest][:-1]
        if not fragment[biggest]:
            fragment.pop(biggest)
    return fragment


_BUILD_PROJECTION = {
    "_id": 0, "id": 1, "user_id": 1, "project_id": 1, "created_at": 1, "processing_boundary": 1, "agents": 1,
}


async def _load_file(db, build_id: str, path: Optional[str]) -> Optional[Dict[str, Any]]:
    if not path:
        return None
    return await _coll(db, "build_files").find_one({"build_id": build_id, "path": path}, {"_id": 0})


async def enqueue_finding_for_adjudication(
    db,
    finding: Dict[str, Any],
    *,
    file_content: Optional[str] = None,
    blueprint: Optional[Dict[str, Any]] = None,
    build_doc: Optional[Dict[str, Any]] = None,
    now=None,
) -> Optional[Dict[str, Any]]:
    """Queue one finding for human adjudication. The only way an excerpt is
    created, and only through the redactor (PV-3).

    Returns the stored excerpt, or None when the build is not eligible for
    human adjudication (PV-1: nothing is written). Idempotent per
    ``finding_id``. ``file_content`` / ``blueprint`` default to the stored
    build file and the build's Architect blueprint."""
    from core.quality_review import evaluate_review_eligibility

    f = normalize_finding(finding)
    build = build_doc or await _coll(db, "builds").find_one({"id": f["build_id"]}, _BUILD_PROJECTION)
    if not build or build.get("id") != f["build_id"]:
        logger.info("adjudication enqueue skipped: build not found")
        return None
    eligibility = await evaluate_review_eligibility(db, build)
    decision = eligibility.human_adjudication
    if not decision.allowed:
        logger.info("adjudication enqueue skipped for build %s: %s", f["build_id"], decision.reason)
        return None
    existing = await _coll(db, EXCERPTS).find_one({"finding_id": f["finding_id"]}, {"_id": 0})
    if existing:
        return existing

    content = file_content
    if content is None:
        stored = await _load_file(db, f["build_id"], f["file"])
        content = stored.get("content") if stored else None
    excerpt, start, end, excerpt_report = build_redacted_excerpt(content, f["line"], path=f["file"])
    message = redact_text(f["message"]) if f["message"] else None
    bp = blueprint if blueprint is not None else extract_blueprint(build)
    fragment, fragment_report = redact_structure(select_blueprint_fragment(bp, f["file"]))

    now = now or utcnow()
    finding_doc = dict(f, message=message.text if message else None)
    doc = {
        "id": str(uuid.uuid4()),
        "finding_id": f["finding_id"],
        "build_id": f["build_id"],
        "project_id": build.get("project_id"),
        "owner_user_id": build.get("user_id"),
        "finding": finding_doc,
        "file": f["file"],
        "line": f["line"],
        "excerpt_start_line": start,
        "excerpt_end_line": end,
        "artifact_available": content is not None,
        "redacted_excerpt": excerpt,
        "blueprint_fragment": fragment,
        "redaction_report": merge_reports({
            "redacted_excerpt": excerpt_report,
            "finding.message": message.report if message else redact_text("").report,
            "blueprint_fragment": fragment_report,
        }),
        "consent_basis": decision.basis,
        "status": STATUS_PENDING,
        "created_at": now,
        "expires_at": now + EXCERPT_TTL,
    }
    await _coll(db, EXCERPTS).update_one({"finding_id": f["finding_id"]}, {"$setOnInsert": doc}, upsert=True)
    stored = await _coll(db, EXCERPTS).find_one({"finding_id": f["finding_id"]}, {"_id": 0})
    if stored:
        stored.pop("_id", None)
    return stored or doc


# --------------------------------------------------------------------------- #
# Access log (append-only)
# --------------------------------------------------------------------------- #


async def record_access(
    db,
    *,
    adjudicator_id: str,
    action: str,
    build_id: Optional[str] = None,
    artifact_id: Optional[str] = None,
    finding_id: Optional[str] = None,
    item_id: Optional[str] = None,
    fields: Iterable[str] = (),
    purpose: Optional[str] = None,
    outcome: str = "granted",
    build_ids: Optional[List[str]] = None,
    now=None,
) -> Dict[str, Any]:
    """Append one access-log row. The only writer of the collection; there
    is no update path (GDPR anonymization of an adjudicator aside)."""
    row = {
        "id": str(uuid.uuid4()),
        "adjudicator_id": adjudicator_id,
        "action": action,
        "build_id": build_id,
        "artifact_id": artifact_id,
        "finding_id": finding_id,
        "item_id": item_id,
        "fields": list(fields),
        "purpose": purpose,
        "outcome": outcome,
        "at": now or utcnow(),
    }
    if build_ids is not None:
        row["build_ids"] = list(build_ids)
    await _coll(db, ACCESS_LOG).insert_one(dict(row))
    return row


# --------------------------------------------------------------------------- #
# Adjudicator reads and writes. Every call writes exactly one access-log row,
# whatever the outcome (PV-5), and re-checks eligibility (PV-2: a revoked
# consent or a removed internal flag blocks access at once).
# --------------------------------------------------------------------------- #


async def _eligible_for_human(db, build_id: Optional[str]) -> bool:
    from core.quality_review import evaluate_review_eligibility

    if not build_id:
        return False
    return (await evaluate_review_eligibility(db, build_id)).human_adjudication.allowed


def _queue_item(doc: Dict[str, Any]) -> Dict[str, Any]:
    finding = doc.get("finding") or {}
    return {
        "item_id": doc.get("id"),
        "finding_id": doc.get("finding_id"),
        "build_id": doc.get("build_id"),
        "file": doc.get("file"),
        "line": doc.get("line"),
        "rule_or_category": finding.get("rule_or_category"),
        "status": doc.get("status"),
        "consent_basis": doc.get("consent_basis"),
        "created_at": doc.get("created_at"),
        "expires_at": doc.get("expires_at"),
    }


async def list_queue(
    db, *, adjudicator_id: str, status: str = STATUS_PENDING, limit: int = 50, skip: int = 0, now=None,
) -> Dict[str, Any]:
    """Queue items (metadata only: no excerpt, no message). Items whose
    build is no longer eligible are left out."""
    if status not in (STATUS_PENDING, STATUS_LABELLED):
        await record_access(db, adjudicator_id=adjudicator_id, action="list", outcome="invalid", now=now)
        raise AdjudicationInvalid("status must be pending or labelled")
    limit = max(1, min(int(limit), 100))
    skip = max(0, int(skip))
    now = now or utcnow()
    cursor = _coll(db, EXCERPTS).find({"status": status}, {"_id": 0}).sort("created_at", 1).skip(skip).limit(limit)
    docs = await cursor.to_list(limit)
    eligible: Dict[str, bool] = {}
    items = []
    for doc in docs:
        if doc.get("expires_at") is not None and doc["expires_at"] <= now:
            continue  # past retention; the TTL monitor has not run yet
        build_id = doc.get("build_id")
        if build_id not in eligible:
            eligible[build_id] = await _eligible_for_human(db, build_id)
        if eligible[build_id]:
            items.append(_queue_item(doc))
    await record_access(
        db, adjudicator_id=adjudicator_id, action="list", fields=QUEUE_FIELDS,
        build_ids=sorted({i["build_id"] for i in items if i.get("build_id")}), now=now,
    )
    return {"items": items, "count": len(items), "status": status, "limit": limit, "skip": skip}


async def _load_item(db, *, adjudicator_id: str, item_id: str, action: str, purpose: Optional[str] = None,
                     now=None) -> Dict[str, Any]:
    """The excerpt, if it exists, is within retention and is still
    eligible. Otherwise logs the refused access and raises."""
    doc = await _coll(db, EXCERPTS).find_one({"id": item_id}, {"_id": 0})
    if doc and doc.get("expires_at") is not None and doc["expires_at"] <= (now or utcnow()):
        doc = None
    if not doc:
        await record_access(db, adjudicator_id=adjudicator_id, action=action, item_id=item_id,
                            purpose=purpose, outcome="not_found", now=now)
        raise AdjudicationNotFound("Adjudication item not found")
    if not await _eligible_for_human(db, doc.get("build_id")):
        await record_access(db, adjudicator_id=adjudicator_id, action=action, item_id=item_id,
                            build_id=doc.get("build_id"), finding_id=doc.get("finding_id"),
                            purpose=purpose, outcome="denied", now=now)
        raise AdjudicationDenied("This build is no longer eligible for human adjudication")
    return doc


def _public_label(label: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not label:
        return None
    return {k: label.get(k) for k in ("id", "finding_id", "verdict", "corrected_category", "notes",
                                      "adjudicator_id", "created_at", "updated_at")}


async def view_item(db, *, adjudicator_id: str, item_id: str, now=None) -> Dict[str, Any]:
    """Default view (PV-4): the finding, the redacted excerpt and the
    blueprint fragment. Never the full artifact or prompt."""
    doc = await _load_item(db, adjudicator_id=adjudicator_id, item_id=item_id, action="view", now=now)
    label = await _coll(db, LABELS).find_one(
        {"finding_id": doc.get("finding_id"), "adjudicator_id": adjudicator_id}, {"_id": 0},
    )
    view = {
        "item_id": doc.get("id"),
        "finding": doc.get("finding"),
        "file": doc.get("file"),
        "excerpt_start_line": doc.get("excerpt_start_line"),
        "excerpt_end_line": doc.get("excerpt_end_line"),
        "redacted_excerpt": doc.get("redacted_excerpt"),
        "blueprint_fragment": doc.get("blueprint_fragment") or {},
        "redaction_report": doc.get("redaction_report") or {},
        "consent_basis": doc.get("consent_basis"),
        "status": doc.get("status"),
        "created_at": doc.get("created_at"),
        "expires_at": doc.get("expires_at"),
        "my_label": _public_label(label),
    }
    await record_access(
        db, adjudicator_id=adjudicator_id, action="view", item_id=item_id, build_id=doc.get("build_id"),
        finding_id=doc.get("finding_id"), artifact_id=_artifact_id(doc.get("build_id"), doc.get("file")),
        fields=VIEW_FIELDS, now=now,
    )
    return view


def _artifact_id(build_id: Optional[str], path: Optional[str], file_doc: Optional[Dict[str, Any]] = None) -> Optional[str]:
    if file_doc and file_doc.get("id"):
        return str(file_doc["id"])
    if build_id and path:
        return f"{build_id}:{path}"
    return None


def validate_purpose(purpose: Optional[str]) -> str:
    text = (purpose or "").strip()
    if len(text) < MIN_PURPOSE_CHARS:
        raise AdjudicationInvalid(f"An expand needs a purpose of at least {MIN_PURPOSE_CHARS} characters")
    return text[:MAX_PURPOSE_CHARS]


async def expand_item(
    db, *, adjudicator_id: str, item_id: str, purpose: Optional[str], target: str = "artifact", now=None,
) -> Dict[str, Any]:
    """The logged "expand" action: the full artifact the finding points at
    (or the build prompt), still redacted. Requires a purpose, which is
    recorded with the access."""
    try:
        clean_purpose = validate_purpose(purpose)
        if target not in EXPAND_TARGETS:
            raise AdjudicationInvalid(f"target must be one of {', '.join(EXPAND_TARGETS)}")
    except AdjudicationInvalid:
        await record_access(db, adjudicator_id=adjudicator_id, action="expand", item_id=item_id,
                            purpose=(purpose or "").strip()[:MAX_PURPOSE_CHARS] or None,
                            outcome="invalid", now=now)
        raise
    doc = await _load_item(db, adjudicator_id=adjudicator_id, item_id=item_id, action="expand",
                           purpose=clean_purpose, now=now)
    build_id = doc.get("build_id")
    if target == "artifact":
        file_doc = await _load_file(db, build_id, doc.get("file"))
        raw = file_doc.get("content") if file_doc else None
        artifact_id = _artifact_id(build_id, doc.get("file"), file_doc)
        field_name, path = "artifact.content", doc.get("file")
    else:
        build = await _coll(db, "builds").find_one({"id": build_id}, {"_id": 0, "prompt": 1})
        raw = (build or {}).get("prompt")
        artifact_id = f"{build_id}:prompt" if build_id else None
        field_name, path = "build.prompt", None
    if raw is None:
        await record_access(db, adjudicator_id=adjudicator_id, action="expand", item_id=item_id,
                            build_id=build_id, finding_id=doc.get("finding_id"), artifact_id=artifact_id,
                            purpose=clean_purpose, outcome="not_found", now=now)
        raise AdjudicationNotFound("The artifact is no longer available")
    truncated = len(raw) > MAX_ARTIFACT_CHARS
    redacted = redact_text(raw[:MAX_ARTIFACT_CHARS], path=path)
    await record_access(
        db, adjudicator_id=adjudicator_id, action="expand", item_id=item_id, build_id=build_id,
        finding_id=doc.get("finding_id"), artifact_id=artifact_id, fields=(field_name,),
        purpose=clean_purpose, now=now,
    )
    return {
        "item_id": item_id,
        "target": target,
        "artifact_id": artifact_id,
        "path": path,
        "content": redacted.text,
        "truncated": truncated,
        "redaction_report": redacted.report,
    }


async def submit_label(
    db,
    *,
    adjudicator_id: str,
    item_id: str,
    verdict: str,
    corrected_category: Optional[str] = None,
    notes: Optional[str] = None,
    now=None,
) -> Dict[str, Any]:
    """Record (or replace) this adjudicator's label for the item's finding.
    Notes go through the redactor."""
    if verdict not in VERDICTS:
        await record_access(db, adjudicator_id=adjudicator_id, action="label", item_id=item_id,
                            outcome="invalid", now=now)
        raise AdjudicationInvalid(f"verdict must be one of {', '.join(VERDICTS)}")
    doc = await _load_item(db, adjudicator_id=adjudicator_id, item_id=item_id, action="label", now=now)
    now = now or utcnow()
    clean_notes = redact_text(notes[:MAX_NOTES_CHARS]).text if notes else None
    category = corrected_category.strip()[:200] if isinstance(corrected_category, str) and corrected_category.strip() else None
    finding = doc.get("finding") or {}
    key = {"finding_id": doc.get("finding_id"), "adjudicator_id": adjudicator_id}
    await _coll(db, LABELS).update_one(
        key,
        {
            "$set": {
                "verdict": verdict,
                "corrected_category": category,
                "notes": clean_notes,
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                **key,
                "build_id": doc.get("build_id"),
                "owner_user_id": doc.get("owner_user_id"),
                "rule_or_category": finding.get("rule_or_category"),
                "consent_basis": doc.get("consent_basis"),
                "created_at": now,
                "anonymized": False,
            },
        },
        upsert=True,
    )
    label = await _coll(db, LABELS).find_one(key, {"_id": 0})
    await _coll(db, EXCERPTS).update_one(
        {"id": item_id}, {"$set": {"status": STATUS_LABELLED, "labelled_at": now}},
    )
    await record_access(
        db, adjudicator_id=adjudicator_id, action="label", item_id=item_id, build_id=doc.get("build_id"),
        finding_id=doc.get("finding_id"), fields=("label",), now=now,
    )
    return _public_label(label) or {}


# --------------------------------------------------------------------------- #
# Purge on consent revocation (PV-2)
# --------------------------------------------------------------------------- #


def _basis_filter(basis: Optional[str]) -> Dict[str, Any]:
    if basis == "internal":
        return {"consent_basis": "internal"}
    if basis == "not_internal":
        return {"consent_basis": {"$ne": "internal"}}
    return {}


async def purge_user_excerpts(db, user_id: str, *, basis: Optional[str] = None) -> int:
    """Delete every adjudication excerpt of ``user_id``'s builds (PV-2).
    ``basis`` limits it to ``internal`` or ``not_internal`` excerpts. Labels
    already given are kept."""
    if not user_id:
        return 0
    result = await _coll(db, EXCERPTS).delete_many({"owner_user_id": user_id, **_basis_filter(basis)})
    count = int(getattr(result, "deleted_count", 0) or 0)
    if count:
        logger.info("purged %s adjudication excerpts for a user", count)
    return count


# --------------------------------------------------------------------------- #
# Retention and GDPR (PV-6)
# --------------------------------------------------------------------------- #


def _anon_token() -> str:
    return "anon:" + uuid.uuid4().hex[:16]


async def _anonymize_labels(db, query: Dict[str, Any], now) -> int:
    """Strip every link from matching labels to a build, finding or owner,
    keeping the verdict, category, adjudicator and dates (precision
    statistics). Each label gets its own random tokens, so the unique
    ``(finding_id, adjudicator_id)`` index still holds."""
    labels = _coll(db, LABELS)
    docs = await labels.find(query, {"_id": 0, "id": 1}).to_list(None)
    for doc in docs:
        await labels.update_one({"id": doc["id"]}, {"$set": {
            "build_id": _anon_token(),
            "finding_id": _anon_token(),
            "owner_user_id": None,
            "notes": None,
            "anonymized": True,
            "anonymized_at": now,
        }})
    return len(docs)


async def anonymize_expired_labels(db, *, now=None) -> int:
    """Labels are kept, but anonymized once their excerpt's retention
    (90 days) has passed."""
    now = now or utcnow()
    return await _anonymize_labels(
        db, {"anonymized": {"$ne": True}, "created_at": {"$lt": now - LABEL_ANONYMIZE_AFTER}}, now,
    )


async def run_adjudication_retention(db, *, now=None) -> Dict[str, int]:
    """Daily sweep (``tasks.adjudication_tasks``). The TTL indexes delete
    expired excerpts and access-log rows on their own; this is the
    backstop for both and the only path that anonymizes labels."""
    now = now or utcnow()
    excerpts = await _coll(db, EXCERPTS).delete_many({"expires_at": {"$lt": now}})
    log = await _coll(db, ACCESS_LOG).delete_many({"at": {"$lt": now - ACCESS_LOG_TTL}})
    return {
        "excerpts_deleted": int(getattr(excerpts, "deleted_count", 0) or 0),
        "access_log_deleted": int(getattr(log, "deleted_count", 0) or 0),
        "labels_anonymized": await anonymize_expired_labels(db, now=now),
    }


async def gdpr_erase_user_adjudication_data(
    db, *, user_id: str, build_ids: Iterable[str], anonymized_id: str, now=None,
) -> Dict[str, int]:
    """Account deletion: remove the excerpts of the user's builds, anonymize
    the labels on them, and replace the user's id where they acted as an
    adjudicator (labels and access log, as ``audit_logs`` actors are)."""
    now = now or utcnow()
    ids = list(build_ids or [])
    owned = {"$or": [{"owner_user_id": user_id}, {"build_id": {"$in": ids}}]}
    excerpts = await _coll(db, EXCERPTS).delete_many(owned)
    labels = await _anonymize_labels(db, owned, now)
    await _coll(db, LABELS).update_many({"adjudicator_id": user_id}, {"$set": {"adjudicator_id": anonymized_id}})
    await _coll(db, ACCESS_LOG).update_many({"adjudicator_id": user_id}, {"$set": {"adjudicator_id": anonymized_id}})
    return {"adjudication_excerpts": int(getattr(excerpts, "deleted_count", 0) or 0),
            "finding_adjudications_anonymized": labels}


async def gdpr_export_user_adjudication_data(db, user_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """The (already redacted) excerpts of the user's builds."""
    return {
        "adjudication_excerpts": await _coll(db, EXCERPTS).find({"owner_user_id": user_id}, {"_id": 0}).to_list(None),
    }


# --------------------------------------------------------------------------- #
# Indexes
# --------------------------------------------------------------------------- #


def adjudication_index_coroutines(db) -> list:
    """Index specs for the S0 collections, awaited by
    ``core.database._ensure_indexes``."""
    excerpts = _coll(db, EXCERPTS)
    log = _coll(db, ACCESS_LOG)
    labels = _coll(db, LABELS)
    reviews = _coll(db, "shadow_reviews")
    return [
        excerpts.create_index("id", unique=True),
        excerpts.create_index("finding_id", unique=True),
        excerpts.create_index([("status", 1), ("created_at", 1)]),
        excerpts.create_index([("owner_user_id", 1)]),
        excerpts.create_index([("build_id", 1)]),
        excerpts.create_index("expires_at", expireAfterSeconds=0, name="adjudication_excerpts_ttl"),
        log.create_index("at", expireAfterSeconds=int(ACCESS_LOG_TTL.total_seconds()),
                         name="adjudication_access_log_ttl"),
        log.create_index([("adjudicator_id", 1), ("at", -1)]),
        log.create_index([("build_id", 1), ("at", -1)]),
        labels.create_index("id", unique=True),
        labels.create_index([("finding_id", 1), ("adjudicator_id", 1)], unique=True),
        labels.create_index([("owner_user_id", 1)]),
        labels.create_index([("anonymized", 1), ("created_at", 1)]),
        # T4 idempotency key (core.shadow_budget).
        reviews.create_index("id", unique=True),
        reviews.create_index([("owner_user_id", 1), ("status", 1)]),
    ]
