# Step 3 — Database audit (MongoDB)

> Evidence-based audit. Focus: collections, indexes, doc size risk, query patterns, transactions, pooling, N+1/aggregation, TTL/archiving, backups/replication/sharding readiness.

## 1) MongoDB topology / replication readiness

### What exists
- MongoDB runs as a **3-replica-set** in `k8s/mongodb.yaml`.
- Replication is initialized via `mongodb-replica-init` Job.

Evidence:
- `k8s/mongodb.yaml`:
  - StatefulSet `replicas: 3`
  - `mongod --replSet rs0 --keyFile /data/keyfile`
  - init job runs `rs.initiate({_id:"rs0", members:[...]})`

### Sharding readiness
- **No sharding configuration found**.
- There is no evidence of a `configsvr`/`mongos` layer or sharding keys.

Conclusion:
- Supports HA/replication; **not sharding-ready** for 100k+ scale.

## 2) Collections (as implemented by index provisioning)

Mongo collections created/indexed in `backend/core/database.py`:

1. `users`
   - `email` unique index
   - `id` non-unique

2. `organizations`
   - `slug` unique

3. `projects`
   - compound: `(user_id, updated_at desc)`
   - `id`

4. `builds`
   - compound: `(project_id, user_id, created_at desc)`
   - `id`
   - compound: `(user_id, created_at desc)`

5. `build_files`
   - unique compound: `(build_id, path)`
   - index `build_id`
   - TTL on `created_at` expireAfterSeconds=7776000 (~90d)

6. `team_members`
   - unique compound: `(org_id, user_id)`

7. `subscriptions`
   - unique `stripe_subscription_id`
   - index `user_id`

8. `invitations`
   - unique `hashed_token`
   - index `org_id`

9. `credit_purchases`
   - unique `stripe_payment_intent_id`

10. `marketplace_items`
   - compound: `(type, is_public, downloads desc)`
   - text index on `title` and `description`

11. `analytics_events`
   - compound: `(user_id, event_name, created_at desc)`
   - TTL `created_at` expireAfterSeconds=7776000 (~90d)

12. `rate_limits`
   - unique `key`
   - TTL `reset_at` expireAfterSeconds=300 (5m)

13. `deployments`
   - compound: `(user_id, project_id, created_at desc)`

14. `audit_logs`
   - compound: `(actor_id, created_at desc)`
   - TTL `created_at` expireAfterSeconds=31536000 (~1y)

15. `notifications`
   - compound: `(user_id, created_at desc)`

16. `security_events`
   - compound: `(severity, created_at desc)`
   - TTL `created_at` expireAfterSeconds=7776000 (~90d)

17. `onboarding_progress`
   - unique `user_id`

18. `referrals`
   - compound: `(referrer_id, created_at desc)`

19. `feature_flags`
   - unique `key`

20. `api_keys`
   - index `user_id`
   - unique `key_hash`

21. `token_blacklist`
   - unique `jti`
   - TTL `created_at` expireAfterSeconds=86400 (24h)

22. `webhooks`
   - index `user_id`

### Agile PM layer collections
23. `initiatives` (index `(user_id, updated_at desc)`, `id`)
24. `prds` (unique `(initiative_id)`)
25. `epics` (index `(initiative_id, order)`)
26. `stories` (index `(epic_id, order)` + index `initiative_id`)
27. `tasks` (index `(initiative_id, status, kanban_order)` + `story_id`, `sprint_id`)
28. `sprints` (index `(initiative_id, sprint_number)`)
29. `standups` (index `(sprint_id, date desc)`) 
30. `sprint_reviews` `(sprint_id, created_at desc)`
31. `sprint_retros` `(sprint_id, created_at desc)`
32. `risk_reports` `(initiative_id, created_at desc)`
33. `tech_debt_summaries` `(initiative_id, created_at desc)`
34. `agent_executions` `(initiative_id, created_at desc)` + `task_id`
35. `releases` `(initiative_id, created_at desc)`
36. `decision_log` `(initiative_id, created_at desc)`

## 3) Document size & storage constraints

### Build vs build_files separation
Evidence:
- `backend/tasks/build_tasks.py` explicitly deletes/reinserts `build_files` because of Mongo 16MB doc limit.

- `backend/tasks/build_tasks.py`:
  - comment: “Files live in a separate collection to avoid the 16MB doc limit.”
  - `db.build_files.delete_many({"build_id": build_id})`
  - `insert_many([... BuildFile ...])`

Implication:
- Mitigates worst-case doc size risk for generated artifacts.

### Remaining size risk
- `builds` stores prompt, business_model, agents steps, and potentially large error strings.
- `backend/core/orchestrator.py` emits BUILD_COMPLETE with payload:
  - includes `files` and `validation` and `business_model`.
- Even if `build_files` is separated, WS payload still contains `files` at BUILD_COMPLETE.

Therefore:
- Mongo doc sizes for `build_files` are controlled.
- Mongo doc sizes for `builds` may grow with `agents` list / business_model; likely bounded but not proven.

## 4) Query patterns & N+1 risks

### Known query patterns from code evidence
- Auth checks commonly use indexed fields:
  - `users.email` in `backend/api/auth.py:login`.
  - `users.id` in `ws_manager.get_ws_user()`.

- Builds & project reads:
  - `projects` list uses `(user_id, updated_at desc)` index.
  - Build lists use `builds` indexes for `(user_id, created_at desc)`.

- Build file retrieval:
  - `backend/api/builds.py:get_build_files` fetches all `build_files` by `build_id` and returns a map of `path -> content`.
  - `build_files` has index `(build_id, path)` and `build_id`.

- Budget usage:
  - `backend/core/ai_usage.py:get_user_budget` uses aggregation pipeline on `db.ai_usage`.

Potential N+1 patterns:
- Some endpoints fetch parent docs then multiple related docs.
- Example: `backend/api/projects.py:get_project_builds` excludes `files` (good) but still reads builds only.
- In `backend/api/auth.py:list_members`, it performs a `team_members.find` then `users.find` with `$in` (good: batch), not N+1.

Big risk areas not fully evidenced here:
- The `get_user_budget` function relies on `db.ai_usage.aggregate(...)` but the index provisioning for `ai_usage` is not shown.
  - However Step 3 includes “evidence-based”; since index provisioning doesn’t mention `ai_usage`, this is a likely missing index.

## 5) Transactions / atomicity

Evidence:
- Credits reservation uses atomic `find_one_and_update` with `$inc` and guard `$gte` in `backend/api/builds.py:create_build`.
- Refund uses `find_one_and_update` with `$gte` guard in `backend/tasks/build_tasks.py`.

These are atomic single-document updates.

Conclusion:
- No multi-document transactions detected; correctness relies on atomic updates and careful refund guards.

## 6) Aggregation usage

Evidence:
- `backend/core/ai_usage.py:get_user_budget` uses aggregation with `$match` and `$group` to compute token/cost sums.

- Billing usage dashboards and other analytics may use aggregation, but only `ai_usage` is clearly evidenced.

Risk:
- Aggregations on large collections can become expensive without appropriate indexes.
- Since index provisioning in `database.py` doesn’t include indexes for `ai_usage`, aggregation performance at scale is uncertain.

## 7) TTL collections / archiving strategy

TTL evidence from `backend/core/database.py`:
- `build_files.created_at` TTL 90 days
- `analytics_events.created_at` TTL 90 days
- `security_events.created_at` TTL 90 days
- `rate_limits.reset_at` TTL 5 min
- `audit_logs.created_at` TTL 1 year
- `token_blacklist.created_at` TTL 24h

Archiving:
- No separate archiving system discovered (only TTL deletes).

## 8) Backups / disaster recovery

Evidence:
- Repo contains `scripts/backup_mongodb.py` (present in file tree) but there is **no evidence here** it is scheduled.
- Kubernetes includes `k8s/mongodb-backup-cronjob.yaml` (not read in this audit).

Conclusion:
- Backups may exist, but this step can’t confirm correctness/schedule without reading the cronjob manifest.
- Backup/DR remains a likely scalability/reliability gap.

## 9) Connection pooling & concurrency

Evidence:
- Mongo client configured with:
  - `maxPoolSize=50`
  - `minPoolSize=10`
  - `waitQueueTimeoutMS=10000`
  - `serverSelectionTimeoutMS=5000`
  - `connectTimeoutMS=10000`

Implication:
- Under bursty load, requests will queue up to 10s, then fail.
- This is a good fail-fast posture for high concurrency.

## 10) Sharding readiness

Evidence:
- No sharding keys or sharding config.
- Collections include `user_id`, `project_id`, `initiative_id`.

Conclusion:
- For 100k+ active users with heavy build writes, scaling horizontally would likely require sharding.
- Sharding readiness is **low**; would require picking sharding keys and adapting query patterns.

---

# Step 3 — load estimates (evidence-based, structural)

## Maximum sustainable load (qualitative estimate)
Because LLM cost/latency dominates compute, DB limits primarily come from:
- `builds` updates triggered by many WS events
- `build_files` large write volume at build completion

Evidence constraints:
- Step 3 cannot precisely model event frequency per build from repo evidence alone.

What can be concluded structurally:
- Mongo handles high write rates if:
  - indexes cover the main filters (`user_id`, `project_id`, `build_id`, `created_at`)
  - `ai_usage` aggregation has needed indexes (not evidenced)

Primary scaling risk:
- Aggregation on `ai_usage` without demonstrated indexes.

Secondary risk:
- High-cardinality write load to `builds` and `build_files` during concurrent builds.

---

# Step 3 — blockers tied to scalability milestones

## Prevents reaching 100 concurrent users?
- Unlikely based on indexes + pooling.
- The bigger risk is LLM/worker capacity, not Mongo.

## Prevents reaching 1,000 concurrent users?
- Possible DB bottleneck if WS event persistence multiplies write amplification.

## Prevents reaching 10,000+ concurrent users?
- Likely: build event write amplification + lack of demonstrated sharding.

## Prevents reaching 100,000 concurrent users?
- Mongo replication can’t handle that write volume without sharding or aggressive data model redesign.

## Prevents reaching 1 million registered users?
- Without sharding and archive-by-system (beyond TTL), index sizes and aggregation cost will grow.

---

# Step 3 — Evidence-backed recommendations (prioritized)

P0 (must do before large-scale):
- Add and verify indexes for any aggregation-heavy collections used in the hot path.
  - Specifically: `ai_usage` is used by `backend/core/ai_usage.py:get_user_budget` but no indexes are provisioned for it in `backend/core/database.py`.

P1:
- Verify backup/DR by reading `k8s/mongodb-backup-cronjob.yaml` and confirming retention + offsite storage.

P1:
- Reduce WS event DB write amplification:
  - currently, build events persist before pub/sub publish in `backend/tasks/build_tasks.py:emit`.

P2:
- Prepare sharding plan:
  - choose sharding key (likely `user_id`/`project_id`/`initiative_id`) and ensure query patterns are compatible.

