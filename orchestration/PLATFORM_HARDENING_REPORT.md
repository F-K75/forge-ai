# Platform Hardening Report - Orchestration Engine

## Executive Summary

Analysis of the orchestration platform identified **13 critical P0 infrastructure issues** that prevent production readiness. The platform currently uses JSON file-based storage without concurrency controls, lacks worker lifecycle management, and has no protection against duplicate execution or task starvation.

## Current Architecture Assessment

### Strengths
- Modular component design with clear separation of concerns
- Event-driven architecture with pub/sub pattern
- Comprehensive metrics tracking framework
- Recovery checkpoint mechanism exists

### Critical Deficiencies

| Issue | Severity | Status |
|-------|----------|--------|
| File locking missing | P0 | Confirmed |
| Atomic task claiming | P0 | Confirmed |
| Lease-based ownership | P0 | Not Implemented |
| Heartbeats | P0 | Not Implemented |
| Worker timeout detection | P0 | Not Implemented |
| Automatic task recovery | P0 | Partial (engine-level only) |
| Circular dependency detection | P0 | Not Implemented |
| Event idempotency | P0 | Not Implemented |
| Atomic checkpoint writing | P0 | Confirmed |
| Checkpoint integrity verification | P0 | Not Implemented |
| Scheduler optimization | P0 | Confirmed |
| Queue starvation prevention | P0 | Not Implemented |
| Duplicate execution prevention | P0 | Not Implemented |

## Production Readiness Score: **23/100**

### Score Breakdown
- **Concurrency Safety**: 0/25 - No file locking, race conditions everywhere
- **Fault Tolerance**: 8/25 - Basic recovery exists but incomplete
- **Worker Management**: 0/25 - No heartbeats, timeouts, or lease mechanisms
- **Data Integrity**: 5/25 - JSON writes without atomicity or verification
- **Scalability**: 10/25 - No starvation prevention or duplicate prevention

---

# Sprint 0 Backlog

## PLAT-001: File Locking for JSON Persistence

```json
{
  "id": "PLAT-001",
  "title": "Implement file locking for all JSON state file operations",
  "severity": "P0",
  "category": "Concurrency",
  "business_impact": "Race conditions cause data corruption, lost updates, and inconsistent task states under concurrent access",
  "technical_root_cause": "helpers.py uses plain open() without any locking; multiple threads/processes can read/write simultaneously causing TOCTOU races",
  "affected_components": ["helpers.py", "all engine components"],
  "affected_files": ["orchestration/helpers.py"],
  "dependencies": [],
  "estimated_hours": 16,
  "implementation_strategy": "Introduce SQLite-backed storage with ACID transactions replacing JSON file operations, with optional file lock fallback for compatibility",
  "acceptance_criteria": [
    "All read/write operations to TASK_REGISTRY.json are protected by exclusive locks",
    "Concurrent writes do not result in data loss or corruption",
    "Read operations are atomic snapshots",
    "Lock timeout prevents indefinite blocking"
  ],
  "validation_plan": [
    "Run 20 concurrent update_task() calls on same task",
    "Verify no data loss or corruption in TASK_REGISTRY.json",
    "Stress test with 100 parallel workers updating different tasks"
  ],
  "rollback_strategy": "Revert to previous helpers.py; disable concurrent engine instances"
}
```

## PLAT-002: Atomic Task Claiming with Compare-and-Swap

```json
{
  "id": "PLAT-002",
  "title": "Implement atomic task claiming to prevent duplicate dispatch",
  "severity": "P0",
  "category": "Task Ownership",
  "business_impact": "Same task can be dispatched to multiple agents simultaneously causing duplicate work and inconsistent states",
  "technical_root_cause": "dispatcher.dispatch() calls assign_task() which does read-modify-write without atomicity check",
  "affected_components": ["dispatcher.py", "helpers.py", "scheduler.py"],
  "affected_files": ["orchestration/engine/dispatcher.py", "orchestration/helpers.py"],
  "dependencies": ["PLAT-001"],
  "estimated_hours": 8,
  "implementation_strategy": "Add expected_status parameter to update_task(); verify old status matches before claim; return failure if mismatch",
  "acceptance_criteria": [
    "Multiple dispatchers calling dispatch() on same task results in exactly one claiming success",
    "Other dispatchers receive distinct error/failure indication",
    "Task ownership is recorded atomically"
  ],
  "validation_plan": [
    "Spin up 10 dispatcher threads on same READY task",
    "Verify exactly one succeeds, others receive failure",
    "Verify task.owner is set correctly"
  ],
  "rollback_strategy": "Remove atomic claim logic; accept duplicate dispatch risk for single-instance operation"
}
```

## PLAT-003: Lease-Based Task Ownership with TTL

```json
{
  "id": "PLAT-003",
  "title": "Implement lease-based task ownership with TTL expiration",
  "severity": "P0",
  "category": "Task Ownership",
  "business_impact": "Tasks claimed by crashed/misbehaving workers remain stuck indefinitely, blocking workflow progress",
  "technical_root_cause": "No ownership expiration mechanism; once assigned, task stays in ASSIGNED until explicitly transitioned",
  "affected_components": ["helpers.py", "scheduler.py", "dispatcher.py"],
  "affected_files": ["orchestration/helpers.py", "orchestration/engine/scheduler.py"],
  "dependencies": ["PLAT-002"],
  "estimated_hours": 12,
  "implementation_strategy": "Add lease_expires_at timestamp to task; scheduler returns expired tasks to READY; heartbeat extends lease",
  "acceptance_criteria": [
    "Tasks with expired leases are automatically returned to READY state",
    "Heartbeat extends lease by configured interval",
    "Lease expiration is checked during scheduling",
    "Expired task history records lease timeout event"
  ],
  "validation_plan": [
    "Create task, assign with 5-second lease",
    "Wait 6 seconds without heartbeat",
    "Verify task is returned to READY state",
    "Verify original owner no longer owns task"
  ],
  "rollback_strategy": "Remove lease expiration checks; manual task recovery only"
}
```

## PLAT-004: Worker Heartbeat Mechanism

```json
{
  "id": "PLAT-004",
  "title": "Implement heartbeat endpoint for worker liveness detection",
  "severity": "P0",
  "category": "Worker Management",
  "business_impact": "Dead workers continue to hold task ownership silently, causing workflow to stall",
  "technical_root_cause": "No periodic worker check-in; state machine has no liveness awareness",
  "affected_components": ["api.py", "scheduler.py", "helpers.py"],
  "affected_files": ["orchestration/api.py", "orchestration/helpers.py", "orchestration/engine/scheduler.py"],
  "dependencies": ["PLAT-003"],
  "estimated_hours": 8,
  "implementation_strategy": "Add POST /orchestration/engine/heartbeat endpoint; workers call periodically; scheduler extends lease on valid heartbeat",
  "acceptance_criteria": [
    "Workers can send heartbeat with their task ID",
    "Valid heartbeat extends task lease by TTL interval",
    "Heartbeat fails if worker doesn't own task",
    "Heartbeat is rate-limited per worker"
  ],
  "validation_plan": [
    "Start task ownership",
    "Send heartbeat every 3 seconds",
    "Verify lease extends each time",
    "Stop heartbeats and verify expiration triggers"
  ],
  "rollback_strategy": "Disable heartbeat verification; rely on manual lease tuning"
}
```

## PLAT-005: Worker Timeout Detection and Recovery

```json
{
  "id": "PLAT-005",
  "title": "Implement automatic worker timeout detection and task recovery",
  "severity": "P0",
  "category": "Fault Tolerance",
  "business_impact": "Worker crashes result in orphaned tasks that never complete, requiring manual intervention",
  "technical_root_cause": "recovery.py only handles engine-level recovery; no worker-level timeout detection",
  "affected_components": ["scheduler.py", "recovery.py", "helpers.py"],
  "affected_files": ["orchestration/engine/scheduler.py", "orchestration/engine/recovery.py"],
  "dependencies": ["PLAT-004"],
  "estimated_hours": 12,
  "implementation_strategy": "Add timeout_checker to scheduler; scan for expired leases; reset to READY/ASSIGNED; publish RECOVERY_NEEDED event",
  "acceptance_criteria": [
    "Tasks with expired leases are automatically detected within 30 seconds",
    "Expired tasks are reset to ASSIGNED state for re-dispatch",
    "Recovery event is published for monitoring",
    "Original owner is removed from task"
  ],
  "validation_plan": [
    "Assign task with 5-second lease",
    "Kill worker without extending lease",
    "Wait for timeout detection",
    "Verify task reset and re-dispatch"
  ],
  "rollback_strategy": "Increase lease timeout to maximum; disable auto-recovery"
}
```

## PLAT-006: Circular Dependency Detection

```json
{
  "id": "PLAT-006",
  "title": "Implement circular dependency detection to prevent infinite loops",
  "severity": "P0",
  "category": "Scheduling",
  "business_impact": "Circular task dependencies cause infinite recursion in get_dependency_chain() and scheduler starvation",
  "technical_root_cause": "dependency_resolver.get_dependency_chain() has visited set but doesn't detect cycles in task definitions themselves",
  "affected_components": ["dependency_resolver.py"],
  "affected_files": ["orchestration/engine/dependency_resolver.py"],
  "dependencies": [],
  "estimated_hours": 6,
  "implementation_strategy": "Add cycle detection in resolve_dependencies(); detect A→B→A patterns; mark tasks with cycles as blocked with clear error",
  "acceptance_criteria": [
    "Circular dependencies are detected in O(n) time",
    "Tasks with circular deps return 'blocked' status with reason",
    "No infinite loops in dependency resolution",
    "Cycle information stored in task warnings"
  ],
  "validation_plan": [
    "Create tasks A depends on B, B depends on A",
    "Call can_execute() on both tasks",
    "Verify both return blocked with cycle error",
    "Verify no stack overflow or infinite loop"
  ],
  "rollback_strategy": "Remove cycle detection; accept infinite loop risk for trusted task definitions"
}
```

## PLAT-007: Event Idempotency

```json
{
  "id": "PLAT-007",
  "title": "Implement event deduplication and idempotency",
  "severity": "P0",
  "category": "Event Processing",
  "business_impact": "Duplicate events cause duplicate state transitions, duplicate task dispatch, and inconsistent metrics",
  "technical_root_cause": "event_bus.publish() never checks if identical event was already processed; handlers execute regardless",
  "affected_components": ["event_bus.py", "workflow_engine.py"],
  "affected_files": ["orchestration/engine/event_bus.py"],
  "dependencies": [],
  "estimated_hours": 8,
  "implementation_strategy": "Add event deduplication window; track recent event_ids; skip if duplicate within 5-second window",
  "acceptance_criteria": [
    "Duplicate events within deduplication window are ignored",
    "Event_id uniqueness is enforced per task+type+timestamp window",
    "Deduplication is bounded (max 1000 recent events)",
    "Duplicate detection is O(1) lookup"
  ],
  "validation_plan": [
    "Publish same event 10 times rapidly",
    "Verify handler called once",
    "Verify duplicate count in stats",
    "Verify original event preserved"
  ],
  "rollback_strategy": "Disable deduplication; accept duplicate processing risk"
}
```

## PLAT-008: Atomic Checkpoint Writing

```json
{
  "id": "PLAT-008",
  "title": "Implement atomic checkpoint writes with write-ahead log",
  "severity": "P0",
  "category": "Recovery",
  "business_impact": "Partial checkpoint writes due to crashes cause unrecoverable state and data loss",
  "technical_root_cob": "recovery.py writes checkpoint directly to file without atomic write guarantee; crash during write corrupts checkpoint",
  "affected_components": ["recovery.py"],
  "affected_files": ["orchestration/engine/recovery.py"],
  "dependencies": [],
  "estimated_hours": 10,
  "implementation_strategy": "Write to temp file with checksum; verify write complete; atomic rename; keep previous checkpoint as backup",
  "acceptance_criteria": [
    "Checkpoint writes use atomic rename pattern",
    "Corrupted checkpoints are detected and skipped",
    "Previous checkpoint retained until new one verified",
    "Checksum verification on checkpoint load"
  ],
  "validation_plan": [
    "Create large checkpoint during active workflow",
    "Kill process mid-write",
    "Restart and verify recovery uses previous checkpoint",
    "Verify no corrupted checkpoint loaded"
  ],
  "rollback_strategy": "Disable atomic writes; accept partial write corruption risk"
}
```

## PLAT-009: Checkpoint Integrity Verification

```json
{
  "id": "PLAT-009",
  "title": "Implement checksum and schema validation for checkpoints",
  "severity": "P0",
  "category": "Recovery",
  "business_impact": "Corrupted or tampered checkpoints cause recovery failures or security vulnerabilities",
  "technical_root_cause": "recovery.py loads checkpoints without verification; any JSON is accepted as valid",
  "affected_components": ["recovery.py"],
  "affected_files": ["orchestration/engine/recovery.py"],
  "dependencies": ["PLAT-008"],
  "estimated_hours": 6,
  "implementation_strategy": "Add SHA256 checksum to checkpoint; verify on load; validate schema before restore",
  "acceptance_criteria": [
    "Checkpoints include SHA256 checksum of content",
    "Checksum is verified before recovery load",
    "Schema validation ensures all required fields present",
    "Invalid checkpoints are rejected with clear error"
  ],
  "validation_plan": [
    "Create valid checkpoint",
    "Corrupt file externally",
    "Attempt recovery",
    "Verify rejection with checksum error",
    "Verify clean checkpoint still recovers"
  ],
  "rollback_strategy": "Skip checksum verification; trust checkpoint integrity"
}
```

## PLAT-010: Scheduler Optimization and Fairness

```json
{
  "id": "PLAT-010",
  "title": "Implement fair task scheduling to prevent starvation",
  "severity": "P0",
  "category": "Scheduling",
  "business_impact": "High-priority tasks starve out lower-priority ones; same tasks may never be dispatched under load",
  "technical_root_cause": "scheduler._score_tasks() always returns same order; no round-robin or fairness mechanism",
  "affected_components": ["scheduler.py"],
  "affected_files": ["orchestration/engine/scheduler.py"],
  "dependencies": [],
  "estimated_hours": 8,
  "implementation_strategy": "Add task age factor to scoring; implement fair queuing; track last dispatch time; boost older READY tasks",
  "acceptance_criteria": [
    "Tasks waiting > 60s get priority boost",
    "No task waits > 5 minutes without dispatch opportunity",
    "Same priority tasks get round-robin distribution",
    "Fairness factor is configurable weight"
  ],
  "validation_plan": [
    "Create 100 READY tasks with P3 priority",
    "Add one P0 task",
    "Run scheduler for 5 minutes",
    "Verify low-priority tasks are dispatched",
    "Verify no task older than 5 minutes unhandled"
  ],
  "rollback_strategy": "Disable fairness boost; accept potential starvation"
}
```

## PLAT-011: Queue Starvation Prevention

```json
{
  "id": "PLAT-011",
  "title": "Implement queue starvation prevention with guaranteed minimum dispatch rate",
  "severity": "P0",
  "category": "Scheduling",
  "business_impact": "Low-priority tasks may never execute under continuous high-priority load, causing workflow stagnation",
  "technical_root_cause": "scheduler.get_next_task() always returns highest-scoring task; no minimum throughput guarantee for any priority",
  "affected_components": ["scheduler.py"],
  "affected_files": ["orchestration/engine/scheduler.py"],
  "dependencies": ["PLAT-010"],
  "estimated_hours": 6,
  "implementation_strategy": "Add priority slot allocation; reserve N% of capacity for each priority level; implement weighted fair queuing",
  "acceptance_criteria": [
    "Each priority level gets minimum dispatch slots",
    "P0: 50%, P1: 30%, P2: 15%, P3: 5% of capacity",
    "Starved tasks eventually get dispatch opportunity",
    "Slot allocation is configurable"
  ],
  "validation_plan": [
    "Create 50 P0 tasks and 50 P3 tasks",
    "Run scheduler for 10 minutes",
    "Verify P3 tasks are dispatched within time window",
    "Verify slot allocation ratios approximately met"
  ],
  "rollback_strategy": "Disable slot allocation; FIFO within priority score ordering"
}
```

## PLAT-012: Duplicate Execution Prevention

```json
{
  "id": "PLAT-012",
  "title": "Implement duplicate execution prevention across engine restarts",
  "severity": "P0",
  "category": "Task Execution",
  "business_impact": "Task completion events may be reprocessed on recovery, causing duplicate agent execution and side effects",
  "technical_root_cause": "No execution tracking; events reprocessed; agents called multiple times for same completion",
  "affected_components": ["recovery.py", "dispatcher.py", "workflow_engine.py"],
  "affected_files": ["orchestration/engine/recovery.py", "orchestration/engine/dispatcher.py"],
  "dependencies": ["PLAT-009"],
  "estimated_hours": 10,
  "implementation_strategy": "Add execution_log with task+agent+transition tuples; check before dispatch; prevent re-execution of completed transitions",
  "acceptance_criteria": [
    "Each (task_id, agent_name, transition) tuple stored in execution log",
    "Re-dispatch check fails if tuple already processed",
    "Replay protection survives engine restart",
    "Log is bounded (last 10000 entries)"
  ],
  "validation_plan": [
    "Dispatch task to agent and complete",
    "Restart engine (simulated recovery)",
    "Verify task not re-dispatched to same agent",
    "Verify transition history preserved"
  ],
  "rollback_strategy": "Disable duplicate prevention; accept re-execution risk for idempotent operations"
}
```

## PLAT-013: Task Registry Concurrency Protection

```json
{
  "id": "PLAT-013",
  "title": "Implement write-once task lifecycle with immutable history",
  "severity": "P0",
  "category": "Data Integrity",
  "business_impact": "History entries can be lost or duplicated under high concurrency; task data can be corrupted",
  "technical_root_cause": "update_task() does not use atomic operations; history append is not protected from race conditions",
  "affected_components": ["helpers.py", "state_machine.py"],
  "affected_files": ["orchestration/helpers.py"],
  "dependencies": ["PLAT-001"],
  "estimated_hours": 8,
  "implementation_strategy": "Add transaction log for task updates; enforce immutability of history; use atomic file writes; add version field",
  "acceptance_criteria": [
    "Each task update creates entry in transaction log",
    "History cannot be modified after fact",
    "Updates are replayable from transaction log",
    "Concurrent updates are serialized"
  ],
  "validation_plan": [
    "Apply 50 concurrent random updates to same task",
    "Verify all updates applied in deterministic order",
    "Verify no history entries lost",
    "Verify task state consistent after recovery"
  ],
  "rollback_strategy": "Disable transaction log; rely on JSON integrity"
}
```

---

# Migration Roadmap

## Phase 0: Foundation (Week 1)
1. **Introduce SQLite Abstraction Layer** (`orchestration/storage.py`)
   - Create StorageInterface abstract class
   - Implement SQLiteStorage with ACID transactions
   - Keep JSONStorage as fallback

2. **Dual Write Compatibility**
   - All writes go to both SQLite and JSON
   - Reads prefer SQLite, fallback to JSON
   - Verify consistency between stores

## Phase 1: Concurrency Safety (Week 1-2)
1. **PLAT-001**: Deploy file locking with SQLite backend
2. **PLAT-008**: Atomic checkpoint writes with checksum
3. **PLAT-009**: Checkpoint integrity verification
4. **PLAT-013**: Transaction log for task updates

## Phase 2: Task Ownership (Week 2-3)
1. **PLAT-002**: Atomic compare-and-swap claiming
2. **PLAT-003**: Lease-based ownership with TTL
3. **PLAT-004**: Heartbeat mechanism
4. **PLAT-005**: Timeout detection and recovery

## Phase 3: Scheduling & Reliability (Week 3-4)
1. **PLAT-006**: Circular dependency detection
2. **PLAT-007**: Event deduplication
3. **PLAT-010**: Fair queuing implementation
4. **PLAT-011**: Starvation prevention

## Phase 4: Execution Safety (Week 4)
1. **PLAT-012**: Duplicate execution prevention
2. **Integration testing**
3. **Performance validation under load**

---

# Architecture Diagrams

## Proposed Production Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Workflow Engine v2                                   │
│                                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │
│  │    Engine    │  │   Lease      │  │  Dependency  │                     │
│  │   (Main)     │◄─┤   Manager    │  │   Resolver   │                     │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘                     │
│         │                                    │                             │
│         │    ┌─────────────┴──────────────┐    │                             │
│         │    │                            │    │                             │
│         │    │   SQLite (ACID)            │    │                             │
│         │    │   Task Queue               │    │                             │
│         │    │                            │    │                             │
│         │    └─────────────┬──────────────┘    │                             │
│         │                  │                    │                             │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐                     │
│  │   Dispatcher   │  │ State Machine│  │ Retry Engine │                     │
│  │                │◄─┤ (Atomic)     │  │              │                     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                     │
│         │                  │                  │                             │
│         │    ┌─────────────┴──────────────┐  │                             │
│         │    │                            │  │                             │
│         │    │   Event Bus (Dedup)        │──┘                             │
│         │    │                            │                                 │
│         │    └─────────────┬──────────────┘                                 │
│         │                  │                                                 │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────────────┐                     │
│  │   Recovery     │  │   Metrics    │  │    Agents    │                     │
│  │ (Atomic WAL)   │  │   Updater    │  │  (External)  │                     │
│  └──────────────┘  └──────────────┘  └──────────────┘                     │
│                                                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow with SQLite Backend

```
Task Claim Flow:
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Scheduler      │     │  SQLite         │     │  Dispatcher     │
│  (select)       │────▶│  TRANSACTION    │────▶│  (claim)        │
└─────────────────┘     │                 │     └─────────────────┘
                        │ UPDATE tasks    │
                        │ SET status='AS' │
                        │ WHERE status='R'│
                        │ AND id=?        │
                        │ RETURNING *     │
                        └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  Event Bus      │
                        │  (dedup)        │
                        └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  Agent          │
                        └─────────────────┘
```

## Worker Lifecycle with Lease

```
Worker Lifecycle:
┌─────────────────┐
│  Worker Starts    │
│  Task             │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     Valid     ┌─────────────────┐
│ Lease Manager     │◄───────────────│  Heartbeat API    │
│ lease_expires_at  │               └─────────────────┘
└────────┬────────┘
         │ Expired (T+30s)
         ▼
┌─────────────────┐
│ Scheduler         │
│ Returns to READY  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Re-dispatch       │
└─────────────────┘
```

---

# Risk Assessment

## Critical Risks (Must Mitigate)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Race condition data corruption | High | Critical | SQLite transactions (PLAT-001) |
| Orphaned tasks blocking workflow | High | Critical | Lease + heartbeat (PLAT-003, PLAT-004) |
| Duplicate payments/side effects | Medium | Critical | Execution log (PLAT-012) |
| Recovery from corrupted checkpoint | Medium | High | Atomic writes + checksum (PLAT-008, PLAT-009) |

## High Risks (Should Mitigate)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Low-priority task starvation | Medium | High | Fair queuing (PLAT-010, PLAT-011) |
| Circular dependency infinite loops | Low | High | Cycle detection (PLAT-006) |
| Duplicate metrics/events | High | Medium | Event deduplication (PLAT-007) |

## Medium Risks (Monitor)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Large checkpoint replay time | Low | Medium | Checkpoint versioning |
| Memory pressure from event history | Medium | Medium | Bounded history |

---

# Estimated Engineering Effort

## Sprint 0 (Production Blockers Only)

| Engineer | Tasks | Hours | Duration |
|----------|-------|-------|----------|
| Backend Lead | PLAT-001, PLAT-002, PLAT-003, PLAT-005, PLAT-008 | 66 | 1.5 weeks |
| Platform Engineer | PLAT-004, PLAT-006, PLAT-009, PLAT-010, PLAT-011 | 42 | 1 week |
| QA Engineer | PLAT-007, PLAT-012, PLAT-013 | 26 | 0.5 weeks |

**Total: 134 hours (3.5 person-weeks)**

## Subsequent Sprints (Non-critical Improvements)

| Item | Hours |
|------|-------|
| Performance tuning | 40 |
| Monitoring integration | 32 |
| Horizontal scaling support | 56 |
| Backup/restore automation | 24 |
| **Subsequent Total** | 152 hours |

---

# Operational Readiness Requirements

## Monitoring

### Essential Metrics
- `engine_state`: RUNNING/PAUSED/ERROR (gauge)
- `active_task_count`: Number of in-progress tasks (gauge)
- `queue_depth`: READY tasks waiting (gauge)
- `task_dispatch_latency_seconds`: Time from READY to ASSIGNED (histogram)
- `heartbeat_miss_count`: Missed heartbeats (counter)
- `recovery_count`: Recovery invocations (counter)
- `duplicate_prevention_hits`: Prevented duplicate dispatches (counter)

### Alert Thresholds
- Engine state != RUNNING for > 30s
- Queue depth > 100 for > 5 minutes
- Heartbeat missed for > 2 consecutive intervals
- Recovery triggered > 3 times/hour

## SLIs/SLOs

| SLI | SLO | Alert |
|-----|-----|-------|
| Task dispatch latency | 95% < 5s | 90% < 30s |
| Workflow throughput | > 10 tasks/min | < 5 tasks/min |
| Recovery success rate | 99% | < 95% |
| No orphaned tasks | 100% | > 5 orphaned |

## Runbooks

### RB-001: Task Stuck in ASSIGNED
1. Check agent process alive
2. Check heartbeat last received
3. If > 2x lease interval, trigger manual recovery
4. Reset task to READY for re-dispatch

### RB-002: Recovery Failure
1. Check checkpoint file exists and valid
2. Verify checkpoint checksum
3. If corrupted, replay from transaction log
4. If no logs, manual task reconstruction

---

# Appendix: Current vs Target Comparison

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Storage | JSON files | SQLite ACID | Critical |
| Task Claiming | Read-modify-write | Atomic CAS | Critical |
| Locks | None | File/exclusive locks | Critical |
| Heartbeats | None | Periodic check-in | Critical |
| Lease | None | TTL + renewal | Critical |
| Event Dedup | None | 5-second window | Critical |
| Cycle Detection | Partial | Complete | Critical |
| Atomic Checkpoints | No | Yes + checksum | Critical |
| Fair Queuing | No | Yes | Critical |
| Execution Replay | No | Yes (prevented) | Critical |

---

*Report generated: 2026-06-30*
*Next review: After Sprint 0 completion*