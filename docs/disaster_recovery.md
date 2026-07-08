# Forge AI — Disaster Recovery Runbook

## Overview

This runbook covers recovery from the three most likely failure modes:

| Failure mode | Recovery time objective (RTO) | Recovery point objective (RPO) |
|---|---|---|
| Single backend pod crash | Seconds (Kubernetes self-heals) | Zero (Mongo replica set) |
| MongoDB primary loss | Seconds (replica set failover) | Zero |
| Full cluster / region loss | ~30 minutes | Up to 24 hours (last daily backup) |

---

## 1. Automated Backup Schedule

Backups run automatically via the Kubernetes CronJob `mongodb-backup` in
`k8s/mongodb-backup-cronjob.yaml` (daily at 02:00 UTC).

In Docker Compose production deployments, the `backup` service in
`docker-compose.prod.yml` runs twice daily (02:00 and 14:00 UTC) via Alpine
cron.

Each run:

1. Calls `mongodump --gzip` against the live replica set.
2. Verifies the dump is structurally sound via `scripts/backup_verify.py`.
   If verification fails the CronJob exits non-zero and Kubernetes records
   the Job as `Failed` (visible in `kubectl get jobs -n forge-ai-prod`).
3. Prunes local backups older than 30 days.
4. Optionally syncs to S3 when `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
   and `S3_BUCKET` are set in the `forge-ai-secrets` secret.

Backup destination (Kubernetes): a 50 GiB PVC named `mongodb-backup-pvc-spec`
mounted at `/backup` inside the CronJob pod.

Backup destination (Docker Compose): a named volume `backup_data` mounted at
`/backups` inside the `backup` service container.

---

## 2. Verifying a Backup

Run the verification script against any backup directory:

```bash
# Inside the cluster or on any host that has the dump mounted:
python3 scripts/backup_verify.py /backup/20260708_020000

# Or, to check the most-recent backup:
python3 scripts/backup_verify.py /backups/latest

# Machine-readable output:
python3 scripts/backup_verify.py /backup/20260708_020000 --json
```

**Pass** (`exit 0`): backup structure is sound, all collection files readable.

**Fail** (`exit 1`): one or more collection files failed decompression or JSON
parse. Do not rely on this backup — investigate `corrupt_files` in the report
and re-run `mongodump`.

**Error** (`exit 2`): path does not exist or cannot be read.

---

## 3. Restoring from Backup

### 3.1 Kubernetes

Use the `mongodb-restore-job.yaml` Job manifest.

```bash
# 1. Identify the backup timestamp to restore from:
kubectl exec -n forge-ai-prod deploy/mongodb-backup -- ls /backup

# 2. Create a restore Job by applying the manifest with the desired timestamp:
kubectl -n forge-ai-prod create configmap restore-overrides \
  --from-literal=RESTORE_TIMESTAMP=20260708_020000 \
  --dry-run=client -o yaml | kubectl -n forge-ai-prod apply -f -

# 3. Or, edit the inline value in mongodb-restore-job.yaml and apply:
kubectl -n forge-ai-prod apply -f k8s/mongodb-restore-job.yaml

# 4. Watch logs:
kubectl -n forge-ai-prod logs job/mongodb-restore -f

# 5. After verification, delete the Job:
kubectl -n forge-ai-prod delete job mongodb-restore
```

**WARNING**: the restore Job uses `--drop`, which deletes the target database
before restoring. Only run it against the intended cluster and confirm the
timestamp. For DR drills, restore into a separate namespace/cluster, not
production.

### 3.2 Docker Compose

```bash
# On the VPS, stop the backend and worker so nothing writes during restore:
docker compose -f docker-compose.prod.yml stop backend worker

# Run mongorestore:
docker run --rm \
  -v forge_mongo_data:/data/db \
  -v forge_backup_data:/backup:ro \
  mongo:7.0.5 \
  mongorestore \
    --uri="mongodb://forge:${MONGO_PASSWORD}@mongo:27017/forge?authSource=admin" \
    --drop \
    --gzip \
    /backup/20260708_020000

# Restart services:
docker compose -f docker-compose.prod.yml up -d backend worker

# Verify:
curl -fsS http://localhost:8000/health/detailed
```

---

## 4. Failure Scenarios

### 4.1 Backup CronJob is failing

```bash
# Check Job history:
kubectl -n forge-ai-prod get jobs
kubectl -n forge-ai-prod describe job mongodb-backup

# View logs from the most recent failed Pod:
kubectl -n forge-ai-prod logs job/mongodb-backup --previous

# Common causes:
#   - PVC full (check: kubectl -n forge-ai-prod get pvc mongodb-backup-pvc-spec)
#   - MONGODB_URL secret missing or wrong (check: kubectl -n forge-ai-prod get secret forge-ai-secrets -o jsonpath='{.data.mongodb-url}' | base64 -d)
#   - Backup verification failure (see section 2 above)
```

### 4.2 MongoDB data loss

1. Confirm the replica set status: `mongosh "mongodb://forge:${MONGO_PASSWORD}@mongo:27017/forge?authSource=admin" --eval "rs.status()"`
2. If a secondary is healthy, promote it: step down the primary, verify writes, and update `MONGODB_URL` if the host changed.
3. If the entire replica set is lost, restore from the most recent verified backup (section 3).

### 4.3 Full Kubernetes cluster loss

Prerequisites (set up before disaster):

- Offsite S3 copy enabled (`S3_BUCKET` secret populated).
- `kubectl` config and cloud provider CLI installed on the recovery workstation.
- Secrets backed up in your external secret manager (Vault / AWS Secrets Manager / etc.).

Recovery steps:

1. Create a new AKS/GKE/EKS cluster.
2. Install External Secrets Operator.
3. Apply `k8s/namespaces.yaml`, then apply all manifests in `k8s/`.
4. Restore MongoDB from S3 backup using `mongodb-restore-job.yaml` with
   `RESTORE_TIMESTAMP` set.
5. Verify `curl -fsS https://<domain>/health/detailed` returns `"status": "ok"`.

---

## 5. Backup Retention Policy

| Storage tier | Retention | Trigger |
|---|---|---|
| Local PVC (`/backup`) | 30 days | CronJob `find … -mtime +30` |
| S3 offsite (optional) | 90 days | S3 Lifecycle rule (manual) |

The local 30-day window replaces the previous 7-day window to give a larger
window for point-in-time recovery before the oldest backup is auto-pruned.

---

## 6. Testing the Restore Procedure

Run a DR drill quarterly:

1. Provision a temporary MongoDB instance (separate namespace or a local
   `mongodb-memory-server` in CI).
2. Seed it with a known data set.
3. Trigger the backup CronJob manually: `kubectl -n forge-ai-prod create job --from=cronjob/mongodb-backup manual-backup-$(date +%s)`.
4. Verify the backup with `scripts/backup_verify.py`.
5. Drop the temporary database and restore from the backup.
6. Verify all expected collections and documents are present.

Automated restore testing is not yet wired into CI; see the backlog item
INF-005 in `ENGINEERING_BACKLOG.md`.
