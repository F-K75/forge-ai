---
name: prompt-engineering
version: 1.0.0
domain: ai_engineering
description: System prompt design, few-shot examples, structured JSON outputs, and versioned prompt templates for LLM features.
keywords: [prompt, system prompt, few-shot, instruction, structured output, json schema, prompt template, llm, completion, tool use]
dependencies: []
permissions: [read_repo]
departments: [engineering, architecture, business, quality, security]
---
Treat prompts as versioned code: state the role, task, constraints, and output contract explicitly, and verify changes against an evaluation set.

## Checklist
- [ ] Open with role and goal, then constraints, then the exact output format.
- [ ] Separate trusted instructions from untrusted data with clear delimiters or tags.
- [ ] Prefer structured outputs (JSON schema / tool calling) over parsing free text.
- [ ] Validate model output against the schema; retry once with the validation error, then fail.
- [ ] Add 2-5 few-shot examples covering edge cases, not just the happy path.
- [ ] Say what to do when information is missing (ask, abstain, or use a default).
- [ ] Keep prompts in templates under version control with an id and version.
- [ ] Log prompt version, model, and parameters with each call for debugging.
- [ ] Pin temperature and model version for deterministic workflows.
- [ ] Re-run the eval set before shipping any prompt change.

## Pitfalls
- Contradictory instructions spread across system and user messages.
- Examples that leak the expected answer pattern too narrowly (overfitting).
- Silent truncation when the prompt exceeds the context window.
