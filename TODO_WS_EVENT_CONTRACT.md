# WebSocket Event Contract (work log)

Required Phase 1 events from QA:
- agent_start
- agent_update
- agent_complete
- build_start
- build_complete
- file_update
- preview_update
- error

Current end-to-end events present:
- agent_start
- agent_progress (frontend names it agent_progress)
- agent_complete
- file_update
- build_complete
- build_failed
- debug_start
- stream_token
- credits_update

Work needed:
1) Add missing enum values on backend: agent_update, build_start, preview_update, error
2) Update orchestrator to emit those events with payload fields expected by frontend store.
3) Update frontend wsContract runtime parsing + type definitions.
4) Update frontend store handleEvent mappings.

Status: queued (not executed yet).

Next code edits to execute (in this order):
1) backend/core/models.py: extend WSEventType with missing QA event names
2) backend/core/orchestrator.py: emit those events with matching payload schema
3) frontend/src/lib/wsContract.ts: extend WS_EVENT_TYPES + parseWSEvent
4) frontend/src/store/buildStore.ts: handleEvent mappings

(Step 1 next: execute backend/core/models.py edits.)

