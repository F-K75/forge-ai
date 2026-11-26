---
name: database-schema-modeling
version: 1.0.0
domain: data_engineering
description: Schema design, composite indexing, safe non-destructive migrations, and query performance.
keywords: [database, mongo, postgres, sql, schema, migration, index, billing, data]
dependencies: []
permissions: [read_repo]
departments: [engineering, architecture]
---
Design idempotent, backward-compatible migrations, index hot filter keys, and parameterize every query.

## Schema checklist
- [ ] Model around access patterns: list the queries before choosing fields and collections/tables.
- [ ] Every record has a stable id, `created_at`, `updated_at`, and tenant/project id where applicable.
- [ ] Use soft deletes (`deleted_at`) where history or undo matters; filter them in every query.
- [ ] Enforce constraints in the database (unique, not null, foreign keys/validators), not only in code.
- [ ] Store money as integer minor units or decimals, never floats.

## Index checklist
- [ ] Add composite indexes matching filter + sort order of hot queries (equality, then sort, then range).
- [ ] Add unique indexes for natural keys and idempotency keys.
- [ ] Remove unused indexes; each one slows writes.

## Migration checklist
- [ ] Expand, migrate, contract: add new fields first, backfill, switch reads, then remove old fields.
- [ ] Make migrations idempotent and resumable; batch large backfills.
- [ ] Keep the previous app version working against the new schema during rollout.
- [ ] Build large indexes online/concurrently.
- [ ] Parameterize every query; never interpolate user input.

## Pitfalls
- Renaming a column in one step and breaking running pods.
- Unbounded arrays or documents that grow forever.
