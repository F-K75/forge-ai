# Migrating an agent to the Prompt Builder

All agents are migrated. `BaseAgent` still supports the old (`system_prompt`
string) and new (`prompt_role`) mechanisms simultaneously and indefinitely,
so a future agent can use either, but every agent currently in
`backend/agents/*.py` uses `prompt_role`.

## Steps, per agent

1. Add `backend/prompt_builder/templates/<role>_v1.py` with a `TEMPLATE =
   PromptTemplate(...)`, restructuring the agent's existing `system_prompt`
   string into the 7 sections (identity / responsibilities / goals /
   constraints / required_inputs / output_format / quality_rules). Preserve
   the original instruction text and output-format contract verbatim where
   possible — this is a refactor of structure, not of behavior.
2. Register it in `backend/prompt_builder/templates/__init__.py`'s
   `TEMPLATE_REGISTRY` under `(role, "v1")`.
3. On the agent class, set `prompt_role = "<role>"` and delete the
   `system_prompt` class attribute (and any module-level string it referenced).
4. If the agent needs more than one system prompt (like Architect's
   clarify vs. blueprint split), add a second `PromptTemplate` under
   `(role, "<variant>-v1")` in the same module and pass
   `prompt_template_version="<variant>-v1"` at the call site instead of
   defining a second `BaseAgent` subclass.
5. Run the agent's existing tests (or `pytest backend/tests -k <agent>`) to
   confirm no regression, and diff a sample `POST /prompts/build` response
   against the original hardcoded string to confirm no instruction content
   was lost.

## Migrated agents

`pm.py` (`product_manager`), `architect.py` (`architect` / `architect`
clarify-v1), `developer.py` (`developer`), `designer.py` (`designer`),
`business_analyst.py`, `prd_writer.py` (role `prd_writer` — distinct from
`product_manager`, which is `PMAgent`'s build-validation role),
`epic_generator.py`, `story_generator.py`, `task_generator.py`,
`sprint_planner.py`, `scrum_master.py`, `decision_engine.py`,
`integration.py`, `task_executor.py`.

Note: `qa_v1`, `security_v1`, `research_v1`, and `devops_v1` templates are
also seeded in the registry for future agents in those roles, even though no
current `backend/agents/*.py` file corresponds to them yet.
