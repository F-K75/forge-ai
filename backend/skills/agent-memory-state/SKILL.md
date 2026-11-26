---
name: agent-memory-state
version: 1.0.0
domain: agent_engineering
description: Short- and long-term agent memory, context-window management, summarization, and checkpointed run state.
keywords: [memory, long-term memory, agent state, checkpoint, context window, summariz, conversation history, session state, persist, compaction]
dependencies: [rag-context-engineering]
permissions: [read_repo, read_blackboard]
departments: [engineering, architecture]
---
Keep the working context small and relevant: persist durable facts and run state outside the prompt, and retrieve or summarize them deliberately.

## Checklist
- [ ] Separate memory types: working context, run state (checkpoints), and long-term facts.
- [ ] Checkpoint run state after each step so a crashed run resumes instead of restarting.
- [ ] Budget the context window; summarize or drop old turns before hitting the limit.
- [ ] Keep summaries factual (decisions, open questions, artifacts) and link to sources.
- [ ] Store long-term memories with provenance, timestamp, scope (user/project), and TTL.
- [ ] Retrieve memories by relevance to the current task, not by recency alone.
- [ ] Scope memory per tenant/project; never share across tenants.
- [ ] Let users inspect and delete stored memories.
- [ ] Never store secrets or raw credentials in memory.

## Pitfalls
- Summaries that drop constraints the user stated early on.
- Stale memories overriding fresh information; prefer newer facts on conflict.
- Unbounded memory growth that slows retrieval and raises cost.
