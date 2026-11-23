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
