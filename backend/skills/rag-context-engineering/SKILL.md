---
name: rag-context-engineering
version: 1.0.0
domain: ai_engineering
description: Hybrid retrieval, chunking, embedding pipelines, prompt structuring, and citation grounding.
keywords: [rag, embedding, retrieval, llm, prompt, context, vector, ai]
dependencies: []
permissions: [read_repo]
departments: [engineering, architecture, leadership]
---
Bound retrieved context budgets, preserve source citations, and enforce grounded abstention when evidence is missing.

## Checklist
- [ ] Chunk by document structure (headings, functions, paragraphs), not fixed byte offsets alone.
- [ ] Store chunk metadata: source id, path/url, section, version/hash, tenant/project id.
- [ ] Combine lexical (BM25) and vector retrieval; rerank the merged candidates.
- [ ] Filter by tenant/project before ranking, never after.
- [ ] Enforce a token budget for retrieved context; drop lowest-ranked chunks first.
- [ ] Deduplicate near-identical chunks before they reach the prompt.
- [ ] Put instructions, retrieved evidence, and the user question in clearly delimited sections.
- [ ] Require citations to chunk ids and verify cited ids exist in the provided context.
- [ ] Instruct the model to say it does not know when evidence is missing.
- [ ] Re-embed on source change (hash comparison) and on embedding model change.

## Evaluate
- Track retrieval recall@k on a labelled question set and answer faithfulness separately.

## Pitfalls
- Cross-tenant leakage through a shared index without filters.
- Mixing embeddings from different models or dimensions in one index.
