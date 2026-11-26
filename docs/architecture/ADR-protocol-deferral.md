# ADR: Defer P2/P3 agent protocols

**Status:** Accepted · **Date:** 2026-11-26 · **Context:** [Vision vs. Implementation Audit](../VISION_IMPLEMENTATION_AUDIT.md), step 5

## Decision

Forge AI will **not** build adapters for the P2/P3 protocols until each one meets the
activation criteria below. Protocol work goes to the P0/P1 set, which is in progress:

| Priority | Protocols | Status |
|---|---|---|
| P0 | MCP, A2UI, AG-UI | Active |
| P1 | MCP Apps, A2A, AI SDK UI Stream | Active (AI SDK UI Stream not started) |
| **P2 (deferred)** | ACP, WebMCP, OASF | Watch list |
| **P3 (deferred)** | ANP, AP2, x402, UCP | Watch list |

## Rationale

- **Overlap.** ACP covers much the same ground as A2A, and OASF overlaps with A2A agent
  cards and our `SKILL.md` manifests. Building all of them would create several
  descriptions of the same capability that drift apart.
- **Maturity.** Most of these specs are early drafts with changing wire formats. An adapter
  built now would probably need rewriting.
- **No customer pull.** No user, design partner or integration currently needs any of them.
- **Risk.** AP2, x402 and UCP move money. Payment flows need their own threat model, approval
  gates and compliance review. They must not arrive as a side effect of protocol work.

## Activation criteria

A deferred protocol moves to active only when **all** of the following hold:

1. **Concrete demand:** a named user, partner or internal workflow is blocked without it.
2. **Spec stability:** a tagged release, or two or more independent production implementations.
3. **No adapter on an existing protocol covers it.** If A2A, MCP or the skill engine can
   cover the need by mapping, extend that adapter instead.
4. **Ownership:** someone owns the adapter, its tests and its upgrades.
5. **Payment protocols only (AP2, x402, UCP):** a threat model, mandatory human approval
   gates, per-org spend limits through the existing budget manager, and a legal and
   compliance sign-off.

## Implementation rule when activated

Each new protocol is an **adapter behind the Protocol Gateway** (`backend/core/protocol_gateway.py`).
It must reuse the gateway's audit, SSRF protection, auth and budget plumbing, and must not
add a parallel stack.

## Review

Revisit this decision quarterly, or sooner if an activation criterion is met.
