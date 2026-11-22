// Hydration of a live build from the backend's persisted state. The REST
// state is the single source of truth (plan decision C); WS events are
// applied on top of it. useBuildSocket calls hydrateBuild on every
// (re)connect and confirmTerminalStatus after a terminal event (B1-7).
import { buildsApi } from './api'
import { isTerminalPersisted, type BuildDetail } from './buildContract'
import { normalizeSnapshot, snapshotFromBuildDoc } from './collabContract'
import { useBuildStore } from '../store/buildStore'
import { useCollaborationStore } from '../store/collaborationStore'

let requestSeq = 0
let appliedSeq = 0

/**
 * Fetches the build document, its files and its collaboration state, and
 * applies them. Responses that arrive after a newer hydration has already
 * been applied are discarded, so an out-of-order reply can't roll the UI
 * back. Resolves to whether this snapshot was applied; never rejects.
 */
export async function hydrateBuild(buildId: string): Promise<boolean> {
  const seq = ++requestSeq
  try {
    const [detail, files, collaboration] = await Promise.allSettled([
      buildsApi.get(buildId),
      buildsApi.getFiles(buildId),
      buildsApi.getCollaboration(buildId),
    ])
    if (detail.status !== 'fulfilled' || !detail.value || typeof detail.value !== 'object') return false
    if (seq < appliedSeq) return false
    appliedSeq = seq

    const doc: BuildDetail = detail.value
    const fileMap =
      files.status === 'fulfilled' && files.value && typeof files.value === 'object' && !Array.isArray(files.value)
        ? files.value
        : null
    useBuildStore.getState().hydrate({ buildId, detail: doc, files: fileMap })

    // Backends without the hydration endpoint (404) — or a failed request —
    // fall back to the same records on the build document itself.
    const snapshot =
      (collaboration.status === 'fulfilled' ? normalizeSnapshot(collaboration.value) : null) ??
      snapshotFromBuildDoc(doc as unknown as Record<string, unknown>)
    useCollaborationStore.getState().hydrate(buildId, snapshot)
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * After a build_complete / build_failed event: re-read the persisted state
 * until it is terminal too (or the attempts run out), since only the
 * persisted state may end the build in the UI.
 */
export async function confirmTerminalStatus(buildId: string, delaysMs: number[] = [0, 500, 1500, 3500]): Promise<boolean> {
  for (const delay of delaysMs) {
    if (delay) await sleep(delay)
    if (useBuildStore.getState().buildId !== buildId) return false
    await hydrateBuild(buildId)
    if (isTerminalPersisted(useBuildStore.getState().persistedStatus)) return true
  }
  return false
}
