---
name: agent-failure-recovery
version: 1.0.0
domain: agent_engineering
description: Detecting stuck or failing agents and recovering with bounded repair loops, critique, escalation, and safe stops.
keywords: [self-heal, self-healing, repair loop, critique, stuck, infinite loop, agent failure, recover, escalat, max iterations, guardrail, human-in-the-loop]
dependencies: [multi-agent-orchestration, error-handling-resilience]
permissions: [read_repo, read_blackboard]
departments: [engineering, architecture]
---
Assume agents will fail: detect it from objective signals, repair within a fixed budget, and escalate to a human with context instead of looping.

## Checklist
- [ ] Define failure signals: failing tests, schema-invalid output, repeated identical actions, no progress.
- [ ] Cap iterations, repair rounds, tool calls, tokens, and wall-clock time per task.
- [ ] Detect loops by hashing recent actions/outputs and stopping on repeats.
- [ ] Feed the concrete failure (error text, failing test) into the repair prompt, not a vague "try again".
- [ ] Use a separate critic/reviewer role to judge outputs against acceptance criteria.
- [ ] Roll back partial side effects or mark them clearly when a task is abandoned.
- [ ] Escalate to a human with a summary: goal, attempts, last error, suggested next step.
- [ ] Record failure categories so recurring ones become eval cases or new guardrails.

## Pitfalls
- Repair loops that "fix" tests by weakening assertions; review test diffs.
- Silent partial success reported as completed.
- Retrying a non-transient failure with the same inputs.
