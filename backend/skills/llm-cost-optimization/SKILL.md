---
name: llm-cost-optimization
version: 1.0.0
domain: ai_engineering
description: Reduce LLM spend and latency with model routing, prompt caching, batching, token budgets, and streaming.
keywords: [token cost, llm cost, cost, spend, budget, prompt caching, prompt cache, model routing, cheaper model, batch api, latency, tokens, streaming]
dependencies: [prompt-engineering]
permissions: [read_repo]
departments: [engineering, architecture]
---
Measure cost and latency per feature first, then route each request to the cheapest model that passes its eval bar and cut tokens that do not change the answer.

## Checklist
- [ ] Attribute token usage and cost per feature, tenant, and model in logs/metrics.
- [ ] Route simple tasks (classification, extraction) to small models; reserve large models for hard ones.
- [ ] Put stable content (system prompt, tool definitions, documents) first to maximize prompt-cache hits.
- [ ] Cap `max_tokens` per call and trim retrieved context to a budget.
- [ ] Use batch/asynchronous APIs for non-interactive workloads.
- [ ] Stream responses for interactive UX to cut time-to-first-token.
- [ ] Cache deterministic results (same input + prompt version) with a TTL.
- [ ] Enforce per-run and per-tenant budgets with a hard stop and a clear error.
- [ ] Verify every cost change against the eval set so quality does not silently drop.

## Pitfalls
- Changing a single byte at the start of the prompt and invalidating the cache.
- Retry loops that multiply spend on persistent failures.
- Optimizing average cost while p99 runaway agent loops dominate the bill.
