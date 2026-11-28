"""Composer attachments: bounded upload, type allowlist, dataset parsing.

* Size: 50 MB per file (the ``AttachmentRef.size_bytes`` cap), enforced while
  reading, never trusting ``Content-Length`` or the client's metadata.
* Datasets (PHASE2_DECISIONS.md #3): CSV / TSV / JSON only, at most 5 MB and
  50,000 rows, parsed on the server with the standard library.
* Storage: raw bytes in 1 MB chunks (``os_attachment_chunks``; Mongo's 16 MB
  document cap rules out one document) plus one metadata document in
  ``os_attachments``. Both expire with the 30-day replay window (decision #3).
  The metadata document is written last, so a half-stored upload is never
  visible.
* Tenancy: every read filters on ``user_id``. A turn's ``AttachmentRef`` is
  replaced with the server's own metadata, so a client cannot relabel a file or
  reference someone else's.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import math
import re
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple

from core.os.common import ATTACHMENT_CHUNKS, ATTACHMENTS, OsHTTPError, new_id, strip_mongo, utc_now

logger = logging.getLogger(__name__)

MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024
MAX_DATASET_BYTES = 5 * 1024 * 1024
MAX_DATASET_ROWS = 50_000
MAX_DATASET_COLUMNS = 100
MAX_CELL_CHARS = 1000
CHUNK_BYTES = 1024 * 1024
PREVIEW_ROWS = 20

# extension -> (canonical mime, kind)
ALLOWED_TYPES: Dict[str, Tuple[str, str]] = {
    "csv": ("text/csv", "dataset"),
    "tsv": ("text/tab-separated-values", "dataset"),
    "json": ("application/json", "dataset"),
    "txt": ("text/plain", "file"),
    "md": ("text/markdown", "file"),
    "pdf": ("application/pdf", "file"),
    "png": ("image/png", "image"),
    "jpg": ("image/jpeg", "image"),
    "jpeg": ("image/jpeg", "image"),
    "gif": ("image/gif", "image"),
    "webp": ("image/webp", "image"),
    "mp3": ("audio/mpeg", "audio"),
    "wav": ("audio/wav", "audio"),
    "webm": ("audio/webm", "audio"),
    "ogg": ("audio/ogg", "audio"),
    "m4a": ("audio/mp4", "audio"),
}
# Declared types a browser may send for each extension (anything else is refused).
_DECLARED_OK: Dict[str, Tuple[str, ...]] = {
    "csv": ("text/csv", "application/vnd.ms-excel", "text/plain", "application/csv"),
    "tsv": ("text/tab-separated-values", "text/plain"),
    "json": ("application/json", "text/json", "text/plain"),
    "txt": ("text/plain",),
    "md": ("text/markdown", "text/plain", "text/x-markdown"),
    "pdf": ("application/pdf",),
    "png": ("image/png",),
    "jpg": ("image/jpeg",),
    "jpeg": ("image/jpeg",),
    "gif": ("image/gif",),
    "webp": ("image/webp",),
    "mp3": ("audio/mpeg", "audio/mp3"),
    "wav": ("audio/wav", "audio/x-wav", "audio/wave"),
    "webm": ("audio/webm", "video/webm"),
    "ogg": ("audio/ogg",),
    "m4a": ("audio/mp4", "audio/x-m4a", "audio/m4a"),
}
# Magic numbers for binary types: a .png that is not a PNG is refused.
_MAGIC: Dict[str, Tuple[bytes, ...]] = {
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "gif": (b"GIF87a", b"GIF89a"),
    "pdf": (b"%PDF-",),
}
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def sanitize_filename(name: Optional[str]) -> str:
    base = (name or "").replace("\\", "/").split("/")[-1]
    base = _CONTROL.sub("", base).strip().lstrip(".")
    return (base or "upload")[:255]


def classify(filename: str, declared_mime: Optional[str]) -> Tuple[str, str, str]:
    """Return ``(extension, canonical_mime, kind)`` or raise 415."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_TYPES:
        raise OsHTTPError(415, "validation_failed", "This file type is not supported")
    declared = (declared_mime or "").split(";")[0].strip().lower()
    if declared and declared != "application/octet-stream" and declared not in _DECLARED_OK[ext]:
        raise OsHTTPError(415, "validation_failed", "File type does not match its extension")
    mime, kind = ALLOWED_TYPES[ext]
    return ext, mime, kind


def attachment_ref(doc: Dict[str, Any]) -> Dict[str, Any]:
    """``AttachmentRef`` wire shape from a stored document."""
    return {
        "id": doc["id"],
        "name": doc["name"],
        "mime_type": doc["mime_type"],
        "size_bytes": int(doc["size_bytes"]),
        "kind": doc["kind"],
    }


# --------------------------------------------------------------------------- #
# Dataset parsing (standard library only)
# --------------------------------------------------------------------------- #


def _decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def _coerce(value: Any) -> Any:
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value if not (isinstance(value, float) and (math.isnan(value) or math.isinf(value))) else None
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)[:MAX_CELL_CHARS]
    text = str(value).strip()[:MAX_CELL_CHARS]
    if text == "":
        return None
    cleaned = text.replace(",", "") if re.fullmatch(r"-?\d{1,3}(,\d{3})+(\.\d+)?", text) else text
    if re.fullmatch(r"-?\d+", cleaned):
        try:
            return int(cleaned)
        except ValueError:  # pragma: no cover
            return text
    if re.fullmatch(r"-?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?", cleaned):
        f = float(cleaned)
        return f if math.isfinite(f) else None
    return text


def _safe_key(name: Any, idx: int, used: set) -> str:
    """Column key for the data model: short, pointer-safe, unique."""
    base = re.sub(r"[^A-Za-z0-9_]+", "_", str(name or "").strip()).strip("_").lower()[:48] or f"col_{idx + 1}"
    if base[0].isdigit():
        base = f"c_{base}"
    key, n = base, 2
    while key in used:
        key, n = f"{base}_{n}", n + 1
    used.add(key)
    return key


def _column_types(keys: List[str], rows: List[Dict[str, Any]]) -> Dict[str, str]:
    types = {}
    for k in keys:
        vals = [r.get(k) for r in rows if r.get(k) is not None]
        types[k] = "number" if vals and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vals) else "text"
    return types


def parse_dataset(raw: bytes, ext: str) -> Dict[str, Any]:
    """Parse CSV / TSV / JSON into ``{columns, rows, row_count}``. Raises 413 / 422."""
    if len(raw) > MAX_DATASET_BYTES:
        raise OsHTTPError(413, "validation_failed", "Datasets are limited to 5 MB")
    text = _decode(raw)
    records: List[Dict[str, Any]] = []
    labels: List[str] = []
    if ext == "json":
        try:
            data = json.loads(text)
        except ValueError:
            raise OsHTTPError(422, "validation_failed", "The JSON file could not be parsed") from None
        if isinstance(data, dict):
            data = data.get("rows") or data.get("data") or data.get("items")
        if not isinstance(data, list) or not all(isinstance(r, dict) for r in data):
            raise OsHTTPError(422, "validation_failed", "A JSON dataset must be a list of objects")
        if len(data) > MAX_DATASET_ROWS:
            raise OsHTTPError(413, "validation_failed", "Datasets are limited to 50,000 rows")
        for r in data:
            for k in r:
                if k not in labels:
                    labels.append(str(k))
        if len(labels) > MAX_DATASET_COLUMNS:
            raise OsHTTPError(422, "validation_failed", "Datasets are limited to 100 columns")
        records = [{str(k): v for k, v in r.items()} for r in data]
    else:
        delimiter = "\t" if ext == "tsv" else ","
        if ext == "csv":
            try:
                delimiter = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|").delimiter
            except csv.Error:
                delimiter = ","
        reader = csv.reader(io.StringIO(text), delimiter=delimiter)
        try:
            header = next(reader)
        except StopIteration:
            raise OsHTTPError(422, "validation_failed", "The dataset is empty") from None
        except csv.Error:
            raise OsHTTPError(422, "validation_failed", "The CSV file could not be parsed") from None
        if len(header) > MAX_DATASET_COLUMNS:
            raise OsHTTPError(422, "validation_failed", "Datasets are limited to 100 columns")
        labels = [h.strip() or f"Column {i + 1}" for i, h in enumerate(header)]
        try:
            for row in reader:
                if not any(c.strip() for c in row):
                    continue
                if len(records) >= MAX_DATASET_ROWS:
                    raise OsHTTPError(413, "validation_failed", "Datasets are limited to 50,000 rows")
                records.append({labels[i]: row[i] if i < len(row) else None for i in range(len(labels))})
        except csv.Error:
            raise OsHTTPError(422, "validation_failed", "The CSV file could not be parsed") from None
    if not labels:
        raise OsHTTPError(422, "validation_failed", "The dataset has no columns")
    used: set = set()
    keys = [_safe_key(label, i, used) for i, label in enumerate(labels)]
    rows = [{keys[i]: _coerce(rec.get(labels[i])) for i in range(len(labels))} for rec in records]
    types = _column_types(keys, rows)
    columns = [{"key": k, "label": (labels[i] or k)[:80], "type": types[k]} for i, k in enumerate(keys)]
    return {"columns": columns, "rows": rows, "row_count": len(rows)}


# --------------------------------------------------------------------------- #
# Storage
# --------------------------------------------------------------------------- #


class AttachmentRepository:
    def __init__(self, db):
        self.col = db[ATTACHMENTS]
        self.chunks = db[ATTACHMENT_CHUNKS]

    async def store(
        self,
        *,
        user_id: str,
        filename: str,
        declared_mime: Optional[str],
        stream: AsyncIterator[bytes],
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        name = sanitize_filename(filename)
        ext, mime, kind = classify(name, declared_mime)
        att_id = new_id("att")
        size = 0
        n = 0
        head = b""
        buf = bytearray()
        dataset_raw = bytearray() if kind == "dataset" else None
        now = utc_now()
        try:
            async for piece in stream:
                if not piece:
                    continue
                size += len(piece)
                if size > MAX_ATTACHMENT_BYTES:
                    raise OsHTTPError(413, "validation_failed", "Attachments are limited to 50 MB")
                if dataset_raw is not None:
                    if size > MAX_DATASET_BYTES:
                        raise OsHTTPError(413, "validation_failed", "Datasets are limited to 5 MB")
                    dataset_raw.extend(piece)
                if len(head) < 16:
                    head = (head + piece)[:16]
                buf.extend(piece)
                while len(buf) >= CHUNK_BYTES:
                    await self.chunks.insert_one(
                        {"attachment_id": att_id, "user_id": user_id, "n": n, "data": bytes(buf[:CHUNK_BYTES]), "created_at": now}
                    )
                    del buf[:CHUNK_BYTES]
                    n += 1
            if size == 0:
                raise OsHTTPError(422, "validation_failed", "The file is empty")
            magic = _MAGIC.get(ext)
            if magic and not any(head.startswith(m) for m in magic):
                raise OsHTTPError(415, "validation_failed", "File contents do not match its type")
            dataset_meta = None
            if dataset_raw is not None:
                parsed = parse_dataset(bytes(dataset_raw), ext)
                dataset_meta = {
                    "columns": parsed["columns"],
                    "row_count": parsed["row_count"],
                    "preview": parsed["rows"][:PREVIEW_ROWS],
                }
            if buf:
                await self.chunks.insert_one(
                    {"attachment_id": att_id, "user_id": user_id, "n": n, "data": bytes(buf), "created_at": now}
                )
                n += 1
        except BaseException:
            await self.chunks.delete_many({"attachment_id": att_id})
            raise
        doc = {
            "id": att_id,
            "user_id": user_id,
            "session_id": session_id,
            "name": name,
            "mime_type": mime,
            "size_bytes": size,
            "kind": kind,
            "ext": ext,
            "chunk_count": n,
            "dataset": dataset_meta,
            "created_at": now,
        }
        await self.col.insert_one(dict(doc))
        return doc

    async def get(self, user_id: str, attachment_id: str) -> Optional[Dict[str, Any]]:
        return strip_mongo(await self.col.find_one({"id": attachment_id, "user_id": user_id}, {"_id": 0}))

    async def read_bytes(self, user_id: str, attachment_id: str) -> Optional[bytes]:
        doc = await self.get(user_id, attachment_id)
        if doc is None:
            return None
        cursor = self.chunks.find({"attachment_id": attachment_id, "user_id": user_id}, {"_id": 0}).sort([("n", 1)])
        parts = await cursor.to_list(length=doc.get("chunk_count") or 0)
        return b"".join(p["data"] for p in parts)

    async def load_dataset(self, user_id: str, attachment_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.get(user_id, attachment_id)
        if doc is None or doc.get("kind") != "dataset":
            return None
        raw = await self.read_bytes(user_id, attachment_id)
        if raw is None:
            return None
        parsed = parse_dataset(raw, doc.get("ext") or "csv")
        parsed["name"] = doc["name"]
        return parsed

    async def resolve_refs(self, user_id: str, refs: Optional[List[Any]]) -> List[Dict[str, Any]]:
        """Swap client ``AttachmentRef``s for the server's metadata; unknown / foreign ids are refused."""
        out = []
        seen = set()
        for ref in refs or []:
            att_id = getattr(ref, "id", None) or (ref.get("id") if isinstance(ref, dict) else None)
            if not att_id or att_id in seen:
                continue
            seen.add(att_id)
            doc = await self.get(user_id, att_id)
            if doc is None:
                raise OsHTTPError(422, "validation_failed", "Unknown attachment")
            out.append(attachment_ref(doc))
        return out
