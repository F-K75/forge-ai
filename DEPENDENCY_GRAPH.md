# Forge AI — Dependency Graph

**Date:** 2026-01-07  
**Purpose:** Map task dependencies, identify critical path, parallel work opportunities, and blocked tasks.

---

## Dependency Types

| Symbol | Meaning |
|--------|---------|
| `→` | Blocked by (A → B means A must complete before B) |
| `∥` | Parallel (can be done simultaneously) |
| `⚠` | Critical path item |
| `🚫` | Release blocker if not completed |
| `🔄` | Has circular dependency risk |

---

## Layer 0: MUST COMPLETE FIRST (No Dependencies)

These tasks have NO dependencies and MUST be completed before anything else can proceed.

| ID | Title | Hours | Priority |
|----|-------|-------|----------|
| SEC-014 | ~~Fix bcrypt/passlib incompatibility 🚫⚠~~ **RESOLVED 2026-07-03** (pinned `bcrypt==4.0.1`; also fixed SEC-016, an ObjectId serialization bug it uncovered) | 4 (est.) / ~1.5 (actual) | P0 |
| SEC-010 | Implement sanitize_string 🚫 | 2 | P0 |
| SEC-001 | ~~CSRF token validation~~ 🚫 **RESOLVED 2026-07-03** (was mis-scoped — see ENGINEERING_BACKLOG.md) | 16 | P0 |
| SEC-002 | Separate encryption key 🚫 | 16 | P0 |
| SEC-003 | WebSocket authentication 🚫 | 24 | P0 |
| SEC-004 | Fail-closed rate limiting 🚫 | 8 | P0 |
| SEC-005 | JTI token blacklisting 🚫 | 8 | P0 |
| SEC-006 | Password reset token hashing 🚫 | 8 | P0 |
| SEC-011 | Auth endpoint rate limiting 🚫 | 8 | P0 |
| SEC-012 | Webhook URL validation | 8 | P1 |
| SEC-013 | CORS configuration | 2 | P1 |
| BE-001 | Celery migration 🚫 | 80 | P0 |
| BE-006 | Build timeout cleanup | 16 | P1 |
| BE-011 | Health checks | 8 | P1 |
| INF-001 | K8s manifests 🚫⚠ | 120 | P0 |
| DB-002 | Database migration system | 60 | P1 |
| FE-003 | Error boundary | 8 | P1 |
| FE-004 | TypeScript strict mode | 40 | P2 |
| OBS-001 | Structured logging | 80 | P1 |
| AI-001 | LLM cost tracking 🚫 | 40 | P0 |
| AI-002 | Prompt injection protection 🚫 | 60 | P0 |
| AI-004 | LLM fallback chain | 40 | P1 |
| AI-005 | Content moderation | 60 | P1 |
| AI-007 | CSP for generated apps | 16 | P1 |
| TEST-001 | Comprehensive test suite 🚫 | 200 | P0 |
| BUS-001 | ToS/Privacy Policy 🚫 | 80 | P0 |
| BUS-002 | Stripe pricing 🚫 | 40 | P0 |
| BUS-004 | Support system | 60 | P2 |
| BUS-005 | Landing page | 60 | P2 |
| DEVOPS-005 | Docker Compose parity | 24 | P2 |
| FE-002 | Responsive design | 60 | P2 |
| FE-006 | Product analytics | 40 | P2 |
| FE-007 | SEO meta tags | 16 | P2 |

---

## Layer 1: Depend on Layer 0

| ID | Title | Hours | Depends On | Notes |
|----|-------|-------|------------|-------|
| SEC-009 | NoSQL injection prevention 🚫 | 8 | SEC-010 | Need sanitize_string first |
| BE-002 | Global exception handler | 16 | OBS-001 | Needs structured logging |
| BE-005 | Graceful shutdown | 16 | BE-001 | Needs Celery |
| BE-008 | Request ID middleware | 8 | OBS-001 | Needs structured logging |
| BE-012 | Webhook signing | 16 | None | Layer 0 actually |
| BE-003 | Pagination | 24 | None | Layer 0 |
| BE-004 | API versioning | 24 | None | Layer 0 |
| FE-001 | WCAG AA a11y | 120 | None | Layer 0 |
| INF-003 | Secrets management 🚫 | 60 | INF-001 | Needs K8s manifests |
| INF-004 | Docker tagging | 8 | INF-001 | Needs K8s |
| DEVOPS-002 | K8s Ingress/TLS 🚫 | 24 | INF-001 | Needs K8s |
| AI-003 | LLM rate limiting 🚫 | 24 | AI-001 | Needs cost tracking |
| BUS-003 | SLA | 40 | INF-002 | Needs monitoring |
| BUS-006 | API documentation | 40 | BE-004 | Needs API versioning |
| BUS-007 | Credit race condition 🚫 | 24 | DB-001 | Needs replica set |

---

## Layer 2: Depend on Layer 0 + Layer 1

| ID | Title | Hours | Depends On | Notes |
|----|-------|-------|------------|-------|
| BE-009 | Audit logging | 24 | None | Layer 0 |
| BE-010 | Session management | 40 | SEC-005 | Needs JTI tokens |
| SEC-007 | MFA/2FA | 80 | SEC-005 | Needs JTI for session binding |
| SEC-008 | Email verification | 24 | SEC-006 | Needs token hashing |
| DB-001 | MongoDB replica set 🚫⚠ | 80 | INF-001 | Needs K8s |
| INF-002 | Monitoring & alerting 🚫 | 80 | INF-001 | Needs K8s |
| INF-005 | Database backup 🚫 | 40 | DB-001, INF-001 | Needs replica set + K8s |
| INF-007 | Per-user rate limiting | 16 | BE-007 | Needs caching |
| INF-008 | DB connection pool monitoring | 16 | INF-002 | Needs monitoring |
| INF-006 | Graceful degradation | 24 | INF-002 | Needs monitoring |
| DEVOPS-001 | CI pipeline fix | 8 | FE-004 | Needs TypeScript strict |
| DEVOPS-003 | HPA | 16 | INF-001 | Needs K8s |
| DEVOPS-004 | Zero-downtime deployments | 16 | INF-001 | Needs K8s |
| AI-006 | Circuit breaker graceful degradation | 8 | AI-004 | Needs fallback chain |
| OBS-004 | APM | 40 | OBS-001 | Needs structured logging |
| DB-003 | Data retention | 40 | DB-002 | Needs migration system |
| DB-004 | GDPR cascade deletion 🚫 | 24 | BE-009 | Needs audit logging |
| FE-005 | Onboarding flow | 60 | FE-006 | Needs analytics |

---

## Layer 3: Depend on Layer 2

| ID | Title | Hours | Depends On | Notes |
|----|-------|-------|------------|-------|
| BE-007 | Redis caching | 40 | None | Layer 0 actually |
| TEST-002 | Performance & chaos tests | 80 | TEST-001 | Needs test infrastructure |

---

## Critical Path

The critical path is the longest chain of dependent tasks that determines the minimum project duration.

```
SEC-010 (2h) → SEC-009 (8h) 
                                       → [All SEC P0 complete]
                                       
BE-001 (80h) → BE-005 (16h) 
            → [Build pipeline reliable]
            
INF-001 (120h) → DB-001 (80h) 
               → INF-005 (40h)
               → INF-002 (80h) 
               → [Infrastructure complete]
               → INF-003 (60h)
               → DEVOPS-002 (24h)
               → DEVOPS-003 (16h)
               → DEVOPS-004 (16h)
               → [Deployment pipeline complete]

OBS-001 (80h) → BE-002 (16h)
              → BE-008 (8h)
              → [Observability complete]

TEST-001 (200h) → TEST-002 (80h)
                → [Quality gates]

AI-001 (40h) → AI-003 (24h)
             → [AI cost controls]

BUS-001 (80h) → [Legal compliance]

AUDIT-001 (40h) → AUDIT-002 (40h) → AUDIT-003 (40h)
               → [Security clearance]
```

**Critical Path Duration (minimum):** ~14 weeks with 5 engineers

**Critical Path Bottlenecks:**
1. `INF-001` (120h) - K8s manifests is the single largest task and blocks 6 other tasks
2. `TEST-001` (200h) - Largest total effort, blocks quality verification
3. `DB-001` (80h) - Depends on INF-001, blocks INF-005 and BUS-007
4. `OBS-001` (80h) - Blocks BE-002 and BE-008

---

## Parallel Work Groups

These groups can be executed simultaneously by different engineers.

### Group A: Security (Engineer A)
```
SEC-010 ──→ SEC-009
SEC-001
SEC-002
SEC-003
SEC-004
SEC-005 ──→ SEC-007
SEC-006 ──→ SEC-008
SEC-011
SEC-012
SEC-013
AI-002 (prompt injection)
AI-005 (content moderation)
AI-007 (CSP for generated apps)
BE-009 (audit logging)
```

### Group B: Infrastructure (Engineer B)
```
INF-001 ──→ DB-001 ──→ INF-005
         ├──→ INF-003
         ├──→ DEVOPS-002
         ├──→ DEVOPS-003
         ├──→ DEVOPS-004
         └──→ INF-002 ──→ INF-008
                      └──→ INF-006
INF-004
DEVOPS-001 (after FE-004)
DEVOPS-005
```

### Group C: Backend & AI (Engineer C)
```
BE-001 ──→ BE-005
BE-006
BE-011
├── Parallel with OBS-001 ──→ BE-002
│                          └──→ BE-008
├── BE-003
├── BE-004 ──→ BUS-006
├── BE-007
├── BE-010 (after SEC-005)
├── BE-012
├── DB-002 ──→ DB-003
├── DB-004 (after BE-009)
├── AI-001 ──→ AI-003
├── AI-004 ──→ AI-006
BUS-007 (after DB-001)
```

### Group D: Frontend (Engineer D)
```
FE-003
FE-004 ──→ DEVOPS-001
FE-001
FE-002
FE-005 (after FE-006)
FE-006
FE-007
BUS-001 (implementation)
BUS-005
```

### Group E: Testing & Quality (Engineer E)
```
TEST-001 ──→ TEST-002
         └── Test infrastructure for all groups
```

### Group F: Business & Product (PM)
```
BUS-001 (legal)
BUS-002 (Stripe)
BUS-003 (after INF-002)
BUS-004
BUS-006 (after BE-004)
```

---

## Blocked Tasks Summary

| Task | Blocked By | Blocking | Impact |
|------|-----------|----------|--------|
| SEC-009 | SEC-010 | - | NoSQL injection remains exploitable |
| BE-002 | OBS-001 | - | Stack traces may leak in production |
| BE-005 | BE-001 | - | Builds lost on server restart |
| BE-008 | OBS-001 | - | Cannot correlate logs |
| INF-003 | INF-001 | - | Secrets visible in env vars |
| INF-002 | INF-001 | INF-005, INF-006, INF-008, BUS-003 | No production visibility |
| INF-005 | DB-001, INF-001 | - | No data recovery capability |
| INF-007 | BE-007 | - | Only IP-based rate limiting |
| INF-008 | INF-002 | - | Connection pool blind |
| INF-006 | INF-002 | - | No degradation strategy |
| DB-001 | INF-001 | INF-005, BUS-007 | Single point of failure |
| DB-003 | DB-002 | - | No data lifecycle management |
| DB-004 | BE-009 | - | GDPR non-compliant |
| SEC-007 | SEC-005 | - | No MFA protection |
| SEC-008 | SEC-006 | - | No email verification |
| AI-003 | AI-001 | - | Uncontrolled LLM costs |
| AI-006 | AI-004 | - | No graceful circuit breaker |
| BE-010 | SEC-005 | - | No session management |
| BUS-003 | INF-002 | - | No SLA published |
| BUS-006 | BE-004 | - | No API docs for consumers |
| BUS-007 | DB-001 | - | Credit race condition |
| DEVOPS-001 | FE-004 | - | CI allows broken frontend |
| DEVOPS-003 | INF-001 | - | No auto-scaling |
| DEVOPS-004 | INF-001 | - | No zero-downtime |
| FE-005 | FE-006 | - | No onboarding flow |
| OBS-004 | OBS-001 | - | No APM visibility |
| TEST-002 | TEST-001 | - | No performance baseline |

---

## Dependency Matrix

```
                  ┌───────────────────────────────────────────── Dependencies ─────────────────────────────────────────────┐
                  │ SEC-010 SEC-005 SEC-006 BE-001 OBS-001 INF-001 FE-004 DB-001 AI-001 AI-004 BE-004 DB-002 BE-009 INF-002 │
┌─────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ SEC-009         │    ✓                                                                                                  │
│ SEC-007         │          ✓                                                                                            │
│ SEC-008         │                 ✓                                                                                     │
│ BE-005          │                        ✓                                                                              │
│ BE-002          │                               ✓                                                                       │
│ BE-008          │                               ✓                                                                       │
│ INF-003         │                                      ✓                                                                │
│ DB-001          │                                      ✓                                                                │
│ INF-002         │                                      ✓                                                                │
│ INF-005         │                                      ✓        ✓                                                       │
│ DEVOPS-002      │                                      ✓                                                                │
│ DEVOPS-003      │                                      ✓                                                                │
│ DEVOPS-004      │                                      ✓                                                                │
│ INF-004         │                                      ✓                                                                │
│ DEVOPS-001      │                                                     ✓                                                 │
│ BE-010          │          ✓                                                                                            │
│ AI-003          │                                                                  ✓                                     │
│ AI-006          │                                                                         ✓                              │
│ DB-003          │                                                                              ✓                        │
│ DB-004          │                                                                                     ✓                 │
│ BUS-003         │                                                                                            ✓          │
│ BUS-006         │                                                                                   ✓                   │
│ BUS-007         │                                                                     ✓                                  │
│ INF-006         │                                                                                            ✓          │
│ INF-008         │                                                                                            ✓          │
│ OBS-004         │                               ✓                                                                       │
│ FE-005          │                                                                                                        │
└─────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Network Graph (Simplified)

```
                        ┌─────────────────┐
                        │  SEC-010 (2h)   │ ← No deps, MUST be first
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │  SEC-009 (8h)   │
                        └────────┬────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
   ┌────────▼────────┐  ┌───────▼────────┐  ┌────────▼────────┐
   │  All other P0   │  │   BE-001 (80h) │  │  INF-001 (120h) │
   │  Security fixes │  │   [Celery]     │  │   [K8s] ⚠       │
   │  (SEC-001-006,  │  └───────┬────────┘  └────────┬────────┘
   │   SEC-011)      │          │                     │
   └────────┬────────┘          │                     │
            │            ┌──────▼────────┐   ┌────────▼────────┐
            │            │ BE-005 (16h)  │   │ DB-001 (80h)    │
            │            │ [Graceful]    │   │ [Replica Set]   │
            │            └───────┬───────┘   └────────┬────────┘
            │                    │                     │
            │                    │              ┌──────▼────────┐
            │                    │              │ INF-005 (40h) │
            │                    │              │ [Backup]      │
            │                    │              └───────┬───────┘
            │                    │                      │
            │            ┌───────▼────────┐   ┌────────▼────────┐
            │            │ OBS-001 (80h)  │   │ INF-002 (80h)   │
            │            │ [Logging]      │   │ [Monitoring]    │
            │            └───────┬────────┘   └────────┬────────┘
            │                    │                     │
            │            ┌──────▼────────┐   ┌────────▼────────┐
            │            │ BE-002 (16h)  │   │ INF-003 (60h)   │
            │            │ [Error Hndlr] │   │ [Secrets]       │
            │            └───────┬───────┘   └────────┬────────┘
            │                    │                     │
            │            ┌──────▼────────┐   ┌────────▼────────┐
            │            │ BE-008 (8h)   │   │ DEVOPS-002 (24h)│
            │            │ [Request ID]  │   │ [Ingress/TLS]   │
            │            └───────┬───────┘   └────────┬────────┘
            │                    │                     │
            │            ┌───────▼────────┐   ┌────────▼────────┐
            │            │ BE-007 (40h)   │   │ DEVOPS-003 (16h)│
            │            │ [Caching]      │   │ [HPA]           │
            │            └───────┬────────┘   └────────┬────────┘
            │                    │                     │
            │            ┌──────▼────────┐   ┌────────▼────────┐
            │            │ INF-007 (16h) │   │ DEVOPS-004 (16h)│
            │            │ [RateLimit]   │   │ [Zero-downtime] │
            │            └───────────────┘   └─────────────────┘
            │
            ├──────────────────────────────────────────────────┐
            │                                                  │
   ┌────────▼────────┐                                ┌───────▼────────┐
   │ TEST-001 (200h) │                                │ AI-001 (40h)   │
   │ [Tests] ⚠      │                                │ [Cost Track]   │
   └────────┬────────┘                                └───────┬────────┘
            │                                                  │
   ┌────────▼────────┐                                ┌───────▼────────┐
   │ TEST-002 (80h)  │                                │ AI-003 (24h)   │
   │ [Perf/Load]     │                                │ [LLM Rate]     │
   └─────────────────┘                                └────────────────┘
```

---

## Dependency Graph by Sprint

### Sprint 0 (Weeks 1-2)
```
SEC-010 → SEC-009
SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006, SEC-011 (parallel)
BE-001 (parallel)
INF-001 (parallel)
FE-003, FE-004 (parallel)
TEST-001 (start, parallel)
```

### Sprint 1 (Weeks 3-4)
```
SEC-005 → SEC-007
SEC-006 → SEC-008
INF-001 → DB-001, INF-002, INF-003, DEVOPS-002
BE-001 → BE-005
OBS-001 → BE-002, BE-008
FE-004 → DEVOPS-001
DB-001 → INF-005
```

### Sprint 2 (Weeks 5-6)
```
AI-001 → AI-003
BE-007 → INF-007
INF-001 → DEVOPS-003, DEVOPS-004
OBS-001 → OBS-004
BE-004 → BUS-006
TEST-001 → TEST-002
```

### Sprint 3 (Weeks 7-8)
```
DB-002 → DB-003
BE-009 → DB-004
SEC-005 → BE-010
AI-004 → AI-006
INF-002 → INF-006, INF-008
FE-006 → FE-005
```

### Sprint 4 (Weeks 9-10)
```
INF-002 → BUS-003
DEVOPS-004 → Blue/Green, Canary
All Layer 0/1/2 complete → Performance optimization
```

### Sprint 5 (Weeks 11-14)
```
All SEC complete → AUDIT-001 → AUDIT-002 → AUDIT-003
INF-005, DEVOPS-004 → LAUNCH-001 (DR), LAUNCH-010 (Rollback)
All complete → LAUNCH-007 (Production deployment)
```

---

## Key Insights

### 1. INF-001 (K8s) is the single biggest bottleneck
- Blocks 6+ tasks directly
- Is on the critical path for everything infrastructure
- **Mitigation:** Start INF-001 in Sprint 0 with dedicated resource

### 2. TEST-001 (200h) is the largest single effort
- Must be spread across sprints
- Blocks TEST-002 (performance testing)
- **Mitigation:** Start in Sprint 0, dedicated QA resource, parallelize test writing

### 3. Security fixes are largely independent
- Most SEC items have no dependencies
- Can be done in parallel by one engineer
- **Mitigation:** Dedicate Engineer A to all SEC in Sprint 0

### 4. Observability is a gateway dependency
- OBS-001 blocks BE-002 (error handler) and BE-008 (request ID)
- **Mitigation:** Start OBS-001 early in Sprint 1, coordinate with backend team

### 5. Business tasks have few tech dependencies
- BUS-001, BUS-002, BUS-004 can start immediately
- **Mitigation:** PM can begin these without waiting for engineering

### 6. Frontend work is mostly independent
- FE-001 through FE-007 have minimal dependencies
- **Mitigation:** Frontend engineer can work in parallel streams throughout

### 7. *(Added 2026-07-03)* SEC-014 was resolved same day it was found
- Was the single highest-priority item in this graph — unlike every other Layer 0 item, it blocked the entire product (no registration, no login) rather than one feature or one attack surface. Fixed by pinning `bcrypt==4.0.1`, verified with a real register+login round-trip.
- Fixing it uncovered SEC-016 (an `_id`/ObjectId serialization crash on registration, unreachable until SEC-014 stopped blocking the hashing step) — also fixed the same session.
- FE-008 (Billing/Marketplace/Settings wiring) and FE-009 (Review Board UI) are both done and had no blocking dependencies on anything in this graph — they depended only on SEC-015 (also done) for the GitHub-connect piece