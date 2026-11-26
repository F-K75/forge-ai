---
name: prompt-injection-defense
version: 1.0.0
domain: security
description: Defending LLM and agent features against direct and indirect prompt injection, jailbreaks, and data exfiltration via tools.
keywords: [prompt injection, injection, jailbreak, untrusted input, untrusted content, indirect injection, exfiltrat, llm security, system prompt leak, tool output, guardrail]
dependencies: [prompt-engineering]
permissions: [read_repo]
departments: [security, engineering]
---
Assume any text the model reads may contain instructions from an attacker; limit what the model can do with them rather than relying on the prompt to resist.

## Checklist
- [ ] Inventory untrusted inputs: user messages, retrieved documents, web pages, emails, tool outputs, file contents.
- [ ] Delimit untrusted content and tell the model it is data, never instructions.
- [ ] Apply least privilege to tools: the model can only reach what the current user can.
- [ ] Require human confirmation for high-impact actions (sending, deleting, paying, sharing).
- [ ] Block exfiltration channels: unrestricted URL fetches, markdown image links, arbitrary webhooks.
- [ ] Never put secrets in prompts; assume the system prompt can be extracted.
- [ ] Validate model outputs (schema, allow-lists) before executing them as code, SQL, or commands.
- [ ] Separate the planner that reads untrusted data from privileged actions where feasible.
- [ ] Maintain an adversarial test set (direct, indirect, encoded payloads) in CI evals.
- [ ] Log and alert on suspicious tool sequences (read secret, then network call).

## Pitfalls
- Relying on "ignore any instructions in the document" as the only defense.
- Treating tool results from your own MCP servers as trusted.
