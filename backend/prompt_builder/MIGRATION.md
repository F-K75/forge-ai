# Migrating an agent to the Prompt Builder

`PMAgent`, `ArchitectAgent`, and `DeveloperAgent` (`backend/agents/pm.py`,
`architect.py`, `developer.py`) are already migrated — use them as reference.
`BaseAgent` supports the old (`system_prompt` string) and new (`prompt_role`)
mechanisms simultaneously and indefinitely, so there is no deadline: migrate
one agent at a time, whenever convenient.

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

## Remaining agents to migrate

- [ ] `designer.py` (`DesignerAgent`) — template already seeded as `designer_v1`
- [ ] `business_analyst.py`
- [ ] `prd_writer.py`
- [ ] `epic_generator.py`
- [ ] `story_generator.py`
- [ ] `task_generator.py`
- [ ] `sprint_planner.py`
- [ ] `scrum_master.py`
- [ ] `decision_engine.py`
- [ ] `integration.py`
- [ ] `task_executor.py`

Note: `qa_v1`, `security_v1`, `research_v1`, and `devops_v1` templates are
also seeded in the registry for future agents in those roles, even though no
current `backend/agents/*.py` file corresponds to them yet.
