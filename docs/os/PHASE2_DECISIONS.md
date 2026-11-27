# Phase 2 working decisions

These are provisional answers to the open questions in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md),
chosen to unblock Phase 2. Each one is reversible, and the owner can override any of them.

1. **A2UI:** target v1.0 only. No v0.9 compatibility layer.
2. **Home route:** the OS shell lives at `/os` and `/os/s/:sessionId`, behind `VITE_OS_SHELL`. The flag
   **defaults to on**; setting `VITE_OS_SHELL=false` restores the current behaviour. With the flag on,
   signed-in users land on `/os`. Every existing route keeps working. The Command Center dashboard is not
   shown by default; it is a capability that can be summoned (prompt, palette or library) and opens in a window.
3. **`data.analyze`:**
   - CSV and JSON, up to 5 MB and 50,000 rows. XLSX is out of scope for Phase 2.
   - Parsed on the server with the standard library; no pandas dependency.
   - Data is ephemeral: it is kept in the session's surface data model (`os_surfaces`) and expires with the session's event retention.
4. **`workflow.design`:** a designed workflow is a **kernel plan template** saved as a session artifact. There is
   no new workflow entity in Phase 2, and "Run" hands the template to the existing kernel.
5. **Model comparison:** non-admins can see provider names, model ids, tiers and public list prices from
   the router registry and optimizer pricing. They never see keys, quotas, health internals or org policy.
6. **Sessions:** private to the user (scoped by `user_id`; `org_id` is recorded for later sharing). They are kept
   until the user deletes them. Event replay is retained for 30 days, after which sessions restore from snapshots.
7. **Model selector:** a tier choice (Fast, Balanced or Best) that the router maps. Pinning an exact model is
   offered only on Pro and Enterprise plans and for BYOK users.
8. **AG-UI across workers:** bridge kernel events into the OS event log (Redis-backed, multi-worker) for OS
   sessions. Don't change `AGUIStreamBroker` in this phase.
9. **MCP Apps host bridge:** keep the current minimal, size-only bridge. Don't adopt `@modelcontextprotocol/ext-apps` yet.
10. **Voice:** the browser speech API only (`useVoiceToText`). No server-side transcription.
