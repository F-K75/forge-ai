"""
Knowledge Service
Institutional memory for the AI Engineering Platform.
Captures, organizes, retrieves, versions, and distributes engineering knowledge.
"""

import json
import hashlib
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from enum import Enum
from dataclasses import dataclass, asdict
import logging


class KnowledgeCategory(Enum):
    ARCHITECTURE = "architecture"
    BUSINESS_RULES = "business_rules"
    SECURITY_DECISIONS = "security_decisions"
    CODING_STANDARDS = "coding_standards"
    TECHNOLOGY_STACK = "technology_stack"
    DEPENDENCIES = "dependencies"
    DATABASE_DESIGN = "database_design"
    API_CONTRACTS = "api_contracts"
    UI_GUIDELINES = "ui_guidelines"
    PERFORMANCE_OPTIMIZATIONS = "performance_optimizations"
    TESTING_STANDARDS = "testing_standards"
    DEPLOYMENT_POLICIES = "deployment_policies"
    KNOWN_BUGS = "known_bugs"
    KNOWN_RISKS = "known_risks"
    LESSONS_LEARNED = "lessons_learned"
    RUNBOOKS = "runbooks"
    CODING_PATTERNS = "coding_patterns"
    REUSABLE_COMPONENTS = "reusable_components"
    AGENT_CAPABILITIES = "agent_capabilities"
    TOOL_CAPABILITIES = "tool_capabilities"


class KnowledgeStatus(Enum):
    ACTIVE = "active"
    DEPRECATED = "deprecated"
    SUPERSEDED = "superseded"
    ARCHIVED = "archived"
    EXPERIMENTAL = "experimental"


class ConfidenceLevel(Enum):
    HIGH = 0.9
    MEDIUM = 0.6
    LOW = 0.3
    UNVERIFIED = 0.1


@dataclass
class KnowledgeItem:
    knowledge_id: str
    title: str
    category: str
    summary: str
    content: str
    confidence: float
    version: str
    source: str
    author_agent: str
    status: str
    created_at: str
    updated_at: str
    approved_by: Optional[str]
    related_items: List[str]
    tags: List[str]
    metadata: Dict[str, Any]

    def to_dict(self):
        return asdict(self)


@dataclass
class ArchitectureDecision:
    decision_id: str
    title: str
    context: str
    decision: str
    rationale: str
    consequences: str
    status: str
    created_at: str
    updated_at: str
    related_decisions: List[str]
    superseded_by: Optional[str]

    def to_dict(self):
        return asdict(self)


@dataclass
class ConflictReport:
    conflict_id: str
    type: str
    severity: str
    description: str
    items_in_conflict: List[str]
    detected_at: str
    resolution: Optional[str]
    resolved_at: Optional[str]

    def to_dict(self):
        return asdict(self)


class KnowledgeService:
    """
    Institutional memory for the AI Engineering Platform.
    Captures, organizes, retrieves, versions, and distributes knowledge.
    """
    
    def __init__(self, storage_path: str = "orchestration/knowledge_base"):
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        self.logger = logging.getLogger("KnowledgeService")
        
        # Knowledge storage
        self.knowledge_items: Dict[str, KnowledgeItem] = {}
        self.decisions: Dict[str, ArchitectureDecision] = {}
        self.conflicts: List[ConflictReport] = []
        
        # Indexes for fast retrieval
        self.category_index: Dict[str, List[str]] = {}
        self.tag_index: Dict[str, List[str]] = {}
        self.source_index: Dict[str, List[str]] = {}
        
        # Load existing knowledge
        self._load_knowledge()
    
    def _load_knowledge(self):
        """Load knowledge from storage."""
        knowledge_file = self.storage_path / "knowledge_items.json"
        if knowledge_file.exists():
            try:
                with open(knowledge_file) as f:
                    data = json.load(f)
                
                for item_data in data.get("items", []):
                    item = KnowledgeItem(**item_data)
                    self.knowledge_items[item.knowledge_id] = item
                    self._index_item(item)
                
                self.logger.info(f"Loaded {len(self.knowledge_items)} knowledge items")
            except Exception as e:
                self.logger.error(f"Failed to load knowledge: {e}")
        
        decisions_file = self.storage_path / "decisions.json"
        if decisions_file.exists():
            try:
                with open(decisions_file) as f:
                    data = json.load(f)
                
                for decision_data in data.get("decisions", []):
                    decision = ArchitectureDecision(**decision_data)
                    self.decisions[decision.decision_id] = decision
                
                self.logger.info(f"Loaded {len(self.decisions)} architecture decisions")
            except Exception as e:
                self.logger.error(f"Failed to load decisions: {e}")
    
    def _save_knowledge(self):
        """Save knowledge to storage."""
        try:
            knowledge_file = self.storage_path / "knowledge_items.json"
            data = {
                "version": "1.0",
                "last_updated": datetime.utcnow().isoformat() + "Z",
                "items": [item.to_dict() for item in self.knowledge_items.values()]
            }
            with open(knowledge_file, "w") as f:
                json.dump(data, f, indent=2)
            
            decisions_file = self.storage_path / "decisions.json"
            data = {
                "version": "1.0",
                "last_updated": datetime.utcnow().isoformat() + "Z",
                "decisions": [decision.to_dict() for decision in self.decisions.values()]
            }
            with open(decisions_file, "w") as f:
                json.dump(data, f, indent=2)
            
            self.logger.debug("Knowledge saved successfully")
        except Exception as e:
            self.logger.error(f"Failed to save knowledge: {e}")
    
    def _index_item(self, item: KnowledgeItem):
        """Index knowledge item for fast retrieval."""
        # Category index
        if item.category not in self.category_index:
            self.category_index[item.category] = []
        self.category_index[item.category].append(item.knowledge_id)
        
        # Tag index
        for tag in item.tags:
            if tag not in self.tag_index:
                self.tag_index[tag] = []
            self.tag_index[tag].append(item.knowledge_id)
        
        # Source index
        if item.source not in self.source_index:
            self.source_index[item.source] = []
        self.source_index[item.source].append(item.knowledge_id)
    
    def _generate_knowledge_id(self) -> str:
        """Generate unique knowledge ID."""
        return f"KNOW-{uuid.uuid4().hex[:8]}"
    
    def _generate_decision_id(self) -> str:
        """Generate unique decision ID."""
        return f"ADR-{uuid.uuid4().hex[:8]}"
    
    def add_knowledge(self, title: str, category: str, summary: str, content: str,
                     source: str, author_agent: str, confidence: float = 0.5,
                     tags: Optional[List[str]] = None, metadata: Optional[Dict[str, Any]] = None) -> KnowledgeItem:
        """
        Add new knowledge item.
        
        Args:
            title: Knowledge title
            category: Knowledge category
            summary: Brief summary
            content: Full content
            source: Source of knowledge
            author_agent: Agent that created this knowledge
            confidence: Confidence score (0.0-1.0)
            tags: List of tags
            metadata: Additional metadata
            
        Returns:
            Created knowledge item
        """
        knowledge_id = self._generate_knowledge_id()
        now = datetime.utcnow().isoformat() + "Z"
        
        item = KnowledgeItem(
            knowledge_id=knowledge_id,
            title=title,
            category=category,
            summary=summary,
            content=content,
            confidence=confidence,
            version="1.0",
            source=source,
            author_agent=author_agent,
            status=KnowledgeStatus.ACTIVE.value,
            created_at=now,
            updated_at=now,
            approved_by=None,
            related_items=[],
            tags=tags if tags is not None else [],
            metadata=metadata if metadata is not None else {}
        )
        
        self.knowledge_items[knowledge_id] = item
        self._index_item(item)
        self._save_knowledge()
        
        self.logger.info(f"Added knowledge: {knowledge_id} - {title}")
        return item
    
    def update_knowledge(self, knowledge_id: str, updates: Dict[str, Any],
                        author_agent: str) -> Optional[KnowledgeItem]:
        """
        Update existing knowledge item.
        
        Args:
            knowledge_id: Knowledge item ID
            updates: Dictionary of updates
            author_agent: Agent making the update
            
        Returns:
            Updated knowledge item or None if not found
        """
        item = self.knowledge_items.get(knowledge_id)
        if not item:
            return None
        
        # Update fields
        for key, value in updates.items():
            if hasattr(item, key):
                setattr(item, key, value)
        
        # Increment version
        version_parts = item.version.split(".")
        version_parts[-1] = str(int(version_parts[-1]) + 1)
        item.version = ".".join(version_parts)
        
        item.updated_at = datetime.utcnow().isoformat() + "Z"
        
        self._save_knowledge()
        
        self.logger.info(f"Updated knowledge: {knowledge_id} to version {item.version}")
        return item
    
    def deprecate_knowledge(self, knowledge_id: str, reason: str, author_agent: str) -> bool:
        """
        Mark knowledge as deprecated.
        
        Args:
            knowledge_id: Knowledge item ID
            reason: Reason for deprecation
            author_agent: Agent marking as deprecated
            
        Returns:
            True if successful, False otherwise
        """
        item = self.knowledge_items.get(knowledge_id)
        if not item:
            return False
        
        item.status = KnowledgeStatus.DEPRECATED.value
        item.metadata["deprecation_reason"] = reason
        item.metadata["deprecated_at"] = datetime.utcnow().isoformat() + "Z"
        item.metadata["deprecated_by"] = author_agent
        item.updated_at = datetime.utcnow().isoformat() + "Z"
        
        self._save_knowledge()
        
        self.logger.info(f"Deprecated knowledge: {knowledge_id}")
        return True
    
    def add_architecture_decision(self, title: str, context: str, decision: str,
                                  rationale: str, consequences: str,
                                  related_decisions: Optional[List[str]] = None) -> ArchitectureDecision:
        """
        Add architecture decision record (ADR).
        
        Args:
            title: Decision title
            context: Context and problem statement
            decision: Decision made
            rationale: Reasoning behind the decision
            consequences: Expected consequences
            related_decisions: Related decision IDs
            
        Returns:
            Created architecture decision
        """
        decision_id = self._generate_decision_id()
        now = datetime.utcnow().isoformat() + "Z"
        
        adr = ArchitectureDecision(
            decision_id=decision_id,
            title=title,
            context=context,
            decision=decision,
            rationale=rationale,
            consequences=consequences,
            status=KnowledgeStatus.ACTIVE.value,
            created_at=now,
            updated_at=now,
            related_decisions=related_decisions if related_decisions is not None else [],
            superseded_by=None
        )
        
        self.decisions[decision_id] = adr
        self._save_knowledge()
        
        self.logger.info(f"Added architecture decision: {decision_id} - {title}")
        return adr
    
    def get_knowledge(self, knowledge_id: str) -> Optional[KnowledgeItem]:
        """Get knowledge item by ID."""
        return self.knowledge_items.get(knowledge_id)
    
    def search(self, query: str, category: str = None, limit: int = 10) -> List[KnowledgeItem]:
        """
        Search knowledge base.
        
        Args:
            query: Search query
            category: Optional category filter
            limit: Maximum results
            
        Returns:
            List of matching knowledge items
        """
        results = []
        query_lower = query.lower()
        
        for item in self.knowledge_items.values():
            # Skip deprecated items
            if item.status == KnowledgeStatus.DEPRECATED.value:
                continue
            
            # Category filter
            if category and item.category != category:
                continue
            
            # Simple keyword matching (in production, use vector search)
            score = 0.0
            if query_lower in item.title.lower():
                score += 0.5
            if query_lower in item.summary.lower():
                score += 0.3
            if query_lower in item.content.lower():
                score += 0.2
            
            if score > 0:
                results.append((score, item))
        
        # Sort by score and confidence
        results.sort(key=lambda x: (x[0] * x[1].confidence), reverse=True)
        
        return [item for _, item in results[:limit]]
    
    def get_by_category(self, category: str, status: str = KnowledgeStatus.ACTIVE.value) -> List[KnowledgeItem]:
        """Get all knowledge items in a category."""
        item_ids = self.category_index.get(category, [])
        items = [self.knowledge_items[item_id] for item_id in item_ids if item_id in self.knowledge_items]
        return [item for item in items if item.status == status]
    
    def get_by_tag(self, tag: str) -> List[KnowledgeItem]:
        """Get all knowledge items with a specific tag."""
        item_ids = self.tag_index.get(tag, [])
        return [self.knowledge_items[item_id] for item_id in item_ids if item_id in self.knowledge_items]
    
    def get_by_source(self, source: str) -> List[KnowledgeItem]:
        """Get all knowledge items from a specific source."""
        item_ids = self.source_index.get(source, [])
        return [self.knowledge_items[item_id] for item_id in item_ids if item_id in self.knowledge_items]
    
    def get_decisions(self, status: str = KnowledgeStatus.ACTIVE.value) -> List[ArchitectureDecision]:
        """Get architecture decisions by status."""
        return [decision for decision in self.decisions.values() if decision.status == status]
    
    def get_decision(self, decision_id: str) -> Optional[ArchitectureDecision]:
        """Get architecture decision by ID."""
        return self.decisions.get(decision_id)
    
    def detect_conflicts(self) -> List[ConflictReport]:
        """
        Detect conflicting knowledge.
        
        Returns:
            List of conflict reports
        """
        conflicts = []
        
        # Check for contradictory architecture decisions
        decisions = list(self.decisions.values())
        for i, dec1 in enumerate(decisions):
            for dec2 in decisions[i+1:]:
                if dec1.status == KnowledgeStatus.ACTIVE.value and dec2.status == KnowledgeStatus.ACTIVE.value:
                    # Simple conflict detection (in production, use NLP)
                    if self._are_decisions_conflicting(dec1, dec2):
                        conflict = ConflictReport(
                            conflict_id=f"CONF-{uuid.uuid4().hex[:8]}",
                            type="architecture_decision",
                            severity="high",
                            description=f"Conflicting architecture decisions: {dec1.title} vs {dec2.title}",
                            items_in_conflict=[dec1.decision_id, dec2.decision_id],
                            detected_at=datetime.utcnow().isoformat() + "Z",
                            resolution=None,
                            resolved_at=None
                        )
                        conflicts.append(conflict)
        
        self.conflicts.extend(conflicts)
        return conflicts
    
    def _are_decisions_conflicting(self, dec1: ArchitectureDecision, dec2: ArchitectureDecision) -> bool:
        """Check if two decisions conflict (simplified)."""
        # In production, use NLP/semantic analysis
        # For now, check for overlapping keywords
        keywords1 = set(dec1.decision.lower().split())
        keywords2 = set(dec2.decision.lower().split())
        overlap = keywords1 & keywords2
        return len(overlap) > 3  # Arbitrary threshold
    
    def get_context_for_agent(self, agent_id: str, task_id: str, purpose: str) -> Dict[str, Any]:
        """
        Get relevant knowledge context for an agent.
        
        Args:
            agent_id: Agent requesting context
            task_id: Current task ID
            purpose: Purpose of context request
            
        Returns:
            Relevant knowledge context
        """
        # Extract keywords from purpose
        keywords = purpose.lower().split()
        
        # Search for relevant knowledge
        relevant_knowledge = []
        for keyword in keywords:
            items = self.search(keyword, limit=5)
            relevant_knowledge.extend(items)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_items = []
        for item in relevant_knowledge:
            if item.knowledge_id not in seen:
                seen.add(item.knowledge_id)
                unique_items.append(item)
        
        # Get recent architecture decisions
        recent_decisions = self.get_decisions()[:5]
        
        # Get related tasks (simplified - in production, use task graph)
        related_tasks = []
        
        # Get lessons learned
        lessons = self.get_by_category(KnowledgeCategory.LESSONS_LEARNED.value)[:5]
        
        # Get known risks
        risks = self.get_by_category(KnowledgeCategory.KNOWN_RISKS.value)[:5]
        
        return {
            "knowledge_request": {
                "request_id": f"REQ-{uuid.uuid4().hex[:8]}",
                "agent": agent_id,
                "purpose": purpose
            },
            "relevant_knowledge": [item.to_dict() for item in unique_items[:10]],
            "architecture_decisions": [dec.to_dict() for dec in recent_decisions],
            "coding_standards": [item.to_dict() for item in self.get_by_category(KnowledgeCategory.CODING_STANDARDS.value)[:5]],
            "business_rules": [item.to_dict() for item in self.get_by_category(KnowledgeCategory.BUSINESS_RULES.value)[:5]],
            "known_risks": [item.to_dict() for item in risks],
            "related_tasks": related_tasks,
            "lessons_learned": [item.to_dict() for item in lessons],
            "conflicts": [conflict.to_dict() for conflict in self.conflicts[-5:]],
            "recommended_documents": [],
            "references": [],
            "knowledge_updates": []
        }
    
    def capture_task_knowledge(self, task_id: str, agent_id: str, decision: str,
                               reason: str, implementation: str, validation: str,
                               outcome: str, lessons_learned: str) -> KnowledgeItem:
        """
        Capture knowledge from completed task.
        
        Args:
            task_id: Task ID
            agent_id: Agent that completed the task
            decision: Decision made
            reason: Reason for decision
            implementation: How it was implemented
            validation: How it was validated
            outcome: Result of implementation
            lessons_learned: Lessons learned
            
        Returns:
            Created knowledge item
        """
        content = f"""# Task Knowledge: {task_id}

## Decision
{decision}

## Reason
{reason}

## Implementation
{implementation}

## Validation
{validation}

## Outcome
{outcome}

## Lessons Learned
{lessons_learned}
"""
        
        return self.add_knowledge(
            title=f"Task {task_id} - {decision[:50]}",
            category=KnowledgeCategory.LESSONS_LEARNED.value,
            summary=f"Knowledge captured from task {task_id}",
            content=content,
            source=f"task:{task_id}",
            author_agent=agent_id,
            confidence=ConfidenceLevel.HIGH.value,
            tags=[task_id, agent_id, "task_knowledge"],
            metadata={
                "task_id": task_id,
                "agent_id": agent_id,
                "outcome": outcome
            }
        )
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get knowledge base statistics."""
        stats = {
            "total_items": len(self.knowledge_items),
            "total_decisions": len(self.decisions),
            "total_conflicts": len(self.conflicts),
            "by_category": {},
            "by_status": {},
            "by_source": {},
            "average_confidence": 0.0
        }
        
        # By category
        for category in KnowledgeCategory:
            count = len(self.category_index.get(category.value, []))
            if count > 0:
                stats["by_category"][category.value] = count
        
        # By status
        for item in self.knowledge_items.values():
            status = item.status
            stats["by_status"][status] = stats["by_status"].get(status, 0) + 1
        
        # By source
        for source, item_ids in self.source_index.items():
            stats["by_source"][source] = len(item_ids)
        
        # Average confidence
        if self.knowledge_items:
            total_confidence = sum(item.confidence for item in self.knowledge_items.values())
            stats["average_confidence"] = total_confidence / len(self.knowledge_items)
        
        return stats
    
    def export_knowledge(self, output_path: str):
        """Export knowledge base to file."""
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        
        export_data = {
            "version": "1.0",
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "statistics": self.get_statistics(),
            "knowledge_items": [item.to_dict() for item in self.knowledge_items.values()],
            "decisions": [decision.to_dict() for decision in self.decisions.values()],
            "conflicts": [conflict.to_dict() for conflict in self.conflicts]
        }
        
        with open(output, "w") as f:
            json.dump(export_data, f, indent=2)
        
        self.logger.info(f"Knowledge exported to {output}")


def create_knowledge_service(storage_path: str = "orchestration/knowledge_base") -> KnowledgeService:
    """Factory function to create KnowledgeService instance."""
    return KnowledgeService(storage_path)


def main():
    """Main entry point for Knowledge Service."""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: knowledge_service.py <command> [args...]")
        print("Commands: add, search, category, decision, stats, export")
        sys.exit(1)
    
    service = create_knowledge_service()
    command = sys.argv[1]
    
    if command == "add":
        # Interactive knowledge addition
        print("Adding knowledge item...")
        title = input("Title: ")
        print("Categories:", [c.value for c in KnowledgeCategory])
        category = input("Category: ")
        summary = input("Summary: ")
        content = input("Content: ")
        source = input("Source: ")
        author = input("Author Agent: ")
        
        item = service.add_knowledge(
            title=title,
            category=category,
            summary=summary,
            content=content,
            source=source,
            author_agent=author
        )
        print(f"Added: {item.knowledge_id}")
    
    elif command == "search":
        if len(sys.argv) < 3:
            print("Usage: knowledge_service.py search <query>")
            sys.exit(1)
        
        query = sys.argv[2]
        results = service.search(query)
        print(f"Found {len(results)} results:")
        for item in results:
            print(f"  {item.knowledge_id}: {item.title} (confidence: {item.confidence})")
    
    elif command == "category":
        if len(sys.argv) < 3:
            print("Usage: knowledge_service.py category <category>")
            sys.exit(1)
        
        category = sys.argv[2]
        items = service.get_by_category(category)
        print(f"Category '{category}' has {len(items)} items:")
        for item in items:
            print(f"  {item.knowledge_id}: {item.title}")
    
    elif command == "decision":
        decisions = service.get_decisions()
        print(f"Found {len(decisions)} architecture decisions:")
        for decision in decisions:
            print(f"  {decision.decision_id}: {decision.title}")
    
    elif command == "stats":
        stats = service.get_statistics()
        print(json.dumps(stats, indent=2))
    
    elif command == "export":
        output_path = sys.argv[2] if len(sys.argv) > 2 else "orchestration/knowledge_export.json"
        service.export_knowledge(output_path)
        print(f"Knowledge exported to {output_path}")
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()