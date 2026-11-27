/**
 * Data access for the Approvals inbox. There is no cross-project gate endpoint,
 * so LIVE_MODE fans out over the user's projects: GET /kernel/runs per project,
 * collecting `approval_gates`. Decisions go through the kernel gate endpoints
 * (POST .../gates/{gate_id}/approve|reject), the same ones KernelInspectorPanel uses.
 */
import { LIVE_MODE } from "./env"
import { kernelApi, protocolApi, type A2UISurface, type ApprovalGate, type KernelRun } from "./kernelApi"
import { buildDemoGates, type DemoGateRecord } from "./demo/approvalsDemo"

export interface ApprovalItem {
  key: string
  projectId: string
  projectName: string
  runId: string
  objective: string
  runStatus: string
  requestedBy: string
  riskLevel?: string | null
  gate: ApprovalGate
}

export const itemKey = (projectId: string, runId: string, gateId: string) => `${projectId}::${runId}::${gateId}`

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

let demoGates: DemoGateRecord[] | null = null
const demo = () => (demoGates ??= buildDemoGates())

/** Reset in-memory demo decisions (tests). */
export function resetApprovalsDemoState() {
  demoGates = null
}

/** The role whose wave finished right before the gate, i.e. who asked for sign-off. */
function requesterFor(run: KernelRun, gate: ApprovalGate): string {
  const before = (run.tasks ?? []).filter((t) => t.wave_index < gate.wave_index)
  if (!before.length) return "kernel"
  const lastWave = Math.max(...before.map((t) => t.wave_index))
  const roles = Array.from(new Set(before.filter((t) => t.wave_index === lastWave).map((t) => t.role)))
  return roles.slice(0, 2).join(", ") || "kernel"
}

export async function fetchApprovals(projects: Array<{ id: string; name: string; displayName?: string }>): Promise<ApprovalItem[]> {
  if (!LIVE_MODE) {
    await delay(120)
    return demo().map((d) => ({
      key: itemKey(d.projectId, d.runId, d.gate.gate_id),
      projectId: d.projectId,
      projectName: d.projectName,
      runId: d.runId,
      objective: d.objective,
      runStatus: d.runStatus,
      requestedBy: d.requestedBy,
      riskLevel: d.riskLevel,
      gate: { ...d.gate },
    }))
  }
  const perProject = await Promise.allSettled(
    projects.map(async (p) => {
      const { runs } = await kernelApi.listRuns(p.id, 20)
      return (runs ?? []).flatMap((run) =>
        (run.approval_gates ?? []).map<ApprovalItem>((gate) => ({
          key: itemKey(p.id, run.id, gate.gate_id),
          projectId: p.id,
          projectName: p.displayName || p.name,
          runId: run.id,
          objective: run.objective,
          runStatus: run.status,
          requestedBy: requesterFor(run, gate),
          riskLevel: null,
          gate,
        }))
      )
    })
  )
  if (projects.length && perProject.every((r) => r.status === "rejected")) {
    throw (perProject[0] as PromiseRejectedResult).reason
  }
  return perProject.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
}

/** Synthesise the kernel's approval surface when the run's A2UI surfaces don't include it. */
export function fallbackSurface(item: ApprovalItem): A2UISurface {
  return {
    surface_id: `a2ui_gate_${item.gate.gate_id}`,
    protocol: "a2ui/v1",
    title: `Approval Required: ${item.gate.gate_name}`,
    components: [
      {
        type: "approval_card",
        gate_id: item.gate.gate_id,
        gate_name: item.gate.gate_name,
        reason: item.gate.reason,
        wave_index: item.gate.wave_index,
        risk_level: item.riskLevel ?? null,
        actions: item.gate.status === "pending" ? ["approve", "reject"] : [],
      },
    ],
  }
}

export async function fetchGateSurface(item: ApprovalItem): Promise<A2UISurface> {
  if (!LIVE_MODE) {
    await delay(80)
    return fallbackSurface(item)
  }
  const res = await protocolApi.getA2UISurfaces(item.projectId, item.runId)
  const match = (res.surfaces ?? []).find((s) =>
    (s.components ?? []).some((c) => c && (c as Record<string, unknown>).type === "approval_card" && (c as Record<string, unknown>).gate_id === item.gate.gate_id)
  )
  return match ?? fallbackSurface(item)
}

export async function decideGate(item: ApprovalItem, action: "approve" | "reject", note = ""): Promise<ApprovalGate> {
  if (!LIVE_MODE) {
    await delay(350)
    const rec = demo().find((d) => d.runId === item.runId && d.gate.gate_id === item.gate.gate_id)
    if (!rec) throw new Error("Approval gate not found")
    rec.gate = {
      ...rec.gate,
      status: action === "approve" ? "approved" : "rejected",
      decided_by: "you@forge.dev",
      decided_at: new Date().toISOString(),
      note,
    }
    rec.runStatus = action === "approve" ? "running" : "cancelled"
    return rec.gate
  }
  const fn = action === "approve" ? kernelApi.approveGate : kernelApi.rejectGate
  const res = await fn(item.projectId, item.runId, item.gate.gate_id, note)
  return res.gate
}

export function describeDecisionError(err: unknown): string {
  const response = (err as { response?: { status?: unknown; data?: { detail?: unknown } } } | null)?.response
  const detail = response?.data?.detail
  if (typeof detail === "string" && detail.trim()) return detail.slice(0, 300)
  if (response?.status === 403) return "You do not have permission to decide this gate."
  if (response?.status === 409) return "This gate has already been decided."
  return "Unable to submit the gate decision. Please retry."
}

/** "pre_delivery_approval" -> "Pre-delivery approval" */
export function gateTitle(name: string): string {
  const s = name.replace(/^pre_/, "pre-").replace(/_/g, " ").trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
