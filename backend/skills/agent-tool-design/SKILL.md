---
name: agent-tool-design
version: 1.0.0
domain: agent_engineering
description: Designing agent-callable tools and MCP servers with tight schemas, safe side effects, and model-friendly results.
keywords: [tool, tools, function calling, tool call, tool schema, mcp, mcp server, tool use, agent tool, sandbox]
dependencies: [api-hardening]
permissions: [read_repo, write_code]
departments: [engineering, architecture]
---
Give agents few, well-named tools with strict input schemas, bounded and explainable outputs, and explicit confirmation for anything destructive.

## Checklist
- [ ] One tool per user-meaningful action; avoid both mega-tools and dozens of tiny ones.
- [ ] Name and describe tools for the model: what it does, when to use it, what it returns.
- [ ] Define JSON schemas with required fields, enums, and bounds; reject unknown fields.
- [ ] Validate and authorize inside the tool; never trust the model's arguments.
- [ ] Return concise, structured results with ids the model can reference next.
- [ ] Truncate or paginate large outputs and say so in the result.
- [ ] Return actionable error messages ("file not found: x; did you mean y") instead of stack traces.
- [ ] Make read tools side-effect free; make write tools idempotent where possible.
- [ ] Require human approval or a dry-run mode for destructive or costly actions.
- [ ] Run code-executing tools in a sandbox with time, memory, network, and filesystem limits.
- [ ] Log every call with arguments, caller, and outcome for audit.

## Pitfalls
- Tool outputs that contain instructions the model then follows (treat as untrusted data).
- Overlapping tools with ambiguous descriptions that the model picks between randomly.
