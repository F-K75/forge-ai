# Feeding external CI/monitoring signals into Forge's Repository Monitoring

`POST /v1/projects/{project_id}/monitoring/webhook/findings` (see
`backend/api/monitoring_webhook.py`) lets an external system -- a CI
pipeline, a dependency scanner, a linter step -- report a finding into a
project's engineering org. HIGH/CRITICAL findings are auto-escalated: a
change request gets opened against the right specialist (via the Task
Router) and a chat escalation message is posted, without anyone polling
anything.

This endpoint is authenticated the same way any other machine-to-Forge
integration is: a Forge API key (`Settings -> API Keys` in the app, or
`POST /api-keys/` if calling the API directly), sent as an `X-API-Key`
header. It is **not** a public unauthenticated webhook -- treat the key like
any other credential, store it as a repo/CI secret, never commit it.

## Payload

```json
{
  "category": "ci_failure",
  "severity": "high",
  "title": "Build failed on main",
  "description": "pytest exited 1 in the auth suite",
  "source": "github-actions",
  "auto_escalate": true
}
```

- `category`: one of `ci_failure`, `security`, `performance_regression`,
  `dependency_update`, `tech_debt`, `test_failure`, `dead_code`,
  `large_bundle`, `memory_leak`, `outdated_package`, `broken_documentation`.
- `severity`: `low`, `medium`, `high`, `critical`. Only `high`/`critical`
  trigger auto-escalation.
- `source`: free text -- name your integration however you like
  (`"github-actions"`, `"dependabot"`, `"snyk"`, ...). Defaults to
  `"webhook"` if omitted.
- `auto_escalate`: set `false` if you only want the finding recorded, not
  turned into a change request.

## Example: GitHub Actions

`ci-monitor.yml` -- runs after your existing test job, reports a failure as
a Forge finding. Requires a `FORGE_API_KEY` repo secret and knowing the
Forge `project_id` you're reporting into (`FORGE_PROJECT_ID` below -- find
it in the project's URL or via `GET /projects/`).

```yaml
name: Report CI failures to Forge

on:
  workflow_run:
    workflows: ["CI"]          # the workflow whose failures you want reported
    types: [completed]

jobs:
  report-to-forge:
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    runs-on: ubuntu-latest
    steps:
      - name: Post finding to Forge
        env:
          FORGE_API_KEY: ${{ secrets.FORGE_API_KEY }}
          FORGE_PROJECT_ID: ${{ secrets.FORGE_PROJECT_ID }}
          FORGE_API_URL: https://api.your-forge-instance.example.com
        run: |
          curl -sf -X POST \
            "$FORGE_API_URL/v1/projects/$FORGE_PROJECT_ID/monitoring/webhook/findings" \
            -H "Content-Type: application/json" \
            -H "X-API-Key: $FORGE_API_KEY" \
            -d '{
              "category": "ci_failure",
              "severity": "high",
              "title": "CI failed on '"${{ github.event.workflow_run.head_branch }}"'",
              "description": "Workflow run: '"${{ github.event.workflow_run.html_url }}"'",
              "source": "github-actions"
            }'
```

A ready-to-copy version of this lives at
`docs/integrations/github-actions-ci-monitor.yml` in this repo.

## What happens next

1. The finding is stored (`GET /v1/projects/{id}/org/monitoring/findings` to
   see it, filterable by `status`/`category`).
2. If HIGH/CRITICAL and `auto_escalate` wasn't disabled: the Task Router
   classifies `"{title}: {description}"` to find the right specialist, a
   change request opens in the `planning` stage assigned to them, and an
   ESCALATION-type chat message gets posted addressed to that agent.
3. A human (or another agent) resolves it via
   `POST /v1/projects/{id}/org/monitoring/findings/{finding_id}/resolve`.

Both the org dashboard's Monitoring Findings panel and the underlying
`GET`/`POST /v1/projects/{id}/org/monitoring/findings` endpoints (session-
authenticated, for humans/internal agents) work identically to this
API-key-authenticated path -- they call the same
`RepositoryMonitor.record_finding()` underneath.
