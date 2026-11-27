/**
 * Demo data for the Approvals inbox: governance gates from kernel runs across
 * several projects, shaped like KernelRun.approval_gates + run context.
 */
import type { ApprovalGate } from "../kernelApi"

export interface DemoGateRecord {
  projectId: string
  projectName: string
  runId: string
  objective: string
  runStatus: string
  requestedBy: string
  riskLevel: "low" | "medium" | "high"
  gate: ApprovalGate
}

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

export function buildDemoGates(): DemoGateRecord[] {
  return [
    {
      projectId: "demo-project",
      projectName: "Checkout service",
      runId: "krun_7c41e0",
      objective: "Ship idempotent payment retries with a migration for the ledger table",
      runStatus: "waiting_approval",
      requestedBy: "release_manager",
      riskLevel: "high",
      gate: {
        gate_id: "gate_delivery_7c41",
        gate_name: "pre_delivery_approval",
        reason: "Wave 3 runs a schema migration on the ledger table and deploys to production. Repair loop closed 2 blocking findings; 1 medium finding (retry jitter) accepted with a follow-up.",
        wave_index: 3,
        status: "pending",
        decided_by: null,
        note: "",
        created_at: ago(14),
      },
    },
    {
      projectId: "proj-analytics",
      projectName: "Analytics pipeline",
      runId: "krun_52aa9d",
      objective: "Backfill 90 days of events into the new partitioned warehouse tables",
      runStatus: "waiting_approval",
      requestedBy: "data_engineer",
      riskLevel: "medium",
      gate: {
        gate_id: "gate_budget_52aa",
        gate_name: "budget_overrun_approval",
        reason: "Projected spend $3.40 exceeds the run budget of $2.50 by 36%. Backfill parallelism was already halved.",
        wave_index: 2,
        status: "pending",
        decided_by: null,
        note: "",
        created_at: ago(52),
      },
    },
    {
      projectId: "proj-mobile",
      projectName: "Mobile onboarding",
      runId: "krun_19fe03",
      objective: "Redesign the first-run flow and add passkey sign-in",
      runStatus: "waiting_approval",
      requestedBy: "security_engineer",
      riskLevel: "medium",
      gate: {
        gate_id: "gate_security_19fe",
        gate_name: "security_review_approval",
        reason: "New authentication path (passkeys) touches session issuance. Threat model attached to the blackboard; no blocking findings.",
        wave_index: 2,
        status: "pending",
        decided_by: null,
        note: "",
        created_at: ago(185),
      },
    },
    {
      projectId: "demo-project",
      projectName: "Checkout service",
      runId: "krun_7a0b22",
      objective: "Add rate limiting to the public cart API",
      runStatus: "completed",
      requestedBy: "release_manager",
      riskLevel: "low",
      gate: {
        gate_id: "gate_delivery_7a0b",
        gate_name: "pre_delivery_approval",
        reason: "Delivery of rate limiting middleware behind a feature flag.",
        wave_index: 3,
        status: "approved",
        decided_by: "maya@forge.dev",
        note: "Flag defaults off. Ship it.",
        created_at: ago(60 * 26),
        decided_at: ago(60 * 25),
      },
    },
    {
      projectId: "proj-analytics",
      projectName: "Analytics pipeline",
      runId: "krun_4f1c70",
      objective: "Drop the legacy events_v1 table",
      runStatus: "cancelled",
      requestedBy: "data_engineer",
      riskLevel: "high",
      gate: {
        gate_id: "gate_destructive_4f1c",
        gate_name: "destructive_change_approval",
        reason: "Irreversible DROP TABLE with 3 downstream dashboards still reading from it.",
        wave_index: 1,
        status: "rejected",
        decided_by: "omar@forge.dev",
        note: "Migrate the dashboards first.",
        created_at: ago(60 * 50),
        decided_at: ago(60 * 49),
      },
    },
    {
      projectId: "proj-mobile",
      projectName: "Mobile onboarding",
      runId: "krun_11d8e4",
      objective: "Localise onboarding copy into 6 languages",
      runStatus: "completed",
      requestedBy: "product_manager",
      riskLevel: "low",
      gate: {
        gate_id: "gate_delivery_11d8",
        gate_name: "pre_delivery_approval",
        reason: "Copy-only change, reviewed by the UX writer agent.",
        wave_index: 2,
        status: "approved",
        decided_by: "maya@forge.dev",
        note: "",
        created_at: ago(60 * 75),
        decided_at: ago(60 * 74),
      },
    },
  ]
}
