"""The EX-1 base matrix (docs/architecture/agent-collaboration-plan.md §16.4;
Revision 2 amended §11.4), shared by the closed-form proof in
test_pricing.py and the ledger-driven runs in test_build_ledger.py.

Dimensions, with N and Q taken from settings (3 and 3 today):

- funding: user_credits, byok, free_grant;
- clarifications: q = 0…Q questions, each answered, failed, timed out or
  interrupted (Σ 4^q = 85 for Q = 3);
- integrations: 0 or 1;
- PM/debug sequence: PM passes at pass k = 0…N, or never; each debug pass
  usable or a no-op (U6) (23 sequences for N = 3).

3 × 85 × 2 × 23 = 11,730 combinations. PR CI runs a fixed stratified 5%
sample plus every max-path combination; ``FORGE_EX_FULL=1`` runs all of them
(nightly).
"""

from __future__ import annotations

import itertools
import math
import os
import random
from dataclasses import dataclass
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

FUNDINGS = ("user_credits", "byok", "free_grant")
CLARIFICATION_OUTCOMES = ("answered", "failed", "timed_out", "interrupted")

FULL_MATRIX = bool(os.getenv("FORGE_EX_FULL"))
SAMPLE_FRACTION = 0.05
SAMPLE_SEED = 20261123


@dataclass(frozen=True)
class Combination:
    funding: str
    clarifications: Tuple[str, ...]
    integrations: bool
    # PM passes at this pass index (0 = first PM), or None: never passes.
    pass_at: Optional[int]
    # One flag per debug pass that runs: True = usable (changes files).
    debug_usable: Tuple[bool, ...]

    @property
    def id(self) -> str:
        clar = "-".join(c[0] for c in self.clarifications) or "none"
        dbg = "".join("u" if u else "n" for u in self.debug_usable) or "none"
        return f"{self.funding}|q={clar}|int={int(self.integrations)}|pass={self.pass_at}|dbg={dbg}"

    def stratum(self) -> Tuple:
        return (self.funding, self.integrations, len(self.clarifications), self.pass_at)

    def expected_completed(self, n: int) -> List[str]:
        """Stage keys of the operations that complete with usable output.
        Debug no-ops end FAILED (``no_change``) and are not listed."""
        keys = ["architect", "business_model", "designer", "developer"]
        if self.integrations:
            keys.append("integration")
        passes = (self.pass_at + 1) if self.pass_at is not None else (n + 1)
        keys.extend(f"pm#{k}" for k in range(passes))
        keys.extend(f"debug#{i + 1}" for i, usable in enumerate(self.debug_usable) if usable)
        return keys

    @property
    def answered(self) -> int:
        return sum(1 for c in self.clarifications if c == "answered")

    def is_max_path(self, n: int, q: int) -> bool:
        return (
            self.integrations
            and len(self.clarifications) == q
            and self.answered == q
            and len(self.debug_usable) == n
            and all(self.debug_usable)
        )


def pm_debug_sequences(n: int) -> List[Tuple[Optional[int], Tuple[bool, ...]]]:
    seqs: List[Tuple[Optional[int], Tuple[bool, ...]]] = []
    for pass_at in list(range(n + 1)) + [None]:
        debug_passes = pass_at if pass_at is not None else n
        for flags in itertools.product((True, False), repeat=debug_passes):
            seqs.append((pass_at, tuple(flags)))
    return seqs


def clarification_sequences(q: int) -> List[Tuple[str, ...]]:
    out: List[Tuple[str, ...]] = []
    for k in range(q + 1):
        out.extend(itertools.product(CLARIFICATION_OUTCOMES, repeat=k))
    return out


def all_combinations(n: int, q: int, fundings: Sequence[str] = FUNDINGS) -> List[Combination]:
    return [
        Combination(funding, clar, bool(integ), pass_at, flags)
        for funding in fundings
        for clar in clarification_sequences(q)
        for integ in (0, 1)
        for pass_at, flags in pm_debug_sequences(n)
    ]


def stratified_sample(
    items: Sequence[Combination],
    key: Callable[[Combination], Tuple] = Combination.stratum,
    fraction: float = SAMPLE_FRACTION,
    seed: int = SAMPLE_SEED,
    always: Callable[[Combination], bool] = lambda c: False,
) -> List[Combination]:
    """A fixed 5% sample of every stratum (at least one item each), plus
    every item ``always`` selects."""
    rng = random.Random(seed)
    groups: Dict[Tuple, List[Combination]] = {}
    for item in items:
        groups.setdefault(key(item), []).append(item)
    chosen: List[Combination] = []
    seen = set()
    for k in sorted(groups, key=repr):
        group = groups[k]
        size = max(1, math.ceil(len(group) * fraction))
        for item in rng.sample(group, size):
            if item.id not in seen:
                seen.add(item.id)
                chosen.append(item)
    for item in items:
        if always(item) and item.id not in seen:
            seen.add(item.id)
            chosen.append(item)
    return chosen


def matrix_for_ci(n: int, q: int, fundings: Iterable[str] = FUNDINGS) -> List[Combination]:
    items = all_combinations(n, q, tuple(fundings))
    if FULL_MATRIX:
        return items
    return stratified_sample(items, always=lambda c: c.is_max_path(n, q))
