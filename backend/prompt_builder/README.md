# Prompt Builder

Centralized, provider-agnostic prompt generation for every agent in Forge.
Replaces per-agent hardcoded `system_prompt` strings with dynamic prompts
assembled from role + task + project state + relevant context.

## Architecture

```
PromptContext ──▶ PromptBuilder.build() ──▶ PromptResult(prompt, metadata)
                        │
   1. load_template (registry.py, keyed by (role, version))
   2. project_state / task already on the context
   3. context_selector.select() -- filters state/outputs to what the role needs
   4. template.render()          -- renders 7 sections, omitting empty ones
   5. validator.validate()       -- raises PromptValidationError on hard errors
   6. metadata assembled         -- tokens, sources, build time, hash
```

- `models.py` — `PromptContext`, `ProjectStateSlice`, `PromptResult`, `PromptMetadata`, `ValidationResult`.
- `templates/base.py` — `PromptTemplate` dataclass with 7 sections (Identity, Responsibilities, Goals, Constraints, Required Inputs, Output Format, Quality Rules) and `.render()`.
- `templates/<role>_v1.py` — one file per role, versioned by filename/module (`architect_v1`, `developer_v1`, …).
- `context_selector.py` — per-role filtering of project state so prompts stay small.
- `validator.py` — missing vars, empty context, invalid template, duplicate context, circular references.
- `token_estimator.py` — chars/4 heuristic, no external tokenizer dependency.
- `registry.py` — `TemplateRegistry`: list/get/create/update/delete, seeded from the static `TEMPLATE_REGISTRY`.
- `builder.py` — `PromptBuilder`, the pipeline above; pure in-memory, no I/O, `<20ms`.
- `plugins.py` — `PRE_BUILD` / `POST_BUILD` extension points for future compression, semantic retrieval, caching, model routing, budget/guardrail checks. No plugins ship by default.

## Using it from an agent

```python
class FooAgent(BaseAgent):
    agent_type = AgentType.FOO
    prompt_role = "foo"  # matches a registered template's `role`
```

`BaseAgent._resolve_system_prompt` (agents/base.py) checks `prompt_role`: if
set, it builds the system prompt via the Prompt Builder each call, using the
last user message as `task` and `extra_system` as `user_request`. If unset,
it falls back to the legacy `self.system_prompt` string unchanged — both
mechanisms coexist indefinitely, so migration has no cutover deadline.

To select a template variant other than `v1` for one call (e.g. Architect's
clarify pass), pass `prompt_template_version="clarify-v1"` to `run()` /
`stream()` / `_call_llm()`.

## REST API

See `backend/api/prompts.py` — `POST /prompts/build`, `/preview`,
`/validate`, `/estimate-tokens`, `GET /prompts/templates`,
`GET/POST/PUT/DELETE /prompts/templates/{role}/{version}` (write ops are
admin-gated).

## Migration

See `MIGRATION.md`.
