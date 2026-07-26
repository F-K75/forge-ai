"""Knowledge Graph: connects agents, files, builds, and decisions for a
project so they can be traversed and searched instead of only queried one
collection at a time.

This is a read-time projection over existing data (agent_profiles + builds),
not a separately-maintained graph store -- there's nothing new to keep in
sync, and no write path to get wrong. It can be swapped for a persisted graph
(or a vector-search-backed `search`) later without changing the node/edge
shapes this returns.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from core.database import get_db

from .registry import AgentRegistry, get_agent_registry


class NodeType(str, Enum):
    AGENT = "agent"
    FILE = "file"
    BUILD = "build"
    DECISION = "decision"
    CHANGE_REQUEST = "change_request"
    MESSAGE = "message"
    REPOSITORY_MEMORY = "repository_memory"


class EdgeType(str, Enum):
    OWNS = "owns"  # agent -> file
    TOUCHED_IN = "touched_in"  # file -> build
    RAN_AS = "ran_as"  # build -> agent (a build stage executed as this agent)
    DECIDED = "decided"  # agent -> decision
    AUTHORED = "authored"  # agent -> change_request
    TOUCHES = "touches"  # change_request -> file
    SUGGESTED_REVIEWER = "suggested_reviewer"  # change_request -> agent
    SENT = "sent"  # agent -> message
    ADDRESSED_TO = "addressed_to"  # message -> agent
    UPDATED_BY = "updated_by"  # agent -> repository_memory (actor-as-source,
    # matching OWNS/AUTHORED/SENT/DECIDED: the agent that performed the
    # update is the edge source, the memory doc it updated is the target)


@dataclass
class GraphNode:
    id: str
    type: NodeType
    label: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GraphEdge:
    source: str
    target: str
    relation: EdgeType
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Graph:
    nodes: Dict[str, GraphNode] = field(default_factory=dict)
    edges: List[GraphEdge] = field(default_factory=list)

    def add_node(self, node: GraphNode) -> None:
        self.nodes.setdefault(node.id, node)

    def add_edge(self, edge: GraphEdge) -> None:
        self.edges.append(edge)

    def neighbors(self, node_id: str) -> List[GraphNode]:
        ids = set()
        for e in self.edges:
            if e.source == node_id:
                ids.add(e.target)
            elif e.target == node_id:
                ids.add(e.source)
        return [self.nodes[i] for i in ids if i in self.nodes]

    def search(self, query: str) -> List[GraphNode]:
        q = query.lower()
        return [
            n for n in self.nodes.values()
            if q in n.label.lower() or q in str(n.metadata).lower()
        ]


def _file_node_id(path: str) -> str:
    return f"file:{path}"


def _build_node_id(build_id: str) -> str:
    return f"build:{build_id}"


def _decision_node_id(agent_id: str, idx: int) -> str:
    return f"decision:{agent_id}:{idx}"


def _change_request_node_id(cr_id: str) -> str:
    return f"cr:{cr_id}"


def _message_node_id(msg_id: str) -> str:
    return f"msg:{msg_id}"


def _memory_node_id(memory_id: str) -> str:
    return f"memory:{memory_id}"


class KnowledgeGraphService:
    def __init__(self, registry: Optional[AgentRegistry] = None):
        self._registry = registry or get_agent_registry()

    async def build_for_project(self, project_id: str, max_builds: int = 200) -> Graph:
        graph = Graph()
        agents = await self._registry.list_agents(project_id)
        known_agent_ids = {a.id for a in agents}

        for agent in agents:
            graph.add_node(
                GraphNode(
                    id=agent.id,
                    type=NodeType.AGENT,
                    label=agent.display_name,
                    metadata={
                        "role": agent.role,
                        "department": agent.department,
                        "level": agent.level.value,
                        "status": agent.status.value,
                    },
                )
            )
            for path in agent.owned_paths:
                fid = _file_node_id(path)
                graph.add_node(GraphNode(id=fid, type=NodeType.FILE, label=path, metadata={"path": path}))
                graph.add_edge(GraphEdge(source=agent.id, target=fid, relation=EdgeType.OWNS))
            for idx, entry in enumerate(agent.decision_log):
                did = _decision_node_id(agent.id, idx)
                graph.add_node(
                    GraphNode(id=did, type=NodeType.DECISION, label=entry.get("event", "decision"), metadata=entry)
                )
                graph.add_edge(GraphEdge(source=agent.id, target=did, relation=EdgeType.DECIDED))

        db = await get_db()
        cursor = db.builds.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).limit(max_builds)
        builds = await cursor.to_list(length=max_builds)
        for build in builds:
            bid = _build_node_id(build["id"])
            graph.add_node(
                GraphNode(
                    id=bid,
                    type=NodeType.BUILD,
                    label=f"Build {build['id'][:8]}",
                    metadata={"status": build.get("status"), "prompt": (build.get("prompt") or "")[:200]},
                )
            )
            for step in build.get("agents", []):
                agent_profile_id = step.get("agent_profile_id")
                if agent_profile_id and agent_profile_id in known_agent_ids:
                    graph.add_edge(
                        GraphEdge(
                            source=bid, target=agent_profile_id, relation=EdgeType.RAN_AS,
                            metadata={"stage": step.get("agent")},
                        )
                    )
                for path in step.get("files_changed") or []:
                    fid = _file_node_id(path)
                    graph.add_node(GraphNode(id=fid, type=NodeType.FILE, label=path, metadata={"path": path}))
                    graph.add_edge(GraphEdge(source=fid, target=bid, relation=EdgeType.TOUCHED_IN))

        cursor = db.change_requests.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).limit(max_builds)
        change_requests = await cursor.to_list(length=max_builds)
        for cr in change_requests:
            crid = _change_request_node_id(cr["id"])
            graph.add_node(
                GraphNode(
                    id=crid,
                    type=NodeType.CHANGE_REQUEST,
                    label=cr["title"],
                    metadata={"stage": cr.get("stage"), "description": (cr.get("description") or "")[:200]},
                )
            )
            author_agent_id = cr.get("author_agent_id")
            if author_agent_id:
                graph.add_edge(GraphEdge(source=author_agent_id, target=crid, relation=EdgeType.AUTHORED))
            for path in cr.get("changed_paths") or []:
                fid = _file_node_id(path)
                graph.add_node(GraphNode(id=fid, type=NodeType.FILE, label=path, metadata={"path": path}))
                graph.add_edge(GraphEdge(source=crid, target=fid, relation=EdgeType.TOUCHES))
            for reviewer_agent_id in cr.get("suggested_reviewer_ids") or []:
                graph.add_edge(GraphEdge(source=crid, target=reviewer_agent_id, relation=EdgeType.SUGGESTED_REVIEWER))

        cursor = db.team_messages.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1).limit(max_builds)
        messages = await cursor.to_list(length=max_builds)
        for message in messages:
            mid = _message_node_id(message["id"])
            graph.add_node(
                GraphNode(
                    id=mid,
                    type=NodeType.MESSAGE,
                    label=message["content"][:80],
                    metadata={"message_type": message.get("message_type"), "thread_id": message.get("thread_id")},
                )
            )
            from_agent_id = message.get("from_agent_id")
            if from_agent_id:
                graph.add_edge(GraphEdge(source=from_agent_id, target=mid, relation=EdgeType.SENT))
            for to_agent_id in message.get("to_agent_ids") or []:
                graph.add_edge(GraphEdge(source=mid, target=to_agent_id, relation=EdgeType.ADDRESSED_TO))

        memory_doc = await db.repository_memory.find_one({"project_id": project_id}, {"_id": 0})
        if memory_doc:
            mem_id = _memory_node_id(memory_doc["id"])
            graph.add_node(
                GraphNode(
                    id=mem_id,
                    type=NodeType.REPOSITORY_MEMORY,
                    label="Repository Memory",
                    metadata={
                        "architecture_summary": (memory_doc.get("architecture_summary") or "")[:300],
                        "database_schema_notes": (memory_doc.get("database_schema_notes") or "")[:300],
                        "roadmap_notes": (memory_doc.get("roadmap_notes") or "")[:300],
                        "design_system_notes": (memory_doc.get("design_system_notes") or "")[:300],
                        "tech_stack": memory_doc.get("tech_stack") or [],
                        "known_issues": memory_doc.get("known_issues") or [],
                        "api_map": memory_doc.get("api_map") or [],
                    },
                )
            )
            updated_by_agent_id = memory_doc.get("updated_by_agent_id")
            if updated_by_agent_id:
                graph.add_edge(
                    GraphEdge(source=updated_by_agent_id, target=mem_id, relation=EdgeType.UPDATED_BY)
                )

        return graph

    async def neighbors(self, project_id: str, node_id: str) -> List[GraphNode]:
        graph = await self.build_for_project(project_id)
        return graph.neighbors(node_id)

    async def search(self, project_id: str, query: str) -> List[GraphNode]:
        graph = await self.build_for_project(project_id)
        return graph.search(query)


_kg_service: Optional[KnowledgeGraphService] = None


def get_knowledge_graph() -> KnowledgeGraphService:
    global _kg_service
    if _kg_service is None:
        _kg_service = KnowledgeGraphService()
    return _kg_service
