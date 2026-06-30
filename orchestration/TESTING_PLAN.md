# Platform Hardening Testing Plan

## Test Suite Structure

```
orchestration/tests/platform_hardening/
├── test_concurrency.py
├── test_task_ownership.py
├── test_recovery.py
├── test_scheduling.py
├── test_event_processing.py
└── integration/
    ├── test_full_workflow.py
    └── test_failure_scenarios.py
```

## Test Cases

### 1. Race Condition Tests (PLAT-001, PLAT-013)

```python
def test_concurrent_task_updates():
    """
    20 concurrent threads updating the same task.
    Expected: All updates applied, no data loss.
    """
    pass

def test_concurrent_task_claims():
    """
    50 workers attempting to claim the same READY task.
    Expected: Exactly 1 succeeds, 49 receive failure.
    """
    pass

def test_read_write_isolation():
    """
    Continuous reads during writes.
    Expected: Reads never see partial writes.
    """
    pass
```

### 2. Duplicate Dispatch Tests (PLAT-002, PLAT-012)

```python
def test_single_task_multiple_dispatchers():
    """
    10 dispatcher instances racing on same task.
    Expected: One claim, others get ownership error.
    """
    pass

def test_engine_restart_no_duplicate_execution():
    """
    Engine restart should not re-execute completed tasks.
    Expected: Execution log prevents duplicates.
    """
    pass

def test_recovery_replay_protection():
    """
    Recovery from checkpoint should skip already-completed transitions.
    Expected: No duplicate agent invocations.
    """
    pass
```

### 3. Scheduler Correctness Tests (PLAT-006, PLAT-010, PLAT-011)

```python
def test_dependency_satisfication():
    """
    Tasks with met dependencies are dispatched.
    Tasks with unmet dependencies are blocked.
    """
    pass

def test_circular_dependency_detection():
    """
    Task A depends on B, B depends on A.
    Expected: Both marked blocked, no infinite loop.
    """
    pass

def test_fair_queue_distribution():
    """
    100 P3 tasks + 1 P0 task.
    Expected: P3 tasks dispatched within 5 minutes.
    """
    pass

def test_priority_slot_allocation():
    """
    Weighted distribution across priorities.
    Expected: P0 50%, P1 30%, P2 15%, P3 5%.
    """
    pass
```

### 4. Worker Lifecycle Tests (PLAT-003, PLAT-004, PLAT-005)

```python
def test_lease_expiration():
    """
    Task assigned with 5s lease, no heartbeat.
    Expected: Task returned to READY in < 45s.
    """
    pass

def test_heartbeat_extends_lease():
    """
    Heartbeat every 3s on 5s lease task.
    Expected: Lease continuously extended.
    """
    pass

def test_worker_crash_recovery():
    """
    Kill worker process holding task.
    Expected: Task recovered and reassigned in < 60s.
    """
    pass

def test_expired_lease_reclaim():
    """
    Multiple expired tasks.
    Expected: All returned to READY state.
    """
    pass
```

### 5. Recovery Tests (PLAT-008, PLAT-009)

```python
def test_atomic_checkpoint_write():
    """
    Kill process during checkpoint creation.
    Expected: Valid checkpoint from previous write.
    """
    pass

def test_checkpoint_checksum_verification():
    """
    Corrupt checkpoint file externally.
    Expected: Recovery fails safely, uses previous checkpoint.
    """
    pass

def test_checkpoint_schema_validation():
    """
    Load checkpoint missing required fields.
    Expected: Rejected with validation error.
    """
    pass
```

### 6. Event Processing Tests (PLAT-007)

```python
def test_event_deduplication():
    """
    Publish 10 identical events within 5s.
    Expected: Handler called once.
    """
    pass

def test_event_ordering():
    """
    Events arrive out of order.
    Expected: Processed in timestamp order.
    """
    pass

def test_event_history_bounded():
    """
    Publish 2000 events.
    Expected: Only last 1000 retained.
    """
    pass
```

### 7. Scale Tests

```python
def test_1000_queued_tasks():
    """
    Queue of 1000 READY tasks with mixed priorities.
    Expected: All dispatched and completed within 1 hour.
    """
    pass

def test_100_concurrent_workers():
    """
    100 workers claiming and completing tasks.
    Expected: No race conditions, all tasks completed.
    """
    pass

def test_sustained_throughput():
    """
    1000 tasks over 1 hour.
    Expected: > 10 tasks/min throughput maintained.
    """
    pass
```

### 8. Failure Scenario Tests

```python
def test_network_partition():
    """
    Block access to task registry files.
    Expected: Engine retries, recovers when access restored.
    """
    pass

def test_disk_full():
    """
    Disk full during checkpoint.
    Expected: Checkpoint fails gracefully, work continues.
    """
    pass

def test_partial_checkpoint():
    """
    Power failure during checkpoint write.
    Expected: Next checkpoint uses last good state.
    """
    pass
```

## Test Commands

```bash
# Run all platform hardening tests
pytest orchestration/tests/platform_hardening/ -v

# Run concurrency tests
pytest orchestration/tests/platform_hardening/test_concurrency.py -v

# Run with coverage
pytest orchestration/tests/platform_hardening/ --cov=orchestration --cov-report=html

# Run stress test
pytest orchestration/tests/platform_hardening/ -m stress --workers=10
```

## Validation Criteria

| Test Suite | Coverage Target | Pass Rate |
|------------|---------------|-----------|
| Concurrency | 95% | 100% |
| Ownership | 90% | 100% |
| Recovery | 95% | 100% |
| Scheduling | 90% | 100% |
| Events | 85% | 100% |
| Scale | 80% | 95% |
| Integration | 90% | 100% |

## CI Integration

```yaml
# .github/workflows/platform-hardening.yml
name: Platform Hardening Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run hardening tests
        run: |
          pytest orchestration/tests/platform_hardening/ \
            --cov=orchestration \
            --cov-fail-under=90 \
            -q
```