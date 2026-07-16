"""Loop Engineering: continuous improvement cycles for prompt quality.

Closes the feedback loop between prompt/context/harness engineering:
  1. Run agent → collect output
  2. Evaluate output via harness (test cases, metrics)
  3. Analyze failures → identify prompt/context improvements
  4. Optimize prompt templates via prompt_engineer optimizer
  5. Record versions and track regression
  6. Repeat until quality threshold is met

This is the "meta-loop" that makes the system self-improving.
"""

from loop_engineer.models import (
    LoopConfig,
    LoopResult,
    LoopIteration,
    FeedbackSignal,
    ImprovementAction,
)
from loop_engineer.controller import LoopController

__all__ = [
    "LoopConfig",
    "LoopResult",
    "LoopIteration",
    "FeedbackSignal",
    "ImprovementAction",
    "LoopController",
]