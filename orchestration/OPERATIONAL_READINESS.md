# Operational Readiness

## Monitoring

### Essential Metrics

```
# Engine State
engine_state{state} 1
# Values: STOPPED=0, STARTING=1, RUNNING=2, PAUSED=3, RECOVERING=4, ERROR=5, SHUTTING_DOWN=6

# Active Tasks
active_tasks 15

# Queue Depth
queue_depth{status} 5
# Values: READY=1, ASSIGNED=2, IN_PROGRESS=3, UNDER_REVIEW=4, VALIDATING=5, FAILED=6, REPAIRING=7, REVALIDATING=8, APPROVED=9

# Task Dispatch Latency
task_dispatch_latency_seconds{task_id, priority, severity}

# Heartbeat Metrics
heartbeat_miss_count_total{worker_id}
heartbeat_last_received_timestamp{worker_id}

# Recovery Metrics
recovery_attempts_total
recovery_success_count_total
recovery_failed_count_total

# Deduplication
duplicate_event_prevented_total{event_type}
```

### Alert Rules

```yaml
# Engine State Alert
- alert: EngineNotRunning
  expr: engine_state != 2
  for: 30s
  severity: critical
  summary: "Workflow engine is not in RUNNING state"

# Queue Depth Alert
- alert: TaskQueueBacklog
  expr: queue_depth{task_state="READY"} > 100
  for: 5m
  severity: warning
  summary: "Too many READY tasks waiting in queue"

# Heartbeat Alert
- alert: WorkerHeartbeatMissing
  expr: heartbeat_last_received_timestamp{worker} < (time() - 60)
  for: 1m
  severity: critical
  summary: "Worker has not sent heartbeat in 60 seconds"

# Recovery Alert
- alert: FrequentRecovery
  expr: increase(recovery_attempts_total[1h]) > 3
  for: 1m
  severity: warning
  summary: "Unusual recovery activity detected"
```

## SLIs/SLOs

| SLI | Target SLO | Burn Rate Alert | Severity |
|-----|------------|-----------------|----------|
| Task dispatch latency (p95) | < 5s | 30s | Critical |
| Workflow throughput | > 10 tasks/min | < 5 tasks/min | Critical |
| Recovery success rate | 99% | < 95% | High |
| Duplicate dispatch rate | 0% | > 0.1% | Critical |
| Orphaned task rate | 0% | > 5 tasks | High |
| Event processing accuracy | 100% | Dedup > 1% | Medium |

## Runbooks

### RB-001: Task Stuck in ASSIGNED State

**Symptoms**: Task remains in ASSIGNED for > 5 minutes, no progress

**Resolution**:
1. Check worker process: `ps aux | grep <agent_name>`
2. Check heartbeat: `GET /orchestration/engine/stats` for last heartbeat time
3. If heartbeat expired > 2x lease interval:
   ```
   curl -X POST /orchestration/engine/workers/<task_id>/force-release
   ```
4. Reset task to READY for re-dispatch:
   ```python
   update_task(task_id, {"status": "READY", "owner": None})
   ```

### RB-002: Recovery Failure on Startup

**Symptoms**: Engine fails to start, checkpoint error in logs

**Resolution**:
1. Check checkpoint file exists: `ls -la orchestration/recovery_checkpoint.json`
2. Verify checksum: Use recovery_manager.get_checkpoint_info()
3. If corrupted:
   ```python
   recovery_manager.clear_checkpoints()
   recovery_manager.create_checkpoint({"manual": True})
   ```
4. If no checkpoint, manual reconstruction from task history

### RB-003: Circular Dependency Detected

**Symptoms**: Task never dispatched, "blocked" in scheduler stats

**Resolution**:
1. Check dependency chain: `GET /orchestration/engine/tasks/<id>/dependencies`
2. Identify cycle in output
3. Break cycle by removing one dependency
4. Notify task planner for permanent fix

## Capacity Planning

### Resource Requirements

| Component | CPU | Memory | Disk |
|-----------|-----|--------|------|
| Workflow Engine | 0.5 cores | 256MB | 1GB |
| SQLite Database | 0.2 cores | 128MB | 10GB |
| Event History | - | 100MB | - |
| Checkpoints (10) | - | 50MB | 5GB |

### Scaling Characteristics

- **Vertical**: Single instance handles up to 100 concurrent tasks
- **Horizontal**: Requires shared database for multi-instance
- **Task throughput**: ~50 tasks/min sustained
- **Event throughput**: ~1000 events/min

## Testing Matrix

| Test Category | Description | Expected Result |
|--------------|-------------|-----------------|
| Race condition | 50 concurrent task claims | Exactly 1 succeeds |
| Duplicate dispatch | Same task to 10 workers | 1 dispatched, 9 rejected |
| Scheduler correctness | Mixed priority queue | Fair distribution |
| Worker crash | Kill worker mid-task | Task recovered in < 60s |
| Network failure | Partition task registry | Engine continues, retries succeed |
| Recovery | Corrupted checkpoint | Previous checkpoint used |
| Checkpoint corruption | Modify checkpoint file | Detected and rejected |
| Dependency cycles | A→B→A dependencies | Detected as blocked |
| Queue starvation | 100 P0 + 100 P3 tasks | P3 dispatched within 5m |
| Event duplication | 10 identical events | Processed once |
| Parallel execution | 20 concurrent workers | All complete, no conflicts |
| Scale 1000 tasks | Queue of 1000 READY | All processed in < 1h |
| Scale 100 workers | 100 concurrent workers | No data corruption |