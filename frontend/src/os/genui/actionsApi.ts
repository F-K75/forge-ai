/** HTTP client for generated-surface user actions (`POST /v1/os/sessions/{id}/actions`). */
import { api } from "../../lib/api"
import type { OsId, UserActionRequest } from "../contracts"

export type PostUserAction = (sessionId: OsId, request: UserActionRequest) => Promise<unknown>

/** 202 Accepted; the outcome arrives on the session stream as `action.result`. Axios adds X-CSRF-Token. */
export const postUserAction: PostUserAction = (sessionId, request) =>
  api.post(`/v1/os/sessions/${encodeURIComponent(sessionId)}/actions`, request).then((r) => r.data)
