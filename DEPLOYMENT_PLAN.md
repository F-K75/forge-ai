# Forge AI — Deployment Plan

**Version:** 1.0  
**Date:** 2026-01-07  
**Author:** DevOps Lead  
**Target:** Production SaaS (millions of users)

---

## Architecture Overview

```
                         ┌─────────────────────────────────────┐
                         │         Cloud Load Balancer          │
                         │         (AWS ALB / GCP HTTP LB)      │
                         └────────────┬────────────────────────┘
                                      │
                         ┌────────────▼────────────────────────┐
                         │         Kubernetes Cluster           │
                         │    (EKS / GKE / AKS - Multi-AZ)      │
                         └─────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
     ┌────────▼────────┐    ┌────────▼────────┐    ┌─────────▼────────┐
     │  Ingress NGINX  │    │  Ingress NGINX  │    │  Ingress NGINX   │
     │  (prod)         │    │  (staging)      │    │  (canary)        │
     └────────┬────────┘    └────────┬────────┘    └─────────┬────────┘
              │                       │                       │
     ┌────────▼────────┐    ┌────────▼────────┐    ┌─────────▼────────┐
     │  Frontend Pods  │    │  Frontend Pods  │    │  Frontend Pods   │
     │  (HPA 2-10)     │    │  (HPA 1-3)      │    │  (1-2 pods)      │
     └─────────────────┘    └─────────────────┘    └──────────────────┘
     
     ┌────────▼────────┐    ┌────────▼────────┐    ┌─────────▼────────┐
     │  Backend Pods   │    │  Backend Pods   │    │  Backend Pods    │
     │  (HPA 3-20)     │    │  (HPA 1-3)      │    │  (1-2 pods)      │
     └────────┬────────┘    └────────┬────────┘    └─────────┬────────┘
              │                       │                       │
     ┌────────▼────────┐    ┌────────▼────────┐    ┌─────────▼────────┐
     │  Celery Workers │    │  Celery Workers │    │  Celery Workers  │
     │  (HPA 2-10)     │    │  (HPA 1-3)      │    │  (1 pod)         │
     └─────────────────┘    └─────────────────┘    └──────────────────┘
```

### Data Layer

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes Data Services                 │
├─────────────────┬───────────────────┬────────────────────────┤
│  MongoDB        │  Redis            │  Object Storage         │
│  (3-node RS)    │  (2-node cluster) │  (AWS S3 / GCP GCS)    │
│  StatefulSet    │  StatefulSet      │  - Build artifacts      │
│  - Build data   │  - Rate limiting  │  - User uploads         │
│  - User data    │  - Celery broker  │  - Backup storage        │
│  - Projects     │  - Cache          │  - Generated apps        │
│  - Webhooks     │  - WS Pub/Sub     │                         │
└─────────────────┴───────────────────┴────────────────────────┘
```

### Observability Stack

```
┌─────────────────────────────────────────────────────────────┐
│                     Observability Stack                       │
├─────────────────┬───────────────────┬────────────────────────┤
│  Prometheus     │  Grafana          │  Loki                   │
│  - Metrics      │  - Dashboards     │  - Log aggregation      │
│  - Alert rules  │  - Alert manager  │  - Structured search    │
│  - Service mon  │  - On-call int.   │  - Retention policies   │
├─────────────────┼───────────────────┼────────────────────────┤
│  OpenTelemetry  │  PagerDuty        │  Sentry                 │
│  - Distributed  │  - Incident mgmt  │  - Error tracking       │
│    tracing      │  - On-call schd.  │  - Performance mon      │
│  - APM          │  - Escalation     │  - Release tracking     │
└─────────────────┴───────────────────┴────────────────────────┘
```

---

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
name: Forge AI CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  release:
    types: [published]

jobs:
  # ─── CI Jobs (run on every PR and push) ───
  lint:
    runs-on: ubuntu-latest
    steps:
      - lint backend (ruff, mypy)
      - lint frontend (ESLint)
      - lint IaC (checkov, tfsec)
      - security scan (Semgrep, GitLeaks)

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        test-type: [unit, integration, e2e]
    steps:
      - run: ${matrix.test-type} tests
      - upload coverage report

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - build Docker images
      - scan images (Trivy)
      - tag images (semver + SHA)
      - push to container registry

  # ─── CD Jobs (run on merge to main) ───

  deploy-staging:
    runs-on: ubuntu-latest
    needs: [build]
    if: github.ref == 'refs/heads/main'
    environment: staging
    steps:
      - authenticate to cloud
      - retrieve secrets from vault
      - apply K8s manifests (kubectl)
      - run database migrations
      - run smoke tests
      - notify Slack on success/failure

  deploy-production:
    runs-on: ubuntu-latest
    needs: [deploy-staging]
    if: github.event_name == 'release'
    environment: production
    steps:
      - authenticate to cloud
      - retrieve secrets from vault
      - deploy canary (10% traffic)
      - monitor canary (5 min, error rate < 0.1%)
      - promote to full production
      - run database migrations
      - run smoke tests
      - notify Slack on success
      - create GitHub release

  rollback:
    runs-on: ubuntu-latest
    if: failure()
    steps:
      - revert to previous stable image
      - verify health checks
      - notify Slack
```

### CI/CD Stages Detail

| Stage | Trigger | Duration | Verification |
|-------|---------|----------|--------------|
| Lint | PR, push | 3 min | All linters pass |
| Unit tests | PR, push | 8 min | Coverage ≥80% |
| Integration tests | PR, push | 12 min | All integration tests pass |
| Security scan | PR, push | 5 min | No critical/high vulns |
| Build images | PR, push | 8 min | Images build and scan pass |
| Deploy staging | Merge to main | 10 min | Smoke tests pass |
| Deploy canary | Release | 15 min | Error rate <0.1% |
| Deploy production | Release | 20 min | Health checks green |

### Deployment Environments

| Environment | URL | Namespace | Purpose | Deploy Trigger |
|-------------|-----|-----------|---------|----------------|
| Development | dev.forge.ai | `dev` | Developer testing | Manual |
| Staging | staging.forge.ai | `staging` | Pre-release validation | Merge to main |
| Canary | forge.ai (10%) | `prod` | Gradual rollout | Release event |
| Production | forge.ai (100%) | `prod` | Live traffic | Release event + monitoring pass |

---

## Rollback Strategy

### Rollback Tiers

| Tier | Scope | Time | Trigger |
|------|-------|------|---------|
| T1: Code rollback | Revert to previous Docker image | < 2 min | Error rate > 1%, latency > threshold |
| T2: Database rollback | Run down migration | < 5 min | Data corruption, migration failure |
| T3: Infrastructure rollback | Revert Terraform state | < 15 min | Infrastructure misconfiguration |
| T4: Full disaster recovery | Restore from backup | < 4 hours | Complete system failure |

### Automated Rollback (T1)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 0
  template:
    spec:
      containers:
        - name: backend
          image: forge-backend:{{ NEW_TAG }}
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
```

**Rollback command:**
```bash
# Kubectl rollback
kubectl rollout undo deployment/backend -n prod

# Helm rollback
helm rollback forge-backend 1 --namespace prod
```

### Database Rollback (T2)

```bash
# Run down migration
alembic downgrade -1

# Verify data integrity
python scripts/verify_data_integrity.py

# Update deployment to previous code version
kubectl rollout undo deployment/backend -n prod
```

### Rollback Decision Tree

```
Deployment Started
        │
        ▼
Smoke Tests Pass?
   │        │
  Yes       No ──→ Rollback (T1)
   │
   ▼
Monitor 5 min (Canary)
   │        │
  OK        Error > 0.1% ──→ Rollback (T1)
   │
   ▼
Promote to Production
   │
   ▼
Monitor 15 min
   │        │
  OK        Error > 1% ──→ Rollback (T1)
   │                     │
   ▼                     ▼
Success             Verify DB (T2 if needed)
```

---

## Database Migration

### Migration Strategy

| Aspect | Approach |
|--------|----------|
| Tool | Alembic (with MongoDB adapter) |
| Versioning | Sequential migration IDs (001, 002...) |
| Storage | Migration files in `backend/migrations/` |
| CI/CD | Run automatically in deploy step |
| Rollback | Down migration for every up migration |
| Zero-downtime | Backward-compatible migrations only |

### Migration Process

```bash
# Create new migration
alembic revision --autogenerate -m "add_user_preferences"

# Review migration script
cat backend/migrations/versions/abc123_add_user_preferences.py

# Apply migration (automated in CI/CD)
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

### Migration Best Practices

1. **Forward-compatible only:** Never remove columns/fields in forward migration
2. **Additive first:** Add new fields before removing old ones
3. **Test rollback:** Every migration must have working downgrade
4. **Data integrity:** Verify data before and after migration
5. **Locking:** Use MongoDB transactions for multi-document migrations
6. **Timing:** Run migrations before code deployment (additive) or after (destructive)

---

## Secrets Management

### Secret Storage

| Environment | Provider | Method |
|-------------|----------|--------|
| Development | Local .env (with .env.example) | Never commit .env |
| CI | GitHub Actions Secrets | Encrypted env vars |
| Staging | AWS Secrets Manager / GCP Secret Manager | IAM-based access |
| Production | AWS Secrets Manager / GCP Secret Manager | IAM + KMS encryption |
| Local K8s | External Secrets Operator | Syncs to K8s Secrets |

### Secret Inventory

| Secret | Source | Rotation | Access |
|--------|--------|----------|--------|
| JWT_SECRET | Generated | 90 days | Backend |
| FIELD_ENCRYPTION_KEY | Generated | 90 days | Backend |
| STRIPE_API_KEY | Stripe | 180 days | Backend |
| STRIPE_WEBHOOK_SECRET | Stripe | 180 days | Backend |
| ANTHROPIC_API_KEY | Anthropic | 180 days | Backend |
| OPENAI_API_KEY | OpenAI | 180 days | Backend |
| MONGODB_URI | Deploy config | On change | Backend, Celery |
| REDIS_URL | Deploy config | On change | Backend, Celery |
| SMTP_PASSWORD | Email provider | 90 days | Backend |
| SENTRY_DSN | Sentry | On change | Backend, Frontend |

### External Secrets Operator Configuration

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: forge-backend-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: backend-secrets
  data:
    - secretKey: JWT_SECRET
      remoteRef:
        key: forge/prod/backend
        property: JWT_SECRET
    - secretKey: MONGODB_URI
      remoteRef:
        key: forge/prod/database
        property: MONGODB_URI
```

---

## Monitoring

### Monitoring Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| Metrics | Prometheus + custom metrics | System and business metrics |
| Dashboards | Grafana | Visualization |
| Logs | Loki + Promtail | Log aggregation |
| Tracing | OpenTelemetry + Jaeger | Distributed tracing |
| APM | Sentry | Error tracking, performance |
| Uptime | Synthetic monitoring (Checkly / Grafana) | External availability |
| Alerts | Alertmanager + PagerDuty | Incident notification |

### Prometheus Metrics

```python
# Example: Custom Prometheus metrics
from prometheus_client import Counter, Histogram, Gauge

# Business metrics
builds_total = Counter('builds_total', 'Total builds', ['status', 'plan'])
active_users = Gauge('active_users', 'Currently active users')
api_latency = Histogram('api_latency_seconds', 'API latency', ['endpoint'])

# System metrics (auto-collected via prometheus_fastapi_instrumentator)
# - Request count, latency, error rate
# - CPU, memory, network per pod
# - Python runtime metrics
```

### Key Metrics to Monitor

| Category | Metric | Target | Alert Threshold |
|----------|--------|--------|-----------------|
| API | p95 latency | <500ms | >1s for 5 min |
| API | Error rate | <0.1% | >1% for 5 min |
| API | Requests/sec | Varies | >80% of capacity |
| Business | Builds/sec | Varies | >90% of capacity |
| Business | Active users | Varies | Sudden drop >50% |
| Business | Revenue/min | Varies | $0 for 15 min |
| System | CPU utilization | <70% | >85% for 10 min |
| System | Memory utilization | <80% | >90% for 10 min |
| System | Disk usage | <80% | >90% |
| Database | MongoDB connections | <80% of max | >90% for 5 min |
| Database | MongoDB replication lag | <2s | >10s |
| AI | LLM cost/hour | Budget | >80% daily budget |
| AI | LLM error rate | <1% | >5% |
| Infrastructure | Pod restarts | 0 | >3 in 10 min |
| Infrastructure | Certificate expiry | >30 days | <14 days |

### Alerting Rules

```yaml
# prometheus-rules.yaml
groups:
  - name: forge-ai-critical
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate ({{ $value }}%)"

      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High p95 latency ({{ $value }}s)"

      - alert: ServiceDown
        expr: up{job="backend"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.job }} is down"

      - alert: CertificateExpiring
        expr: certificate_expiry_days < 14
        labels:
          severity: warning
        annotations:
          summary: "TLS cert expires in {{ $value }} days"
```

---

## Logging

### Log Format (Structured JSON)

```json
{
  "timestamp": "2026-01-07T12:00:00Z",
  "level": "INFO",
  "service": "backend",
  "request_id": "req-abc123",
  "trace_id": "trace-def456",
  "user_id": "user-789",
  "action": "create_build",
  "status": "success",
  "duration_ms": 1250,
  "build_id": "build-xyz",
  "error": null,
  "metadata": {
    "plan": "pro",
    "llm_tokens": 1500,
    "llm_cost": 0.03
  }
}
```

### Log Levels

| Level | Usage | Examples |
|-------|-------|----------|
| DEBUG | Detailed debugging (development only) | SQL queries, API payloads |
| INFO | Normal operations | Request started/completed, user action |
| WARNING | Potential issues | Rate limit threshold, circuit breaker open |
| ERROR | Recoverable errors | API failure, DB connection timeout |
| CRITICAL | System-threatening | Data corruption, security breach |

### Log Retention

| Environment | Retention | Storage |
|-------------|-----------|---------|
| Development | 7 days | Local files |
| Staging | 30 days | Loki (S3 backend) |
| Production | 90 days active, 1 year archive | Loki (S3 backend + Glacier) |

---

## Alerting

### Alert Severity

| Severity | Response Time | Channel | Examples |
|----------|---------------|---------|----------|
| CRITICAL | < 5 min | PagerDuty phone call + Slack | Service down, data loss, security breach |
| HIGH | < 15 min | PagerDuty push + Slack | High error rate, high latency |
| WARNING | < 1 hour | Slack only | Certificate expiry, disk > 80% |
| INFO | < 24 hours | Email digest | Daily report, trends |

### On-Call Schedule

| Role | Coverage | Escalation Time |
|------|----------|-----------------|
| Primary DevOps | Mon-Fri 9am-9pm (local) | 5 min |
| Secondary DevOps | 24/7 backup | 15 min |
| Engineering lead | 24/7 for critical | 30 min |
| CTO | 24/7 for major incidents | 60 min |

### Alerting Channels

| Channel | Purpose | Tools |
|---------|---------|-------|
| Critical alerts | Immediate notification | PagerDuty phone + push |
| Team notifications | Deployment status, incidents | Slack (#forge-alerts) |
| Daily digest | Summary of activity | Email |
| Status page | Public status | status.forge.ai |

---

## Backups

### Backup Schedule

| Data | Frequency | Retention | Type | Location |
|------|-----------|-----------|------|----------|
| MongoDB (full) | Daily | 30 days | mongodump | S3 (separate region) |
| MongoDB (oplog) | Continuous | 24 hours | Point-in-time | S3 |
| MongoDB (weekly) | Weekly | 12 months | mongodump | S3 Glacier |
| Build artifacts | On creation | 90 days | S3 copy | S3 cross-region |
| Application logs | Continuous | 90 days | Loki retention | S3 |
| Database configs | On change | Forever | Git | GitHub |
| K8s manifests | On change | Forever | Git | GitHub |
| Terraform state | On change | Forever | S3 backend | S3 + DynamoDB |

### Backup Verification

```bash
# Verify backup integrity
python scripts/verify_backup.py --backup-file s3://forge-backups/prod/daily/2026-01-07.gz

# Test restore to staging
bash scripts/test_restore.sh \
  --backup s3://forge-backups/prod/daily/2026-01-07.gz \
  --target staging \
  --verify-integrity
```

### Restore Procedure

1. Identify backup to restore from
2. Spin up temporary MongoDB instance in staging namespace
3. Restore backup to temporary instance
4. Verify data integrity (count documents, check indexes)
5. If approved, restore to production:
   - Scale down backend and Celery workers
   - Restore MongoDB data
   - Scale up services
   - Verify health checks
   - Run smoke tests

---

## Disaster Recovery

### RPO and RTO Targets

| Tier | RPO (Recovery Point Objective) | RTO (Recovery Time Objective) |
|------|-------------------------------|-------------------------------|
| Platinum (Enterprise) | < 5 minutes | < 30 minutes |
| Gold (Pro) | < 1 hour | < 2 hours |
| Silver (Standard) | < 24 hours | < 4 hours |
| Bronze (Free) | < 24 hours | < 8 hours |

### Disaster Scenarios

| Scenario | Impact | RTO | Recovery Action |
|----------|--------|-----|-----------------|
| Single pod failure | Minor | < 1 min | K8s auto-restart |
| Node failure | Moderate | < 5 min | Pod rescheduled on healthy node |
| Single AZ failure | Major | < 15 min | Multi-AZ deployment serves traffic |
| MongoDB primary failure | Major | < 2 min | Automatic replica set failover |
| Full region failure | Critical | < 4 hours | DR region failover (manual) |
| Data corruption | Critical | < 4 hours | Restore from backup |
| Security breach | Critical | < 1 hour | Incident response + restore |
| LLM API outage | Moderate | < 1 min | Fallback to alternative model |

### Disaster Recovery Runbook

```bash
# 1. Assess the situation
kubectl get pods --all-namespaces
kubectl describe pod <affected-pod>
kubectl logs <affected-pod> --tail=100

# 2. Notify team
./scripts/incident.sh --severity critical --message "Production issue detected"

# 3. For pod-level failures: K8s will auto-restart
kubectl rollout status deployment/backend -n prod

# 4. For data loss: Restore from backup
./scripts/restore_production.sh --backup latest --verify yes

# 5. For region failure: Activate DR
terraform apply -target=module.dr_region -auto-approve
kubectl apply -f k8s/prod/ --context=dr-cluster

# 6. Verify recovery
curl https://forge.ai/health
./scripts/smoke_test.sh

# 7. Post-incident: Write post-mortem
./scripts/post_mortem.sh --incident-id INC-2026-001
```

---

## Blue/Green Deployment

### Blue/Green Architecture

```
                    ┌──────────────┐
                    │  Load Balancer│
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼───┐  ┌────▼────┐  ┌────▼────────┐
     │  Blue       │  │  Green  │  │  Maintains   │
     │  (Current)  │  │ (New)   │  │  old version │
     │  100% traffic│  │  0%     │  │  for rollback│
     └─────────────┘  └─────────┘  └──────────────┘
```

### Blue/Green Deployment Process

1. **Pre-deployment:** Blue (current) serves 100% traffic
2. **Deploy Green:** Deploy new version alongside Blue
3. **Verify Green:** Run smoke tests against Green
4. **Switch traffic:** Load balancer switches to Green
5. **Monitor:** Watch Green for 15 min
6. **Keep Blue:** Keep Blue running for rollback (30 min)
7. **Cleanup:** Terminate Blue after successful verification

```bash
# Deploy green
kubectl apply -f k8s/prod/backend-green.yaml

# Wait for green to be ready
kubectl rollout status deployment/backend-green -n prod

# Switch traffic (update service selector)
kubectl patch service backend -n prod -p '{"spec":{"selector":{"version":"green"}}}'

# Monitor
./scripts/smoke_test.sh
watch -n 30 'kubectl get pods -n prod -l version=green'

# Keep blue for rollback
kubectl scale deployment backend-blue -n prod --replicas=2

# After 30 min, clean up
kubectl delete deployment backend-blue -n prod
```

---

## Canary Release

### Canary Architecture

```
                    ┌──────────────┐
                    │  Load Balancer│
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │  90%       │  10%       │
     ┌────────▼───┐  ┌────▼────┐  ┌────▼────────┐
     │  Stable     │  │ Canary  │  │  (Prod)      │
     │  v1.0.0     │  │ v1.1.0  │  │              │
     │  90% users  │  │ 10% usrs│  │              │
     └─────────────┘  └─────────┘  └──────────────┘
```

### Canary Release Process

1. **Step 1 (0% → 10%):** Deploy canary with 1 pod, route 10% traffic
   - Monitor for 5 min: error rate, latency, business metrics
   - If any metric degrades → rollback immediately
   
2. **Step 2 (10% → 50%):** Scale canary to match stable
   - Monitor for 10 min
   - Compare error rates between canary and stable
   
3. **Step 3 (50% → 100%):** Full promotion
   - Canary becomes new stable
   - Old version scaled down

### Canary Metrics Comparison

| Metric | Canary | Stable | Action |
|--------|--------|--------|--------|
| Error rate | < 0.1% | < 0.1% | OK |
| Error rate | > 0.1% | < 0.1% | ROLLBACK |
| p95 latency | < 500ms | < 500ms | OK |
| p95 latency | > 1s | < 500ms | ROLLBACK |
| Build success rate | > 99% | > 99% | OK |
| Build success rate | < 98% | > 99% | ROLLBACK |

```yaml
# Canary service with weight-based routing (using Flagger or service mesh)
apiVersion: flagger.app/v1beta1
kind: Canary
metadata:
  name: backend
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  service:
    port: 8000
  analysis:
    interval: 1m
    threshold: 5
    maxWeight: 100
    stepWeight: 10
    metrics:
      - name: error-rate
        thresholdRange:
          max: 0.01
        interval: 1m
      - name: latency-p95
        thresholdRange:
          max: 0.5
        interval: 1m
```

---

## Post-Deployment Verification

### Smoke Test Suite

| Test | Command | Expected |
|------|---------|----------|
| Health check | `curl https://forge.ai/health` | 200 OK |
| Database ping | `curl https://forge.ai/health/detailed` | DB: ok, Redis: ok |
| Auth flow | `curl -X POST https://forge.ai/v1/auth/login ...` | JWT token |
| Build creation | `curl -X POST https://forge.ai/v1/builds ...` | Build ID |
| Frontend load | Browser open https://forge.ai | Page loads < 3s |
| WebSocket | `wscat -c wss://forge.ai/ws` | Connected |

### Rollback Criteria

If any of these conditions are met within 30 minutes of deployment, initiate automatic rollback:

1. **Error rate** > 1% for any endpoint
2. **p95 latency** > 2s for critical endpoints
3. **Build success rate** < 95%
4. **Health check** fails for any service
5. **Alert** Critical severity triggered
6. **Business metrics** (builds, revenue) drop > 50%

---

## Deployment Runbook

### Pre-Deployment Checklist

- [ ] All CI/CD pipeline stages green
- [ ] Test coverage ≥ 80%
- [ ] No open P0/P1 security issues
- [ ] Database migrations reviewed
- [ ] Rollback plan confirmed
- [ ] Monitoring dashboards available
- [ ] On-call engineer notified
- [ ] Change request approved

### Deployment Day Process

```
T-30 min: Final review of changes
T-15 min: Notify team in Slack (#forge-deployments)
T-5 min:  Take database snapshot
T-0:      Deploy canary (10%)
T+5 min:  Verify canary metrics
T+10 min: Promote to 50%
T+15 min: Verify mid-rollout metrics
T+20 min: Promote to 100%
T+25 min: Run smoke tests
T+30 min: Verify production metrics
T+45 min: Post-deployment review
T+60 min: Close deployment (keep rollback available for 2 hours)
```

### Post-Deployment

- [ ] Verify all monitoring dashboards
- [ ] Confirm error rates normal
- [ ] Run E2E smoke tests
- [ ] Notify team of successful deployment
- [ ] Document any issues encountered
- [ ] Update deployment changelog