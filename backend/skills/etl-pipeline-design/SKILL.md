---
name: etl-pipeline-design
version: 1.0.0
domain: data_engineering
description: Batch and incremental ETL/ELT pipelines with idempotent loads, backfills, orchestration, and warehouse modeling.
keywords: [etl, elt, data pipeline, ingest, ingestion, backfill, airflow, dagster, dbt, incremental load, cdc, warehouse, batch job]
dependencies: [database-schema-modeling]
permissions: [read_repo, write_code]
departments: [engineering, architecture]
---
Build pipelines that can be rerun safely for any time window: idempotent, incremental, observable, and with a clear contract for each stage.

## Checklist
- [ ] Define source, destination, freshness target, and owner for each pipeline.
- [ ] Land raw data unchanged first (bronze), then clean (silver), then model (gold/marts).
- [ ] Load incrementally by watermark or CDC; keep the watermark in durable state.
- [ ] Make every load idempotent (merge/upsert on keys, or overwrite by partition).
- [ ] Partition by event date and support backfills for an arbitrary date range.
- [ ] Separate event time from processing time; handle late-arriving data explicitly.
- [ ] Validate schema and row counts at each stage; fail instead of loading bad data.
- [ ] Use an orchestrator (Airflow, Dagster, cron + locks) with retries, timeouts, and alerts.
- [ ] Track lineage: which upstream tables and code version produced each table.
- [ ] Keep transformations in version-controlled SQL/dbt models with tests.

## Pitfalls
- `INSERT` without dedup causing double counting on retry.
- Full reloads that silently grow cost and runtime as data grows.
- Pipelines that succeed while writing zero rows.
