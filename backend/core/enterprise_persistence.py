"""Durable Startup Persistence & Safe OTLP HTTP Export for Forge AI's Enterprise OS.

Pure-Python stdlib module that connects Forge AI's five Enterprise OS stores
(`KnowledgeFabric`, `GovernancePolicyStore`, `KernelTraceCollector`,
`SkillMarketplaceRegistry`, and `MultiAgentBenchmarkHarness`) to MongoDB
(or any Motor-compatible async DB handle) for fail-open persistence and startup
hydration, plus an optional SSRF-guarded OTLP/HTTP JSON trace exporter.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import os
import urllib.request
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from core.benchmark_harness import get_benchmark_harness
from core.kernel_observability import get_trace_collector
from core.knowledge_fabric import get_knowledge_fabric
from core.skill_marketplace import get_governance_policy_store, get_skill_marketplace

logger = logging.getLogger(__name__)

_LINK_LOCAL_METADATA_HOSTS = {
    "169.254.169.254",
    "metadata.google.internal",
    "metadata.goog",
}


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Prevent outbound OTLP exports from following redirects to untrusted hosts."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        raise ValueError("Redirects are disabled for OTLP trace export")


def validate_otlp_endpoint(endpoint: str, *, allow_local: bool = False) -> str:
    """Validate an OTLP/HTTP endpoint URL against unsafe schemes and metadata SSRF.

    Cloud metadata endpoints (169.254.169.254 / metadata.google.internal) are
    always rejected. Loopback and RFC1918 private hosts are rejected by default
    unless `allow_local=True` (for local Jaeger / OTel Collector sidecars).
    """
    raw = (endpoint or "").strip()
    if not raw:
        raise ValueError("OTLP endpoint must not be empty")
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("OTLP endpoint must use http:// or https://")
    if parsed.username or parsed.password:
        raise ValueError("OTLP endpoint must not embed credentials in the URL")
    host = (parsed.hostname or "").strip().lower()
    if not host:
        raise ValueError("OTLP endpoint must include a valid hostname")
    if host in _LINK_LOCAL_METADATA_HOSTS:
        raise ValueError("OTLP endpoint cannot target cloud metadata hosts")

    # Check literal IP ranges
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None

    if ip is not None:
        if ip.is_link_local or ip.is_multicast or ip.is_unspecified:
            raise ValueError(f"OTLP endpoint IP '{host}' is not allowed")
        if not allow_local and (ip.is_private or ip.is_loopback or ip.is_reserved):
            raise ValueError(
                f"OTLP endpoint '{host}' targets a private/loopback address "
                "(set FORGE_OTLP_ALLOW_LOCAL=true for local collector sidecars)"
            )
    else:
        if not allow_local and host in {"localhost", "localhost.localdomain"}:
            raise ValueError(
                "OTLP endpoint 'localhost' requires FORGE_OTLP_ALLOW_LOCAL=true"
            )
        if not allow_local and parsed.scheme != "https":
            raise ValueError("External OTLP endpoints must use https://")

    return raw


def _post_otlp_sync(
    endpoint: str,
    payload: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None,
    timeout_seconds: float = 4.0,
) -> int:
    body = json.dumps(payload).encode("utf-8")
    req_headers = {
        "Content-Type": "application/json",
        "User-Agent": "forge-ai-kernel-otlp/1.0",
    }
    if headers:
        for k, v in headers.items():
            if "\r" not in str(k) and "\n" not in str(k) and "\r" not in str(v) and "\n" not in str(v):
                req_headers[str(k)] = str(v)
    req = urllib.request.Request(endpoint, data=body, headers=req_headers, method="POST")
    opener = urllib.request.build_opener(_NoRedirectHandler())
    with opener.open(req, timeout=timeout_seconds) as resp:
        return int(getattr(resp, "status", 200))


async def export_trace_otlp_http(
    endpoint: str,
    payload: Dict[str, Any],
    *,
    headers: Optional[Dict[str, str]] = None,
    allow_local: bool = False,
    timeout_seconds: float = 4.0,
) -> int:
    """Validate endpoint and POST OTLP/HTTP JSON trace payload without blocking the event loop."""
    safe_url = validate_otlp_endpoint(endpoint, allow_local=allow_local)
    return await asyncio.to_thread(_post_otlp_sync, safe_url, payload, headers, timeout_seconds)


async def _load_collection_docs(collection: Any, limit: int = 500) -> list[Dict[str, Any]]:
    cursor = collection.find({}, {"_id": 0})
    if hasattr(cursor, "limit"):
        cursor = cursor.limit(limit)
    if hasattr(cursor, "to_list"):
        return list(await cursor.to_list(length=limit))
    # Support simple async-iterable or list test doubles
    if isinstance(cursor, list):
        return cursor[:limit]
    docs: list[Dict[str, Any]] = []
    async for doc in cursor:
        docs.append(doc)
        if len(docs) >= limit:
            break
    return docs


async def bootstrap_enterprise_os_persistence(
    db: Any,
    *,
    otlp_endpoint: Optional[str] = None,
    otlp_auth_header: Optional[str] = None,
    allow_local_otlp: Optional[bool] = None,
    fabric=None,
    policy_store=None,
    trace_collector=None,
    marketplace=None,
    benchmark_harness=None,
) -> Dict[str, int]:
    """Attach fail-open MongoDB persisters, hydrate existing OS state, and wire optional OTLP export.

    Returns counts of hydrated records per store for observability & tests.
    """
    fabric = fabric or get_knowledge_fabric()
    policy_store = policy_store or get_governance_policy_store()
    trace_collector = trace_collector or get_trace_collector()
    marketplace = marketplace or get_skill_marketplace()
    benchmark_harness = benchmark_harness or get_benchmark_harness()

    counts = {
        "knowledge_nodes": 0,
        "governance_policies": 0,
        "traces": 0,
        "marketplace_packages": 0,
        "marketplace_installations": 0,
        "benchmark_reports": 0,
        "otlp_enabled": 0,
    }

    # 1. Knowledge Fabric persistence & hydration
    async def _persist_knowledge(project_id: str, payload: Dict[str, Any]) -> None:
        node_id = payload.get("node_id")
        if not project_id or not node_id:
            return
        await db["knowledge_nodes"].update_one(
            {"project_id": project_id, "node_id": node_id},
            {"$set": payload},
            upsert=True,
        )

    fabric.attach_persister(_persist_knowledge)
    try:
        for doc in await _load_collection_docs(db["knowledge_nodes"], limit=1000):
            if fabric.hydrate_node(doc) is not None:
                counts["knowledge_nodes"] += 1
    except Exception:
        logger.debug("KnowledgeFabric hydration skipped", exc_info=True)

    # 2. Tenant Governance Policies persistence & hydration
    async def _persist_policy(kind: str, payload: Dict[str, Any]) -> None:
        if kind != "policy":
            return
        await db["tenant_governance_policies"].update_one(
            {"project_id": payload["project_id"]},
            {"$set": payload},
            upsert=True,
        )

    policy_store.attach_persister(_persist_policy)
    try:
        for doc in await _load_collection_docs(db["tenant_governance_policies"], limit=500):
            if policy_store.hydrate_policy(doc) is not None:
                counts["governance_policies"] += 1
    except Exception:
        logger.debug("GovernancePolicyStore hydration skipped", exc_info=True)

    # 3. Kernel Trace Collector persistence, hydration & optional OTLP exporter
    async def _persist_trace(summary_doc: Dict[str, Any]) -> None:
        await db["kernel_traces"].update_one(
            {"project_id": summary_doc["project_id"], "run_id": summary_doc["run_id"]},
            {"$set": summary_doc},
            upsert=True,
        )

    trace_collector.attach_persister(_persist_trace)
    try:
        for doc in await _load_collection_docs(db["kernel_traces"], limit=200):
            if trace_collector.hydrate_trace(doc) is not None:
                counts["traces"] += 1
    except Exception:
        logger.debug("KernelTraceCollector hydration skipped", exc_info=True)

    resolved_otlp = (
        otlp_endpoint
        if otlp_endpoint is not None
        else os.environ.get("FORGE_OTLP_ENDPOINT", "").strip()
    )
    resolved_local = (
        allow_local_otlp
        if allow_local_otlp is not None
        else os.environ.get("FORGE_OTLP_ALLOW_LOCAL", "").lower() in {"1", "true", "yes"}
    )
    if resolved_otlp:
        try:
            validated_url = validate_otlp_endpoint(resolved_otlp, allow_local=resolved_local)
            auth_val = (
                otlp_auth_header
                if otlp_auth_header is not None
                else os.environ.get("FORGE_OTLP_AUTH_HEADER", "").strip()
            )
            extra_headers = {"Authorization": auth_val} if auth_val else None

            async def _ship_otlp(otlp_payload: Dict[str, Any]) -> None:
                await export_trace_otlp_http(
                    validated_url,
                    otlp_payload,
                    headers=extra_headers,
                    allow_local=resolved_local,
                )

            trace_collector.attach_otlp_exporter(_ship_otlp)
            counts["otlp_enabled"] = 1
        except ValueError as exc:
            logger.warning("Ignoring invalid FORGE_OTLP_ENDPOINT: %s", exc)

    # 4. Governed Skill Marketplace persistence & hydration
    async def _persist_marketplace(kind: str, payload: Dict[str, Any]) -> None:
        if kind == "package":
            await db["marketplace_packages"].update_one(
                {"package_id": payload["package_id"]},
                {"$set": payload},
                upsert=True,
            )
        elif kind == "installation":
            await db["marketplace_installations"].update_one(
                {"project_id": payload["project_id"], "package_id": payload["package_id"]},
                {"$set": payload},
                upsert=True,
            )

    marketplace.attach_persister(_persist_marketplace)
    try:
        for doc in await _load_collection_docs(db["marketplace_packages"], limit=300):
            if marketplace.hydrate_package(doc) is not None:
                counts["marketplace_packages"] += 1
        for doc in await _load_collection_docs(db["marketplace_installations"], limit=1000):
            pid = str(doc.get("project_id") or "").strip()
            pkg_id = str(doc.get("package_id") or "").strip()
            if pid and pkg_id:
                marketplace.hydrate_installation(pid, pkg_id)
                counts["marketplace_installations"] += 1
    except Exception:
        logger.debug("SkillMarketplaceRegistry hydration skipped", exc_info=True)

    # 5. Benchmark Harness persistence & hydration
    async def _persist_benchmark(report_doc: Dict[str, Any]) -> None:
        await db["benchmark_reports"].update_one(
            {"project_id": report_doc["project_id"], "suite_id": report_doc["suite_id"]},
            {"$set": report_doc},
            upsert=True,
        )

    benchmark_harness.attach_persister(_persist_benchmark)
    try:
        for doc in await _load_collection_docs(db["benchmark_reports"], limit=200):
            if benchmark_harness.hydrate_report(doc) is not None:
                counts["benchmark_reports"] += 1
    except Exception:
        logger.debug("MultiAgentBenchmarkHarness hydration skipped", exc_info=True)

    return counts
