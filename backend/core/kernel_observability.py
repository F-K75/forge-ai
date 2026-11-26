"""OpenTelemetry-Compatible Trace Collector for Forge AI's Multi-Agent Kernel.

Emits W3C Trace Context identifiers (32-hex trace_id, 16-hex span_id) and
hierarchical spans (`kernel.run` -> `kernel.wave` -> `kernel.task`,
`kernel.reconcile`, `kernel.repair`) with zero secret/prompt leakage.
Exports OTLP-compatible JSON payloads for external observability backends
while keeping zero third-party dependency requirements in core.
"""

from __future__ import annotations

import logging
import secrets
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)
TracePersisterFn = Callable[[Dict[str, Any]], Awaitable[None]]
OTLPExporterFn = Callable[[Dict[str, Any]], Awaitable[None]]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_trace_id() -> str:
    return secrets.token_hex(16)


def _new_span_id() -> str:
    return secrets.token_hex(8)


@dataclass
class TraceSpan:
    trace_id: str
    span_id: str
    parent_span_id: Optional[str]
    name: str
    kind: str  # INTERNAL | CLIENT | SERVER
    start_time_unix_nano: int
    end_time_unix_nano: int = 0
    duration_ms: int = 0
    status: str = "OK"  # OK | ERROR
    attributes: Dict[str, Any] = field(default_factory=dict)

    def finish(self, *, status: str = "OK", extra_attributes: Optional[Dict[str, Any]] = None) -> None:
        now_ns = time.time_ns()
        self.end_time_unix_nano = max(now_ns, self.start_time_unix_nano)
        self.duration_ms = int((self.end_time_unix_nano - self.start_time_unix_nano) / 1_000_000)
        self.status = status
        if extra_attributes:
            self.attributes.update(extra_attributes)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_otlp_span(self) -> Dict[str, Any]:
        return {
            "traceId": self.trace_id,
            "spanId": self.span_id,
            "parentSpanId": self.parent_span_id or "",
            "name": self.name,
            "kind": self.kind,
            "startTimeUnixNano": str(self.start_time_unix_nano),
            "endTimeUnixNano": str(self.end_time_unix_nano),
            "status": {"code": 1 if self.status == "OK" else 2},
            "attributes": [
                {"key": k, "value": {"stringValue": str(v)}}
                for k, v in sorted(self.attributes.items())
            ],
        }


@dataclass
class RunTrace:
    trace_id: str
    project_id: str
    run_id: str
    root_span_id: str
    spans: List[TraceSpan] = field(default_factory=list)
    created_at: str = field(default_factory=_utc_now)

    def summary(self) -> Dict[str, Any]:
        cost_by_dept: Dict[str, float] = {}
        error_spans = 0
        for sp in self.spans:
            if sp.status != "OK":
                error_spans += 1
            dept = sp.attributes.get("agent.department")
            cost = sp.attributes.get("llm.cost_usd")
            if dept and cost is not None:
                cost_by_dept[str(dept)] = round(cost_by_dept.get(str(dept), 0.0) + float(cost), 6)
        root_ms = self.spans[0].duration_ms if self.spans else 0
        return {
            "trace_id": self.trace_id,
            "run_id": self.run_id,
            "project_id": self.project_id,
            "span_count": len(self.spans),
            "error_span_count": error_spans,
            "total_duration_ms": root_ms,
            "cost_by_department": cost_by_dept,
            "spans": [s.to_dict() for s in self.spans],
        }

    def to_otlp_json(self) -> Dict[str, Any]:
        return {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": [
                            {"key": "service.name", "value": {"stringValue": "forge-ai-agent-kernel"}},
                            {"key": "forge.project_id", "value": {"stringValue": self.project_id}},
                            {"key": "forge.run_id", "value": {"stringValue": self.run_id}},
                        ]
                    },
                    "scopeSpans": [
                        {
                            "scope": {"name": "forge.kernel.observability", "version": "1.0.0"},
                            "spans": [s.to_otlp_span() for s in self.spans],
                        }
                    ],
                }
            ]
        }


class KernelTraceCollector:
    """In-memory bounded W3C/OTLP trace store strictly scoped by (project_id, run_id)."""

    def __init__(self, *, max_traces: int = 200) -> None:
        self._max_traces = max(20, max_traces)
        self._traces: Dict[str, RunTrace] = {}
        self._persister: Optional[TracePersisterFn] = None
        self._otlp_exporter: Optional[OTLPExporterFn] = None

    def attach_persister(self, persister: TracePersisterFn) -> None:
        """Attach an optional fail-open async storage sink (e.g., MongoDB)."""
        self._persister = persister

    def attach_otlp_exporter(self, exporter: OTLPExporterFn) -> None:
        """Attach an optional fail-open async OTLP HTTP exporter."""
        self._otlp_exporter = exporter

    async def finalize_trace(self, trace: RunTrace) -> None:
        """Persist finalized trace and optionally ship OTLP JSON asynchronously (fail-open)."""
        if self._persister is not None:
            try:
                await self._persister(trace.summary())
            except Exception:
                logger.debug("Trace persister error for %s", trace.run_id, exc_info=True)
        if self._otlp_exporter is not None:
            try:
                await self._otlp_exporter(trace.to_otlp_json())
            except Exception:
                logger.debug("OTLP exporter error for %s", trace.run_id, exc_info=True)

    def hydrate_trace(self, doc: Dict[str, Any]) -> Optional[RunTrace]:
        """Restore a persisted trace summary into memory without re-exporting."""
        run_id = str(doc.get("run_id") or "").strip()
        project_id = str(doc.get("project_id") or "").strip()
        trace_id = str(doc.get("trace_id") or "").strip()
        if not run_id or not project_id or not trace_id:
            return None
        spans: List[TraceSpan] = []
        for raw in doc.get("spans") or []:
            if not isinstance(raw, dict):
                continue
            spans.append(
                TraceSpan(
                    trace_id=str(raw.get("trace_id") or trace_id),
                    span_id=str(raw.get("span_id") or _new_span_id()),
                    parent_span_id=raw.get("parent_span_id"),
                    name=str(raw.get("name") or "kernel.span"),
                    kind=str(raw.get("kind") or "INTERNAL"),
                    start_time_unix_nano=int(raw.get("start_time_unix_nano") or 0),
                    end_time_unix_nano=int(raw.get("end_time_unix_nano") or 0),
                    duration_ms=int(raw.get("duration_ms") or 0),
                    status=str(raw.get("status") or "OK"),
                    attributes=dict(raw.get("attributes") or {}),
                )
            )
        root_span_id = spans[0].span_id if spans else _new_span_id()
        trace = RunTrace(
            trace_id=trace_id,
            project_id=project_id,
            run_id=run_id,
            root_span_id=root_span_id,
            spans=spans,
            created_at=str(doc.get("created_at") or _utc_now()),
        )
        self._traces[run_id] = trace
        if len(self._traces) > self._max_traces:
            oldest = next(iter(self._traces))
            self._traces.pop(oldest, None)
        return trace

    def start_run_trace(
        self,
        *,
        project_id: str,
        run_id: str,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> tuple[RunTrace, TraceSpan]:
        trace_id = _new_trace_id()
        root_span = TraceSpan(
            trace_id=trace_id,
            span_id=_new_span_id(),
            parent_span_id=None,
            name="kernel.run",
            kind="INTERNAL",
            start_time_unix_nano=time.time_ns(),
            attributes={"forge.run_id": run_id, **(attributes or {})},
        )
        trace = RunTrace(
            trace_id=trace_id,
            project_id=project_id,
            run_id=run_id,
            root_span_id=root_span.span_id,
            spans=[root_span],
        )
        self._traces[run_id] = trace
        if len(self._traces) > self._max_traces:
            oldest = next(iter(self._traces))
            self._traces.pop(oldest, None)
        return trace, root_span

    def start_child_span(
        self,
        trace: RunTrace,
        *,
        parent_span_id: str,
        name: str,
        kind: str = "INTERNAL",
        attributes: Optional[Dict[str, Any]] = None,
    ) -> TraceSpan:
        span = TraceSpan(
            trace_id=trace.trace_id,
            span_id=_new_span_id(),
            parent_span_id=parent_span_id,
            name=name,
            kind=kind,
            start_time_unix_nano=time.time_ns(),
            attributes=dict(attributes or {}),
        )
        trace.spans.append(span)
        return span

    def get_trace(self, project_id: str, run_id: str) -> Optional[RunTrace]:
        trace = self._traces.get(run_id)
        if trace is None or trace.project_id != project_id:
            return None
        return trace

    def list_traces_for_project(self, project_id: str, *, limit: int = 20) -> List[Dict[str, Any]]:
        matching = [t for t in self._traces.values() if t.project_id == project_id]
        return [t.summary() for t in matching[-limit:][::-1]]


_trace_collector_singleton: Optional[KernelTraceCollector] = None


def get_trace_collector() -> KernelTraceCollector:
    global _trace_collector_singleton
    if _trace_collector_singleton is None:
        _trace_collector_singleton = KernelTraceCollector()
    return _trace_collector_singleton
