"""Few-shot example management: curate, select, and inject few-shot examples
into prompts dynamically based on task similarity and diversity.

Supports fixed example sets (always include the same examples), semantic
selection (pick examples most similar to the current task), and diversity
selection (pick examples covering different patterns).
"""

from __future__ import annotations

from typing import Dict, List, Optional, Set

from prompt_engineer.models import FewShotExample, FewShotSet


class FewShotManager:
    """Manages few-shot example sets for prompt roles.

    Usage::

        fsm = FewShotManager()
        fsm.add_example(FewShotExample(
            example_id="dev-1", role="developer",
            input="Build a todo app", expected_output='{"files": {...}}',
        ))
        examples = fsm.select("developer", "Build a CRUD API", strategy="semantic")
        formatted = fsm.format_examples(examples)
    """

    def __init__(self) -> None:
        self._sets: Dict[str, FewShotSet] = {}
        self._examples: Dict[str, List[FewShotExample]] = {}  # role -> examples

    def add_example(self, example: FewShotExample) -> None:
        """Register a single few-shot example."""
        if example.role not in self._examples:
            self._examples[example.role] = []
        self._examples[example.role].append(example)

    def add_set(self, few_shot_set: FewShotSet) -> None:
        """Register a curated few-shot set."""
        self._sets[few_shot_set.set_id] = few_shot_set
        for ex in few_shot_set.examples:
            self.add_example(ex)

    def remove_example(self, example_id: str) -> bool:
        """Remove an example by ID. Returns True if found and removed."""
        for role, examples in self._examples.items():
            for i, ex in enumerate(examples):
                if ex.example_id == example_id:
                    examples.pop(i)
                    return True
        return False

    def get_examples(self, role: str) -> List[FewShotExample]:
        """Get all examples for a role."""
        return list(self._examples.get(role, []))

    def get_set(self, set_id: str) -> Optional[FewShotSet]:
        """Get a curated set by ID."""
        return self._sets.get(set_id)

    def select(
        self,
        role: str,
        task: str = "",
        strategy: str = "fixed",
        max_examples: int = 5,
        exclude_ids: Optional[Set[str]] = None,
    ) -> List[FewShotExample]:
        """Select the best few-shot examples for a given task.

        Args:
            role: Agent role to select examples for.
            task: Current task description (used for semantic matching).
            strategy: Selection strategy — "fixed", "semantic", or "diversity".
            max_examples: Maximum number of examples to return.
            exclude_ids: Example IDs to exclude (e.g., already used in context).

        Returns:
            Selected examples, ordered by relevance.
        """
        candidates = self._examples.get(role, [])
        if not candidates:
            return []

        exclude = exclude_ids or set()
        candidates = [c for c in candidates if c.example_id not in exclude]

        if strategy == "fixed":
            return candidates[:max_examples]

        if strategy == "semantic":
            return self._semantic_select(candidates, task, max_examples)

        if strategy == "diversity":
            return self._diversity_select(candidates, task, max_examples)

        return candidates[:max_examples]

    def format_examples(
        self, examples: List[FewShotExample], include_rationale: bool = False
    ) -> str:
        """Format few-shot examples into a string suitable for prompt injection.

        Args:
            examples: The examples to format.
            include_rationale: Whether to include the rationale for each example.

        Returns:
            Formatted string ready to append to a system prompt.
        """
        if not examples:
            return ""

        parts: List[str] = ["# Examples"]
        for i, ex in enumerate(examples, 1):
            block = f"## Example {i}\n"
            block += f"**Input:**\n{ex.input}\n\n"
            block += f"**Expected Output:**\n{ex.expected_output}"
            if include_rationale and ex.rationale:
                block += f"\n\n**Rationale:** {ex.rationale}"
            parts.append(block)

        return "\n\n".join(parts)

    def estimate_tokens(self, examples: List[FewShotExample]) -> int:
        """Estimate total tokens for a set of examples."""
        total = 0
        for ex in examples:
            if ex.token_count > 0:
                total += ex.token_count
            else:
                total += len(ex.input) // 4 + len(ex.expected_output) // 4
        return total

    def _semantic_select(
        self, candidates: List[FewShotExample], task: str, max_examples: int
    ) -> List[FewShotExample]:
        """Select examples by simple keyword overlap scoring.

        In production, this would use embedding similarity. Here we use
        a lightweight TF-style overlap score that's deterministic and
        doesn't require external services.
        """
        if not task:
            return candidates[:max_examples]

        task_tokens = set(task.lower().split())

        scored = []
        for ex in candidates:
            input_tokens = set(ex.input.lower().split())
            overlap = len(task_tokens & input_tokens)
            score = overlap / max(len(task_tokens), 1)
            scored.append((score, ex))

        scored.sort(key=lambda x: (-x[0], x[1].example_id))
        return [ex for _, ex in scored[:max_examples]]

    def _diversity_select(
        self, candidates: List[FewShotExample], task: str, max_examples: int
    ) -> List[FewShotExample]:
        """Select diverse examples covering different tags/patterns."""
        if not candidates:
            return []

        # Group by tags
        tag_groups: Dict[str, List[FewShotExample]] = {}
        for ex in candidates:
            tags = ex.tags or ["general"]
            for tag in tags:
                if tag not in tag_groups:
                    tag_groups[tag] = []
                tag_groups[tag].append(ex)

        # Pick one from each tag group, cycling until max_examples
        selected: List[FewShotExample] = []
        seen_ids: Set[str] = set()
        tag_order = sorted(tag_groups.keys())

        while len(selected) < max_examples:
            added = False
            for tag in tag_order:
                if len(selected) >= max_examples:
                    break
                for ex in tag_groups[tag]:
                    if ex.example_id not in seen_ids:
                        selected.append(ex)
                        seen_ids.add(ex.example_id)
                        added = True
                        break
            if not added:
                break

        return selected