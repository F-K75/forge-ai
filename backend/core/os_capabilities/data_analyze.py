"""``data.analyze``: parse a CSV or JSON dataset and build a table + chart + filter surface.

Phase 2 decision (docs/os/PHASE2_DECISIONS.md #3): CSV and JSON only, at most
5 MB and 50,000 rows, parsed on the server with the standard library (no
pandas). The data is ephemeral: it lives in the surface's data model, which
WS-C stores with the session (``os_surfaces``) and expires with it.

The surface is deterministic, so it works with no LLM key.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from core.os_capabilities.surfaces import (
    create_surface,
    humanize,
    new_surface_id,
    placement,
    update_components,
    update_data_model,
)

CAPABILITY_ID = "data.analyze"
MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 50_000
MAX_COLUMNS = 30
# The table's rows travel in the surface data model (event log + os_surfaces
# snapshot), so only this much row JSON is embedded; the chart and the summary
# are computed over every row.
MAX_EMBEDDED_ROW_CHARS = 1_500_000
MAX_CATEGORIES = 25
MAX_POINTS = 500
CHART_KINDS = ("bar", "line", "area", "pie", "scatter")

_NUMBER = re.compile(r"^[\s$€£¥]*[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?\s*%?\s*$")
_DATE = re.compile(r"^\d{4}-\d{2}(-\d{2})?([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$")


class DatasetError(ValueError):
    """The dataset is too large, malformed or empty. ``str(exc)`` is safe to show."""


@dataclass
class Column:
    key: str
    label: str
    kind: str  # "number" | "date" | "text"
    distinct: int = 0
    options: List[str] = field(default_factory=list)


@dataclass
class Dataset:
    columns: List[Column]
    rows: List[Dict[str, Any]]
    source_format: str


# --------------------------------------------------------------------------- parsing


def _decode(content: Any) -> str:
    if isinstance(content, (bytes, bytearray)):
        if len(content) > MAX_BYTES:
            raise DatasetError("The dataset is larger than 5 MB.")
        try:
            return bytes(content).decode("utf-8-sig")
        except UnicodeDecodeError:
            return bytes(content).decode("latin-1")
    if not isinstance(content, str):
        raise DatasetError("The dataset must be CSV or JSON text.")
    if len(content.encode("utf-8")) > MAX_BYTES:
        raise DatasetError("The dataset is larger than 5 MB.")
    return content.lstrip("﻿")


def _detect_format(text: str, fmt: Optional[str], filename: Optional[str]) -> str:
    if fmt in ("csv", "json"):
        return fmt
    name = (filename or "").lower()
    if name.endswith(".json"):
        return "json"
    if name.endswith((".csv", ".tsv", ".txt")):
        return "csv"
    return "json" if text.lstrip()[:1] in ("[", "{") else "csv"


def _unique_keys(headers: Sequence[Any]) -> List[str]:
    keys: List[str] = []
    for idx, raw in enumerate(headers):
        base = str(raw).strip()[:64] if raw is not None and str(raw).strip() else f"column_{idx + 1}"
        key, n = base, 2
        while key in keys:
            suffix = f"_{n}"
            key = base[: 64 - len(suffix)] + suffix
            n += 1
        keys.append(key)
    return keys


def _parse_csv(text: str) -> Tuple[List[str], List[List[Any]]]:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    try:
        header = next(reader)
    except StopIteration:
        raise DatasetError("The CSV file is empty.") from None
    rows: List[List[Any]] = []
    for row in reader:
        if not any(c.strip() for c in row):
            continue
        rows.append(row)
        if len(rows) > MAX_ROWS:
            raise DatasetError(f"The dataset has more than {MAX_ROWS:,} rows.")
    return header, rows


def _parse_json(text: str) -> Tuple[List[str], List[List[Any]]]:
    try:
        doc = json.loads(text)
    except json.JSONDecodeError:
        raise DatasetError("The JSON file could not be parsed.") from None
    if isinstance(doc, dict):
        doc = next((v for k, v in doc.items() if k in ("data", "rows", "items", "records") and isinstance(v, list)), None) or next(
            (v for v in doc.values() if isinstance(v, list)), None
        )
    if not isinstance(doc, list) or not doc:
        raise DatasetError("The JSON must be a non-empty array of objects (or an object holding one).")
    if len(doc) > MAX_ROWS:
        raise DatasetError(f"The dataset has more than {MAX_ROWS:,} rows.")
    header: List[str] = []
    for item in doc[:1000]:
        if not isinstance(item, dict):
            raise DatasetError("Each JSON row must be an object.")
        for k in item:
            if k not in header:
                header.append(k)
    rows = [[item.get(k) if isinstance(item, dict) else None for k in header] for item in doc]
    return header, rows


def _to_number(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(float(value)) else None
    if not isinstance(value, str) or not value.strip() or not _NUMBER.match(value):
        return None
    cleaned = re.sub(r"[\s$€£¥,%]", "", value)
    try:
        number = float(cleaned)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def _is_date(value: Any) -> bool:
    return isinstance(value, str) and bool(_DATE.match(value.strip()))


def _infer(values: Sequence[Any]) -> str:
    present = [v for v in values if v not in (None, "")]
    if not present:
        return "text"
    if sum(1 for v in present if _to_number(v) is not None) >= 0.9 * len(present):
        return "number"
    if sum(1 for v in present if _is_date(v)) >= 0.9 * len(present):
        return "date"
    return "text"


def parse_dataset(content: Any, fmt: Optional[str] = None, filename: Optional[str] = None) -> Dataset:
    text = _decode(content)
    if not text.strip():
        raise DatasetError("The dataset is empty.")
    source = _detect_format(text, fmt, filename)
    header, raw_rows = _parse_csv(text) if source == "csv" else _parse_json(text)
    if not raw_rows:
        raise DatasetError("The dataset has a header but no rows.")
    if len(header) > MAX_COLUMNS:
        header = header[:MAX_COLUMNS]
    keys = _unique_keys(header)
    columns: List[Column] = []
    rows: List[Dict[str, Any]] = [dict() for _ in raw_rows]
    for idx, key in enumerate(keys):
        values = [r[idx] if idx < len(r) else None for r in raw_rows]
        kind = _infer(values)
        col = Column(key=key, label=humanize(key) if not str(header[idx]).strip() else str(header[idx]).strip()[:80], kind=kind)
        distinct = set()
        for row, value in zip(rows, values):
            if kind == "number":
                row[key] = _to_number(value)
            elif value is None:
                row[key] = None
            else:
                row[key] = value if isinstance(value, str) else json.dumps(value, default=str) if isinstance(value, (dict, list)) else str(value)
                if isinstance(row[key], str):
                    row[key] = row[key][:500]
            if kind == "text" and len(distinct) <= 50 and row[key] not in (None, ""):
                distinct.add(row[key])
        col.distinct = len(distinct)
        if kind == "text" and 1 < len(distinct) <= 50:
            col.options = sorted(str(d)[:200] for d in distinct)
        columns.append(col)
    return Dataset(columns=columns, rows=rows, source_format=source)


# --------------------------------------------------------------------------- chart


def _pick_axes(ds: Dataset, x: Optional[str], y: Optional[Sequence[str]]) -> Tuple[Optional[Column], List[Column]]:
    by_key = {c.key: c for c in ds.columns}
    numeric = [c for c in ds.columns if c.kind == "number"]
    x_col = by_key.get(x) if x else None
    if x_col is None:
        x_col = next((c for c in ds.columns if c.kind == "date"), None) or next(
            (c for c in ds.columns if c.kind == "text" and c.distinct > 1), None
        )
    series = [by_key[k] for k in (y or []) if k in by_key and by_key[k].kind == "number" and by_key[k] is not x_col]
    if not series:
        series = [c for c in numeric if c is not x_col][:3]
    return x_col, series[:8]


def _sort_key(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return (0, datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp(), value)
        except ValueError:
            return (1, 0, value)
    return (2, 0, str(value))


def build_chart(ds_columns: Sequence[Column], rows: Sequence[Dict[str, Any]], x: Optional[Column], series: Sequence[Column],
                kind: Optional[str] = None) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Return ``(chart_props, chart_rows)``: aggregated, bounded and ready for the ``Chart`` component."""
    if x is None:
        # No category or date column: plot the numeric series against row number.
        data = []
        step = max(1, math.ceil(len(rows) / MAX_POINTS))
        for idx in range(0, len(rows), step):
            point = {"row": idx + 1}
            for s in series:
                point[s.key] = rows[idx].get(s.key)
            data.append(point)
        keys = [{"key": s.key, "label": s.label[:80]} for s in series] or [{"key": "row", "label": "Row"}]
        return {"kind": kind or "line", "x": "row", "series": keys}, data
    if not series:
        counts: Dict[Any, int] = {}
        for row in rows:
            v = row.get(x.key)
            if v not in (None, ""):
                counts[v] = counts.get(v, 0) + 1
        top = sorted(counts.items(), key=lambda kv: -kv[1])[:MAX_CATEGORIES]
        return {"kind": kind or "bar", "x": x.key, "series": [{"key": "count", "label": "Count"}]}, [
            {x.key: k, "count": v} for k, v in top
        ]
    totals: Dict[Any, Dict[str, float]] = {}
    for row in rows:
        cat = row.get(x.key)
        if cat in (None, ""):
            continue
        bucket = totals.setdefault(cat, {s.key: 0.0 for s in series})
        for s in series:
            v = row.get(s.key)
            if isinstance(v, (int, float)):
                bucket[s.key] += v
    if x.kind == "date":
        ordered = sorted(totals.items(), key=lambda kv: _sort_key(kv[0]))
        if len(ordered) > MAX_POINTS:
            step = math.ceil(len(ordered) / MAX_POINTS)
            ordered = ordered[::step]
        default_kind = "line"
    else:
        ordered = sorted(totals.items(), key=lambda kv: -kv[1][series[0].key])[:MAX_CATEGORIES]
        default_kind = "bar"
    data = [{x.key: k, **{s: round(v, 6) for s, v in vals.items()}} for k, vals in ordered]
    return {
        "kind": kind if kind in CHART_KINDS else default_kind,
        "x": x.key,
        "series": [{"key": s.key, "label": s.label[:80]} for s in series],
    }, data


def _chart_title(x: Optional[Column], series: Sequence[Column]) -> str:
    if x is None:
        return " and ".join(s.label for s in series[:3]) or "Rows"
    if not series:
        return f"Rows by {x.label}"
    return f"{' and '.join(s.label for s in series[:3])} by {x.label}"


# --------------------------------------------------------------------------- surface


def _embedded_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out, used = [], 0
    for row in rows:
        size = len(json.dumps(row, default=str))
        if used + size > MAX_EMBEDDED_ROW_CHARS:
            break
        out.append(row)
        used += size
    return out


def _summary(ds: Dataset, shown: int) -> str:
    numeric = [c for c in ds.columns if c.kind == "number"]
    parts = [f"{len(ds.rows):,} rows × {len(ds.columns)} columns ({ds.source_format.upper()})."]
    for col in numeric[:3]:
        vals = [r[col.key] for r in ds.rows if isinstance(r.get(col.key), (int, float))]
        if vals:
            parts.append(f"{col.label}: total {round(sum(vals), 2):,}, min {round(min(vals), 2):,}, max {round(max(vals), 2):,}.")
    if shown < len(ds.rows):
        parts.append(f"The table shows the first {shown:,} rows; the chart and totals use all rows.")
    return " ".join(parts)


def analyze_dataset(
    content: Any,
    *,
    fmt: Optional[str] = None,
    filename: Optional[str] = None,
    x: Optional[str] = None,
    y: Optional[Sequence[str]] = None,
    chart_kind: Optional[str] = None,
    title: Optional[str] = None,
    presentation: str = "window",
    surface_id: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    """Parse and build the surface. Returns ``(a2ui_messages, placements, summary)``."""
    ds = parse_dataset(content, fmt, filename)
    x_col, series = _pick_axes(ds, x, y)
    chart, chart_rows = build_chart(ds.columns, ds.rows, x_col, series, chart_kind)
    rows = _embedded_rows(ds.rows)
    surface_id = surface_id or new_surface_id(CAPABILITY_ID, "analyze")
    heading = (title or (filename and f"Analysis of {filename}") or "Dataset analysis")[:200]

    filters: List[Dict[str, Any]] = [{"id": "f_search", "label": "Search", "kind": "search", "value": {"@path": "/filters/search"}}]
    filter_values: Dict[str, Any] = {"search": ""}
    for col in [c for c in ds.columns if c.options][:3]:
        fid = f"f_{len(filters)}"
        filters.append({
            "id": fid, "label": col.label[:80], "kind": "select", "value": {"@path": f"/filters/{fid}"},
            "options": [{"value": "", "label": "All"}] + [{"value": o, "label": o or "(blank)"} for o in col.options[:99]],
        })
        filter_values[fid] = ""

    kinds = {"number": "number", "date": "date", "text": "text"}
    components = [
        {"id": "root", "component": "Column", "children": ["title", "summary", "filters", "chart", "table"], "gap": "md"},
        {"id": "title", "component": "Heading", "text": heading, "level": 2},
        {"id": "summary", "component": "Text", "text": {"@path": "/meta/summary"}, "variant": "muted"},
        {"id": "filters", "component": "FilterBar", "filters": filters},
        {"id": "chart", "component": "Chart", "title": _chart_title(x_col, series)[:200], "data": {"@path": "/chart"}, **chart},
        {
            "id": "table", "component": "DataTable",
            "columns": [{"key": c.key, "label": c.label[:80], "type": kinds[c.kind]} for c in ds.columns],
            "rows": {"@path": "/rows"}, "sortable": True, "pageSize": 50,
        },
    ]
    meta = {
        "summary": _summary(ds, len(rows)),
        "row_count": len(ds.rows),
        "embedded_rows": len(rows),
        "format": ds.source_format,
        "columns": [{"key": c.key, "label": c.label, "kind": c.kind} for c in ds.columns],
        "x": chart["x"],
        "series": [s["key"] for s in chart["series"]],
    }
    data_model = {"rows": rows, "chart": chart_rows, "filters": filter_values, "meta": meta}
    messages = [create_surface(surface_id, components, data_model)]
    return messages, [placement(surface_id, presentation, heading, CAPABILITY_ID)], meta


def change_chart(surface_id: str, data_model: Dict[str, Any], *, chart_kind: Optional[str] = None, x: Optional[str] = None,
                 y: Optional[Sequence[str]] = None) -> List[Dict[str, Any]]:
    """Re-aggregate the chart from the rows already in the surface data model.

    Only the rows embedded in the data model are available here, so for very
    large datasets the new chart covers the embedded rows (``meta.embedded_rows``).
    """
    meta = data_model.get("meta") or {}
    columns = [Column(key=c["key"], label=c.get("label", c["key"]), kind=c.get("kind", "text")) for c in meta.get("columns") or []]
    if not columns:
        raise DatasetError("This surface has no dataset to re-chart.")
    ds = Dataset(columns=columns, rows=list(data_model.get("rows") or []), source_format=meta.get("format", "csv"))
    x_col, series = _pick_axes(ds, x or meta.get("x"), y or meta.get("series"))
    if x and (x_col is None or x_col.key != x):
        raise DatasetError(f"Unknown column {x!r}.")
    chart, chart_rows = build_chart(ds.columns, ds.rows, x_col, series, chart_kind)
    component = {"id": "chart", "component": "Chart", "title": _chart_title(x_col, series)[:200], "data": {"@path": "/chart"}, **chart}
    return [update_data_model(surface_id, "/chart", chart_rows), update_components(surface_id, [component])]


__all__ = ["DatasetError", "analyze_dataset", "change_chart", "parse_dataset", "MAX_BYTES", "MAX_ROWS"]
