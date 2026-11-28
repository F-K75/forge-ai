import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FORGE_CATALOG_ID, type UserActionRequest } from "../contracts"
import { validateContract } from "../validate"
import { createActionDispatcher, DESTRUCTIVE_ACTION } from "./actions"
import { createSurfaceStore } from "./surfaceStore"

function setup(overrides: Partial<Parameters<typeof createActionDispatcher>[0]> = {}) {
  const store = createSurfaceStore()
  store.getState().applyEvent({
    v: "forge-os/1",
    seq: 1,
    session_id: "ses_1",
    turn_id: "turn_7",
    ts: "2026-11-27T10:00:00Z",
    type: "a2ui.message",
    data: {
      message: {
        version: "1.0",
        createSurface: { surfaceId: "srf_1", catalogId: FORGE_CATALOG_ID, components: [], dataModel: { form: { name: "Ada" }, rows: [{ id: "r1" }] } },
      },
    },
  })
  const post = vi.fn<(sessionId: string, req: UserActionRequest) => Promise<unknown>>().mockResolvedValue({ accepted: true })
  const confirm = vi.fn().mockResolvedValue(true)
  let n = 0
  const dispatcher = createActionDispatcher({
    store,
    sessionId: "ses_1",
    post,
    confirm,
    newId: () => `act_${++n}`,
    now: () => "2026-11-27T10:00:05Z",
    ...overrides,
  })
  const binding = { dataModel: store.getState().surfaces.srf_1.dataModel, scope: null }
  return { store, post, confirm, dispatcher, binding }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("action dispatch", () => {
  it("posts a contract-valid UserActionRequest with resolved context and goes optimistic", async () => {
    const { store, post, dispatcher, binding } = setup()
    const result = await dispatcher.dispatch({
      surfaceId: "srf_1",
      componentId: "submit",
      action: { event: { name: "create_agent", context: { name: { "@path": "/form/name" }, fixed: 1 } } },
      binding,
      extraContext: { index: 0 },
    })
    expect(result).toEqual({ status: "sent", actionId: "act_1" })
    expect(post).toHaveBeenCalledTimes(1)
    const [sessionId, req] = post.mock.calls[0]
    expect(sessionId).toBe("ses_1")
    expect(req).toEqual({
      action_id: "act_1",
      session_id: "ses_1",
      turn_id: "turn_7",
      a2ui: {
        version: "1.0",
        action: {
          name: "create_agent",
          surfaceId: "srf_1",
          sourceComponentId: "submit",
          timestamp: "2026-11-27T10:00:05Z",
          context: { name: "Ada", fixed: 1, index: 0 },
        },
      },
    })
    expect(validateContract("UserActionRequest", req).valid).toBe(true)
    expect(store.getState().actions.act_1.status).toBe("accepted")
  })

  it("resolves item-scoped bindings inside templates", async () => {
    const { post, dispatcher, store } = setup()
    await dispatcher.dispatch({
      surfaceId: "srf_1",
      componentId: "row_btn",
      action: { event: { name: "open", context: { id: { "@path": "/id" } } } },
      binding: { dataModel: store.getState().surfaces.srf_1.dataModel, scope: "/rows/0" },
    })
    expect(post.mock.calls[0][1].a2ui.action.context).toEqual({ id: "r1" })
  })

  it("asks for confirmation on destructive actions and sends nothing if declined", async () => {
    const confirm = vi.fn().mockResolvedValue(false)
    const { post, dispatcher, binding } = setup({ confirm })
    const r = await dispatcher.dispatch({
      surfaceId: "srf_1",
      componentId: "del",
      action: { event: { name: "project.delete" } },
      binding,
      hint: { label: "Delete project" },
    })
    expect(r).toEqual({ status: "cancelled" })
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ actionName: "project.delete", label: "Delete project" }))
    expect(post).not.toHaveBeenCalled()
  })

  it("confirms danger buttons, high-risk approvals and injected destructive names; not ordinary ones", async () => {
    const isDestructive = (name: string) => name === "deploy_prod"
    const { confirm, dispatcher, binding, post } = setup({ isDestructive })
    const send = (name: string, hint?: object) =>
      dispatcher.dispatch({ surfaceId: "srf_1", componentId: "c", action: { event: { name } }, binding, hint })
    await send("refresh")
    await send("approve_gate", { riskLevel: "low" })
    expect(confirm).not.toHaveBeenCalled()
    await send("go", { destructive: true })
    await send("approve_gate", { riskLevel: "critical" })
    await send("deploy_prod")
    expect(confirm).toHaveBeenCalledTimes(3)
    expect(post).toHaveBeenCalledTimes(5)
    expect(DESTRUCTIVE_ACTION.test("remove_member")).toBe(true)
    expect(DESTRUCTIVE_ACTION.test("removed")).toBe(false)
  })

  it("marks the action failed when the POST fails and surfaces the server detail", async () => {
    const post = vi.fn().mockRejectedValue({ response: { status: 403, data: { detail: "Not permitted" } } })
    const { store, dispatcher, binding } = setup({ post })
    const r = await dispatcher.dispatch({ surfaceId: "srf_1", componentId: "b", action: { event: { name: "go" } }, binding })
    expect(r).toEqual({ status: "failed", actionId: "act_1", error: "Not permitted" })
    expect(store.getState().actions.act_1).toMatchObject({ status: "failed", message: "Not permitted" })
  })

  it("times out an action that never gets an action.result", async () => {
    const { store, dispatcher, binding } = setup({ pendingTimeoutMs: 1000 })
    await dispatcher.dispatch({ surfaceId: "srf_1", componentId: "b", action: { event: { name: "go" } }, binding })
    expect(store.getState().actions.act_1.status).toBe("accepted")
    await vi.advanceTimersByTimeAsync(1000)
    expect(store.getState().actions.act_1.status).toBe("failed")
  })

  it("rejects malformed actions, bad names and missing sessions without posting", async () => {
    const { post, dispatcher, binding } = setup()
    expect((await dispatcher.dispatch({ surfaceId: "srf_1", componentId: "b", action: { functionCall: {} }, binding })).status).toBe("invalid")
    expect((await dispatcher.dispatch({ surfaceId: "srf_1", componentId: "b", action: { event: { name: "bad name!" } }, binding })).status).toBe(
      "invalid"
    )
    const noSession = setup({ sessionId: null })
    expect((await noSession.dispatcher.dispatch({ surfaceId: "srf_1", componentId: "b", action: { event: { name: "go" } }, binding })).status).toBe(
      "no_session"
    )
    expect(post).not.toHaveBeenCalled()
    expect(noSession.post).not.toHaveBeenCalled()
  })

  it("passes a resolved userMessage to the shell", async () => {
    const onUserMessage = vi.fn()
    const { dispatcher, binding } = setup({ onUserMessage })
    await dispatcher.dispatch({
      surfaceId: "srf_1",
      componentId: "b",
      action: { event: { name: "go", userMessage: { "@path": "/form/name" } } },
      binding,
    })
    expect(onUserMessage).toHaveBeenCalledWith("Ada")
  })
})
