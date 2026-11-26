"""Cross-Run Knowledge & Episodic Memory Fabric for Forge AI's Agent Kernel.

Maintains a project-scoped knowledge graph (nodes + typed edges) and episodic
run memory so downstream multi-agent runs automatically inherit architecture
decisions, file ownership lessons, and repair patterns from earlier runs.

Pure-Python stdlib implementation with strict project-level tenant isolation
and an optional fail-open async persistence hook for MongoDB.
"""

from __future__ import annotations

import logging
import math
import re
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Set, Tuple

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9_/-]{2,}")
_STOPWORDS: Set[str] = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "your",
    "have",
    "will",
    "are",
    "was",
    "were",
    "been",
    "has",
    "had",
    "all",
    "any",
    "can",
    "run",
    "task",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _tokenize(text: str) -> List[str]:
    return [
        tok
        for tok in _TOKEN_RE.findall((text or "").lower())
        if tok not in _STOPWORDS and len(tok) >= 2
    ]


@dataclass
class KnowledgeNode:
    node_id: str
    project_id: str
    node_type: str  # episode | artifact | file | lesson | decision
    label: str
    summary: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class KnowledgeEdge:
    edge_id: str
    project_id: str
    source_id: str
    target_id: str
    relation: str  # produced | touched | repaired | learned_from
    created_at: str = field(default_factory=_utc_now)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class KnowledgeHit:
    node_id: str
    node_type: str
    label: str
    summary: str
    score: float
    related_labels: List[str] = field(default_factory=list)
    created_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


PersisterFn = Callable[[str, Dict[str, Any]], Awaitable[None]]


class KnowledgeFabric:
    """Tenant-isolated cross-run knowledge graph & hybrid episodic memory retriever."""

    def __init__(self, *, max_nodes_per_project: int = 500) -> None:
        self._max_nodes = max(50, max_nodes_per_project)
        self._nodes_by_project: Dict[str, Dict[str, KnowledgeNode]] = {}
        self._edges_by_project: Dict[str, List[KnowledgeEdge]] = {}
        self._persister: Optional[PersisterFn] = None

    def attach_persister(self, persister: PersisterFn) -> None:
        """Attach an optional fail-open async storage sink (e.g., MongoDB)."""
        self._persister = persister

    def hydrate_node(self, doc: Dict[str, Any]) -> Optional[KnowledgeNode]:
        """Restore a persisted KnowledgeNode document without re-triggering persistence."""
        project_id = str(doc.get("project_id") or "").strip()
        node_id = str(doc.get("node_id") or "").strip()
        if not project_id or not node_id:
            return None
        store = self._nodes_by_project.setdefault(project_id, {})
        node = KnowledgeNode(
            node_id=node_id,
            project_id=project_id,
            node_type=str(doc.get("node_type") or "artifact"),
            label=str(doc.get("label") or node_id)[:160],
            summary=str(doc.get("summary") or "")[:1200],
            metadata=dict(doc.get("metadata") or {}),
            created_at=str(doc.get("created_at") or _utc_now()),
        )
        store[node_id] = node
        if len(store) > self._max_nodes:
            oldest_key = next(iter(store))
            store.pop(oldest_key, None)
        return node

    def add_node(
        self,
        *,
        project_id: str,
        node_type: str,
        label: str,
        summary: str,
        metadata: Optional[Dict[str, Any]] = None,
        node_id: Optional[str] = None,
    ) -> KnowledgeNode:
        clean_project = (project_id or "").strip()
        if not clean_project:
            raise ValueError("project_id is required for KnowledgeFabric isolation")
        store = self._nodes_by_project.setdefault(clean_project, {})
        nid = node_id or _new_id("knode")
        node = KnowledgeNode(
            node_id=nid,
            project_id=clean_project,
            node_type=node_type,
            label=label[:160],
            summary=summary[:1200],
            metadata=dict(metadata or {}),
        )
        store[nid] = node
        if len(store) > self._max_nodes:
            oldest_key = next(iter(store))
            store.pop(oldest_key, None)
        return node

    def add_edge(
        self,
        *,
        project_id: str,
        source_id: str,
        target_id: str,
        relation: str,
    ) -> KnowledgeEdge:
        edges = self._edges_by_project.setdefault(project_id, [])
        edge = KnowledgeEdge(
            edge_id=_new_id("kedge"),
            project_id=project_id,
            source_id=source_id,
            target_id=target_id,
            relation=relation,
        )
        edges.append(edge)
        if len(edges) > self._max_nodes * 3:
            del edges[: len(edges) - self._max_nodes * 3]
        return edge

    async def ingest_kernel_run(self, run_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Extract episodic memory, artifact nodes, file links & repair lessons from a KernelRun."""
        project_id = str(run_dict.get("project_id") or "").strip()
        run_id = str(run_dict.get("id") or _new_id("run"))
        if not project_id:
            return {"ingested_nodes": 0, "ingested_edges": 0}

        objective = str(run_dict.get("objective") or "")
        status = str(run_dict.get("status") or "completed")
        metrics = run_dict.get("metrics") or {}
        cost = float(metrics.get("total_cost_usd") or 0.0)
        avg_q = float(metrics.get("avg_quality_score") or 0.0)

        ep_node = self.add_node(
            project_id=project_id,
            node_id=f"ep_{run_id}",
            node_type="episode",
            label=f"Run {run_id} ({status})",
            summary=(
                f"Objective: {objective[:260]} | Status: {status} | "
                f"Avg quality: {round(avg_q * 100)}% | Cost: ${cost:.4f}"
            ),
            metadata={
                "run_id": run_id,
                "status": status,
                "avg_quality_score": avg_q,
                "total_cost_usd": cost,
                "wave_count": metrics.get("wave_count", 0),
            },
        )
        created_nodes = 1
        created_edges = 0

        # Index published artifacts and link touched files
        for art in run_dict.get("artifacts") or []:
            art_id = str(art.get("artifact_id") or _new_id("art"))
            role = str(art.get("producer_role") or "agent")
            art_type = str(art.get("artifact_type") or "note")
            summary = str(art.get("summary") or "")
            art_node = self.add_node(
                project_id=project_id,
                node_id=f"art_{run_id}_{art_id}",
                node_type="artifact",
                label=f"{role} · {art_type}",
                summary=summary,
                metadata={"run_id": run_id, "role": role, "artifact_type": art_type},
            )
            self.add_edge(
                project_id=project_id,
                source_id=ep_node.node_id,
                target_id=art_node.node_id,
                relation="produced",
            )
            created_nodes += 1
            created_edges += 1

            for fp in art.get("touched_files") or []:
                clean_fp = str(fp).strip()
                if not clean_fp:
                    continue
                file_nid = f"file_{clean_fp}"
                if file_nid not in self._nodes_by_project.get(project_id, {}):
                    self.add_node(
                        project_id=project_id,
                        node_id=file_nid,
                        node_type="file",
                        label=clean_fp,
                        summary=f"Repository file modified by {role} in {run_id}",
                        metadata={"file_path": clean_fp, "last_role": role},
                    )
                    created_nodes += 1
                self.add_edge(
                    project_id=project_id,
                    source_id=art_node.node_id,
                    target_id=file_nid,
                    relation="touched",
                )
                created_edges += 1

        # Index critique-repair lessons learned
        for idx, cycle in enumerate(run_dict.get("repair_cycles") or []):
            findings = cycle.get("findings") or []
            messages = "; ".join(str(f.get("message") or "") for f in findings[:3])
            lesson_node = self.add_node(
                project_id=project_id,
                node_id=f"lesson_{run_id}_{idx}",
                node_type="lesson",
                label=f"Repair lesson ({cycle.get('reviewer_role')} -> {cycle.get('target_role')})",
                summary=f"Outcome: {cycle.get('outcome')}. Findings: {messages}",
                metadata={
                    "run_id": run_id,
                    "reviewer_role": cycle.get("reviewer_role"),
                    "target_role": cycle.get("target_role"),
                    "outcome": cycle.get("outcome"),
                },
            )
            self.add_edge(
                project_id=project_id,
                source_id=ep_node.node_id,
                target_id=lesson_node.node_id,
                relation="learned_from",
            )
            created_nodes += 1
            created_edges += 1

        if self._persister is not None:
            for node in list(self._nodes_by_project.get(project_id, {}).values()):
                if node.metadata.get("run_id") == run_id or node.node_id == ep_node.node_id:
                    try:
                        await self._persister(project_id, node.to_dict())
                    except Exception:
                        logger.debug("KnowledgeFabric persistence failed open", exc_info=True)

        return {
            "project_id": project_id,
            "run_id": run_id,
            "ingested_nodes": created_nodes,
            "ingested_edges": created_edges,
        }

    def retrieve_context(
        self,
        *,
        project_id: str,
        query: str,
        top_k: int = 5,
        max_chars: int = 2400,
    ) -> List[KnowledgeHit]:
        """Hybrid token-IDF + graph-degree + recency retrieval strictly scoped to project_id."""
        nodes = list(self._nodes_by_project.get(project_id, {}).values())
        if not nodes:
            return []

        q_tokens = set(_tokenize(query))
        edges = self._edges_by_project.get(project_id, [])
        node_index = {n.node_id: n for n in nodes}

        # Precompute adjacency labels & document frequencies
        neighbors: Dict[str, List[str]] = {}
        for edge in edges:
            if edge.source_id in node_index and edge.target_id in node_index:
                neighbors.setdefault(edge.source_id, []).append(node_index[edge.target_id].label)
                neighbors.setdefault(edge.target_id, []).append(node_index[edge.source_id].label)

        doc_tokens: Dict[str, Set[str]] = {}
        df: Dict[str, int] = {}
        for n in nodes:
            toks = set(_tokenize(f"{n.label} {n.summary} {n.node_type}"))
            doc_tokens[n.node_id] = toks
            for t in toks:
                df[t] = df.get(t, 0) + 1

        total_docs = max(1, len(nodes))
        scored: List[Tuple[float, KnowledgeNode]] = []
        for idx, n in enumerate(nodes):
            toks = doc_tokens[n.node_id]
            overlap = q_tokens & toks
            if q_tokens and not overlap:
                continue
            idf_score = sum(
                math.log((total_docs + 1.0) / (df.get(t, 1) + 0.5)) + 1.0 for t in overlap
            )
            # Boost repair lessons & episodes slightly for cross-run reuse
            type_boost = 1.25 if n.node_type == "lesson" else 1.1 if n.node_type == "episode" else 1.0
            recency_boost = 1.0 + (idx / max(1, total_docs)) * 0.15
            score = round((idf_score if q_tokens else 1.0) * type_boost * recency_boost, 3)
            scored.append((score, n))

        scored.sort(key=lambda pair: (-pair[0], pair[1].created_at), reverse=False)

        hits: List[KnowledgeHit] = []
        used_chars = 0
        for score, node in scored[: max(1, top_k)]:
            if used_chars + len(node.summary) > max_chars and hits:
                break
            used_chars += len(node.summary)
            hits.append(
                KnowledgeHit(
                    node_id=node.node_id,
                    node_type=node.node_type,
                    label=node.label,
                    summary=node.summary,
                    score=score,
                    related_labels=neighbors.get(node.node_id, [])[:4],
                    created_at=node.created_at,
                )
            )
        return hits

    def get_project_snapshot(self, project_id: str, *, limit: int = 25) -> Dict[str, Any]:
        nodes = list(self._nodes_by_project.get(project_id, {}).values())
        edges = self._edges_by_project.get(project_id, [])
        by_type: Dict[str, int] = {}
        for n in nodes:
            by_type[n.node_type] = by_type.get(n.node_type, 0) + 1
        return {
            "project_id": project_id,
            "node_count": len(nodes),
            "edge_count": len(edges),
            "counts_by_type": by_type,
            "recent_nodes": [n.to_dict() for n in nodes[-limit:][::-1]],
        }


_knowledge_fabric_singleton: Optional[KnowledgeFabric] = None


def get_knowledge_fabric() -> KnowledgeFabric:
    global _knowledge_fabric_singleton
    if _knowledge_fabric_singleton is None:
        _knowledge_fabric_singleton = KnowledgeFabric()
    return _knowledge_fabric_singleton
