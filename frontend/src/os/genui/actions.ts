/**
 * Action dispatch for generated surfaces.
 *
 * A2UI `Action.event` on a component → A2UI v1.0 `action` message →
 * `UserActionRequest` → `POST /v1/os/sessions/{id}/actions`. The request is
 * validated against the contract before it leaves the client. The component
 * shows an optimistic pending state (surfaceStore.beginAction) until the
 * stream's `action.result` settles it, the POST fails, or a timeout fires.
 *
 * Confirmation: actions that look destructive (danger button, a name like
 * delete/remove/destroy/…, a high or critical risk level, or anything the
 * injected `isDestructive` says) go through the `confirm` hook first. The
 * server still enforces `requires_confirmation`; this is the client half.
 */
import type { A2UIUserAction, JsonObject, OsId, UserActionRequest } from "../contracts"
import { validateContract } from "../validate"
import { resolveDeep, type BindingContext } from "./binding"
import { postUserAction, type PostUserAction } from "./actionsApi"
import type { DispatchHint } from "./registry/types"
import type { SurfaceStore } from "./surfaceStore"

export interface ConfirmRequest {
  surfaceId: OsId
  componentId: string
  actionName: string
  label: string | null
  riskLevel: string | null
  context: JsonObject
}

/** Return true to proceed. May be async (a dialog). */
export type ConfirmHook = (request: ConfirmRequest) => boolean | Promise<boolean>

export interface DispatchInput {
  surfaceId: OsId
  componentId: string
  action: unknown
  binding: BindingContext
  extraContext?: JsonObject
  hint?: DispatchHint
}

export type DispatchResult =
  | { status: "sent"; actionId: OsId }
  | { status: "cancelled" }
  | { status: "invalid"; errors: { path: string; message: string }[] }
  | { status: "failed"; actionId: OsId; error: string }
  | { status: "no_session" }

export interface ActionDispatcher {
  dispatch: (input: DispatchInput) => Promise<DispatchResult>
}

export interface ActionDispatcherOptions {
  store: SurfaceStore
  sessionId: OsId | null | (() => OsId | null)
  turnId?: () => OsId | null
  post?: PostUserAction
  confirm?: ConfirmHook
  isDestructive?: (actionName: string) => boolean
  /** Called with the action's resolved `userMessage`, if any (the shell may echo it in the transcript). */
  onUserMessage?: (text: string) => void
  /** Fail a still-pending action after this long (ms). Default 60 s. 0 disables. */
  pendingTimeoutMs?: number
  newId?: () => OsId
  now?: () => string
}

export const DESTRUCTIVE_ACTION = /(^|[._-])(delete|remove|destroy|drop|purge|revoke|reset|wipe|terminate|uninstall)([._-]|$)/i

export function defaultActionId(): OsId {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === "function") return `act_${c.randomUUID()}`
  return `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/** Default confirmation: the browser dialog. The shell should inject an Ember-styled dialog instead. */
export const windowConfirm: ConfirmHook = (req) =>
  typeof window !== "undefined" && typeof window.confirm === "function"
    ? window.confirm(`${req.label ?? req.actionName}: are you sure?`)
    : false

interface ParsedAction {
  name: string
  context: unknown
  userMessage: unknown
}

function parseAction(action: unknown): ParsedAction | null {
  if (typeof action !== "object" || action === null) return null
  const event = (action as { event?: unknown }).event
  if (typeof event !== "object" || event === null) return null
  const e = event as Record<string, unknown>
  if (typeof e.name !== "string") return null
  return { name: e.name, context: e.context, userMessage: e.userMessage }
}

function errorMessage(err: unknown): string {
  const r = (err as { response?: { status?: number; data?: { detail?: unknown } } } | null)?.response
  if (r?.data && typeof r.data.detail === "string") return r.data.detail.slice(0, 300)
  if (typeof r?.status === "number") return `The action failed (HTTP ${r.status}).`
  return "The action could not be sent."
}

export function createActionDispatcher(opts: ActionDispatcherOptions): ActionDispatcher {
  const post = opts.post ?? postUserAction
  const confirm = opts.confirm ?? windowConfirm
  const newId = opts.newId ?? defaultActionId
  const now = opts.now ?? (() => new Date().toISOString())
  const timeoutMs = opts.pendingTimeoutMs ?? 60_000
  const sessionOf = () => (typeof opts.sessionId === "function" ? opts.sessionId() : opts.sessionId)

  const dispatch: ActionDispatcher["dispatch"] = async (input) => {
    const parsed = parseAction(input.action)
    if (!parsed) return { status: "invalid", errors: [{ path: "/action", message: "not an Action.event" }] }
    const sessionId = sessionOf()
    if (!sessionId) return { status: "no_session" }

    const resolved = resolveDeep(parsed.context ?? {}, input.binding)
    const context: JsonObject = {
      ...(typeof resolved === "object" && resolved !== null && !Array.isArray(resolved) ? (resolved as JsonObject) : {}),
      ...(input.extraContext ?? {}),
    }

    const risk = input.hint?.riskLevel ?? null
    const destructive =
      input.hint?.destructive === true ||
      DESTRUCTIVE_ACTION.test(parsed.name) ||
      risk === "high" ||
      risk === "critical" ||
      opts.isDestructive?.(parsed.name) === true
    if (destructive) {
      let ok = false
      try {
        ok = await confirm({
          surfaceId: input.surfaceId,
          componentId: input.componentId,
          actionName: parsed.name,
          label: input.hint?.label ?? null,
          riskLevel: risk,
          context,
        })
      } catch {
        ok = false
      }
      if (!ok) return { status: "cancelled" }
    }

    const a2ui: A2UIUserAction = {
      version: "1.0",
      action: {
        name: parsed.name,
        surfaceId: input.surfaceId,
        sourceComponentId: input.componentId,
        timestamp: now(),
        context,
      },
    }
    const actionId = newId()
    const turnId = opts.turnId?.() ?? opts.store.getState().surfaces[input.surfaceId]?.turnId ?? null
    const request: UserActionRequest = { action_id: actionId, session_id: sessionId, turn_id: turnId, a2ui }
    const check = validateContract("UserActionRequest", request)
    if (!check.valid) return { status: "invalid", errors: check.errors }

    const userMessage = resolveDeep(parsed.userMessage, input.binding)
    if (typeof userMessage === "string" && userMessage) opts.onUserMessage?.(userMessage)

    const store = opts.store.getState()
    store.beginAction({ actionId, surfaceId: input.surfaceId, componentId: input.componentId, name: parsed.name })
    if (timeoutMs > 0) {
      setTimeout(() => {
        const entry = opts.store.getState().actions[actionId]
        if (entry && (entry.status === "pending" || entry.status === "accepted")) {
          opts.store.getState().settleAction(actionId, "failed", "No response from the server. Try again.")
        }
      }, timeoutMs)
    }
    try {
      await post(sessionId, request)
      const entry = opts.store.getState().actions[actionId]
      if (entry?.status === "pending") opts.store.getState().settleAction(actionId, "accepted")
      return { status: "sent", actionId }
    } catch (err) {
      const error = errorMessage(err)
      opts.store.getState().settleAction(actionId, "failed", error)
      return { status: "failed", actionId, error }
    }
  }

  return { dispatch }
}
