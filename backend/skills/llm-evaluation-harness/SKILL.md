---
name: llm-evaluation-harness
version: 1.0.0
domain: ai_engineering
description: Offline and online evaluation of LLM features with golden datasets, graders, LLM-as-judge rubrics, and regression gates.
keywords: [eval, evaluation, evals, golden set, golden dataset, llm judge, llm-as-judge, hallucinat, rubric, grader, benchmark, faithfulness, accuracy]
dependencies: [prompt-engineering]
permissions: [read_repo, run_tests]
departments: [engineering, quality]
---
No prompt, model, or retrieval change ships without a measured comparison against a fixed evaluation set and an agreed pass threshold.

## Checklist
- [ ] Build a golden set (50-300 cases) from real traffic, covering edge cases and known failures.
- [ ] Record the expected answer or the properties a good answer must have.
- [ ] Use deterministic graders first (exact match, JSON schema, regex, unit tests on code).
- [ ] Use an LLM judge only with a written rubric, a fixed judge model, and spot-checked agreement.
- [ ] Score dimensions separately: correctness, faithfulness to sources, format, safety.
- [ ] Run baseline vs candidate on the same set and report deltas with sample failures.
- [ ] Gate CI on regressions beyond a threshold, not on absolute perfection.
- [ ] Track cost and latency per case alongside quality.
- [ ] Add every production incident as a new eval case.

## Pitfalls
- Evaluating on examples that also appear in few-shot prompts.
- Judge bias toward longer answers or its own model family.
- A single aggregate score that hides category regressions.
