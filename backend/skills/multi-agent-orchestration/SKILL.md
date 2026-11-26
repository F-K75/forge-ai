---
name: multi-agent-orchestration
version: 1.0.0
domain: agent_engineering
description: DAG wave scheduling, shared blackboard artifacts, bounded delegation, and self-healing critique loops.
keywords: [agent, multi-agent, dag, workflow, orchestrate, delegate, blackboard]
dependencies: []
permissions: [read_blackboard]
departments: [leadership, architecture, engineering]
---
Schedule independent tasks in parallel waves, validate acyclic dependencies, and cap delegation depth and repair rounds.

## Checklist
- [ ] Model work as a DAG of tasks with explicit `depends_on`; reject cycles before running.
- [ ] Group tasks into waves; run each wave concurrently with a bounded worker pool.
- [ ] Give every task one owner role, a clear objective, and a definition of done.
- [ ] Exchange results through typed blackboard artifacts, not free-form chat history.
- [ ] Pass each agent only the artifacts it needs (least context, least privilege).
- [ ] Cap delegation depth, total tasks, repair rounds, wall-clock time, and budget per run.
- [ ] Block downstream tasks when an upstream task fails; surface the root cause.
- [ ] Route critique to a different role than the author for self-healing loops.
- [ ] Emit structured events per task (started, skill activated, completed, failed) for tracing.
- [ ] Make runs resumable from the last completed wave.

## Pitfalls
- Agents delegating back to each other in an unbounded loop.
- Shared mutable state written by parallel tasks without ownership rules.
- Parallelizing tasks that secretly depend on each other's side effects.
