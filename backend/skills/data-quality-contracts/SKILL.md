---
name: data-quality-contracts
version: 1.0.0
domain: data_engineering
description: Data contracts, validation checks, freshness and volume monitoring, deduplication, and schema-drift detection.
keywords: [data quality, data contract, data validation, schema drift, freshness, dedup, duplicate rows, null rate, great expectations, anomaly, reconcil, data test]
dependencies: []
permissions: [read_repo, run_tests]
departments: [engineering, quality]
---
Make data expectations explicit and machine-checked at the boundaries where data enters and leaves each system, and alert before consumers notice.

## Checklist
- [ ] Write a contract for each shared dataset: schema, types, keys, semantics, owner, SLA.
- [ ] Version contracts; breaking changes need a migration window and consumer sign-off.
- [ ] Check primary key uniqueness and not-null on required fields.
- [ ] Check accepted values and ranges (enums, non-negative amounts, valid dates).
- [ ] Check referential integrity between related tables.
- [ ] Monitor freshness (latest timestamp) and volume (row count vs expected range).
- [ ] Detect schema drift at ingestion and fail or quarantine unexpected columns.
- [ ] Reconcile totals against the source of truth (e.g. billing vs warehouse revenue).
- [ ] Route failures to the owning team with a sample of bad rows.
- [ ] Add a regression check for every data incident.

## Pitfalls
- Checks that only run in dashboards after bad data has spread.
- Alert fatigue from thresholds never tuned to normal variation.
