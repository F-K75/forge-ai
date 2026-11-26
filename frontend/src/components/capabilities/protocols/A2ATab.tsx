import { useEffect, useRef, useState, type FormEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import { Globe, Inbox, Search, Send, X } from "lucide-react"
import { Badge, Button, ClipboardCopyButton, EmptyState, Input, InlineNotice, Skeleton } from "../../ui"
import { A2AStatePill } from "../StatusPills"
import type { A2AAgentCard, A2ATask } from "../../../lib/kernelApi"
import { formatRelativeTime } from "../../../lib/format"
import {
  A2A_TERMINAL,
  apiBaseUrl,
  cancelInboundTask,
  cancelRemoteTask,
  discoverRemoteAgent,
  getRemoteTask,
  listInboundTasks,
  sendRemoteTask,
  validatePublicHttpsUrl,
  type A2AAuditRecord,
} from "../../../lib/protocolsData"

const COPY_BTN =
  "inline-flex h-7 items-center gap-1.5 rounded-pill border border-glass-border bg-glass px-2.5 text-xs text-ink hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"

function describeError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === "string" && detail.trim()) return detail.slice(0, 300)
  if (err instanceof Error && err.message && !/status code/i.test(err.message)) return err.message
  return fallback
}

function taskText(task: A2ATask): string {
  const m = task.status.message
  if (!m) return ""
  if (typeof m === "string") return m
  return m.parts.map((p) => p.text ?? "").join(" ").trim()
}

interface Props {
  projectId: string
  card: (A2AAgentCard & Record<string, unknown>) | null
  audit: A2AAuditRecord[]
}

export function A2ATab({ projectId, card, audit }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <AgentCardPanel projectId={projectId} card={card} />
        <RemoteAgentPanel projectId={projectId} />
      </div>
      <InboundTasks projectId={projectId} audit={audit} />
    </div>
  )
}

// ---------------------------------------------------------------------------

function AgentCardPanel({ projectId, card }: { projectId: string; card: Props["card"] }) {
  const base = apiBaseUrl()
  const publicUrl = `${base}/.well-known/agent.json`
  const projectUrl = `${base}/v1/projects/${projectId}/protocols/a2a/.well-known/agent.json`
  const json = card ? JSON.stringify(card, null, 2) : ""

  return (
    <section aria-labelledby="card-heading" className="min-w-0 rounded-xl border border-border bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="card-heading" className="text-body font-medium text-ink">
            Forge's agent card
          </h2>
          <p className="mt-1 text-caption text-muted">What other agents see when they discover Forge.</p>
        </div>
        {card && <Badge variant="accent">v{card.version}</Badge>}
      </div>

      <dl className="mt-4 space-y-2">
        {[
          ["Public card", publicUrl],
          ["Project card", projectUrl],
        ].map(([label, url]) => (
          <div key={label} className="flex items-center gap-3 rounded-lg border border-border-soft px-3 py-2">
            <dt className="w-24 shrink-0 text-xs text-faint">{label}</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={url}>
              {url}
            </dd>
            <ClipboardCopyButton text={url} successMessage={`${label} URL copied`} className={COPY_BTN} />
          </div>
        ))}
      </dl>

      {card ? (
        <>
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Capabilities">
            {Object.entries(card.capabilities).map(([k, v]) => (
              <li key={k} className={`rounded-pill border px-2.5 py-0.5 text-2xs ${v ? "border-border text-muted" : "border-border-soft text-faint line-through"}`}>
                {k}
              </li>
            ))}
          </ul>
          <div className="mt-4 overflow-hidden rounded-lg border border-border-soft bg-base">
            <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
              <span className="font-mono text-2xs text-faint">agent.json · {card.skills.length} skills</span>
              <ClipboardCopyButton text={json} successMessage="Agent card JSON copied" className={COPY_BTN} />
            </div>
            <pre className="max-h-72 overflow-auto p-3 font-mono text-2xs leading-relaxed text-muted" tabIndex={0} aria-label="Agent card JSON">
              {json}
            </pre>
          </div>
        </>
      ) : (
        <InlineNotice className="mt-4" tone="warn" title="The project agent card isn't available.">
          The A2A endpoint didn't answer for this project.
        </InlineNotice>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

interface TimelineEntry {
  state: string
  at: string
  text: string
}

function RemoteAgentPanel({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState("")
  const [urlTouched, setUrlTouched] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [remote, setRemote] = useState<Record<string, unknown> | null>(null)

  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [task, setTask] = useState<A2ATask | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const pollRef = useRef<number | null>(null)

  const urlError = validatePublicHttpsUrl(url, { label: "Agent URL" })
  const endpoint = typeof remote?.url === "string" ? (remote.url as string) : url.trim()

  const stopPolling = () => {
    if (pollRef.current !== null) window.clearTimeout(pollRef.current)
    pollRef.current = null
  }
  useEffect(() => stopPolling, [])

  const record = (t: A2ATask) => {
    setTask(t)
    setTimeline((prev) =>
      prev.length && prev[prev.length - 1].state === t.status.state
        ? prev
        : [...prev, { state: t.status.state, at: t.status.timestamp || new Date().toISOString(), text: taskText(t) }]
    )
  }

  const poll = (id: string, attempt = 0) => {
    stopPolling()
    if (attempt > 40) return
    pollRef.current = window.setTimeout(async () => {
      try {
        const t = await getRemoteTask(projectId, endpoint, id)
        record(t)
        if (!A2A_TERMINAL.has(t.status.state)) poll(id, attempt + 1)
      } catch (err) {
        setSendError(describeError(err, "Lost track of the remote task."))
      }
    }, 1200)
  }

  const discover = async (e: FormEvent) => {
    e.preventDefault()
    setUrlTouched(true)
    if (urlError || discovering) return
    setDiscovering(true)
    setDiscoverError(null)
    setRemote(null)
    setTask(null)
    setTimeline([])
    stopPolling()
    try {
      setRemote(await discoverRemoteAgent(projectId, url.trim()))
    } catch (err) {
      setDiscoverError(describeError(err, "Couldn't fetch an agent card from that URL."))
    } finally {
      setDiscovering(false)
    }
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (text.trim().length < 3 || sending) return
    setSending(true)
    setSendError(null)
    setTimeline([])
    try {
      const t = await sendRemoteTask(projectId, endpoint, text.trim())
      record(t)
      if (!A2A_TERMINAL.has(t.status.state)) poll(t.id)
    } catch (err) {
      setSendError(describeError(err, "The remote agent rejected the task."))
    } finally {
      setSending(false)
    }
  }

  const cancel = async () => {
    if (!task) return
    stopPolling()
    try {
      record(await cancelRemoteTask(projectId, endpoint, task.id))
    } catch (err) {
      setSendError(describeError(err, "Couldn't cancel the remote task."))
    }
  }

  const skills = Array.isArray(remote?.skills) ? (remote?.skills as Array<{ id?: string; name?: string }>) : []

  return (
    <section aria-labelledby="remote-heading" className="min-w-0 rounded-xl border border-border bg-panel p-5">
      <h2 id="remote-heading" className="text-body font-medium text-ink">
        Remote agents
      </h2>
      <p className="mt-1 text-caption text-muted">Discover an agent by URL, then hand it a task. Every call is audited.</p>

      <form className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start" onSubmit={discover} noValidate>
        <Input
          id="a2a-agent-url"
          label="Agent URL"
          className="flex-1 [&_label]:sr-only"
          placeholder="https://agents.example.com"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url && setUrlTouched(true)}
          error={urlTouched ? urlError ?? undefined : undefined}
          leftIcon={<Globe className="h-4 w-4" />}
        />
        <Button type="submit" variant="secondary" loading={discovering}>
          <Search className="h-4 w-4" aria-hidden="true" />
          Discover
        </Button>
      </form>
      {discoverError && (
        <p role="alert" className="mt-2 text-caption text-error">
          {discoverError}
        </p>
      )}

      {remote && (
        <div className="mt-4 rounded-lg border border-border-soft bg-base/40 p-4" aria-label="Discovered agent">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-caption font-medium text-ink">{String(remote.name ?? "Unnamed agent")}</p>
              <p className="mt-0.5 text-xs text-muted">{String(remote.description ?? "")}</p>
            </div>
            {remote.version !== undefined && <span className="shrink-0 font-mono text-2xs text-faint">v{String(remote.version)}</span>}
          </div>
          <p className="mt-2 truncate font-mono text-2xs text-faint">{endpoint}</p>
          {skills.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Remote skills">
              {skills.slice(0, 8).map((s, i) => (
                <li key={s.id ?? i} className="rounded-pill border border-border-soft px-2 py-0.5 text-2xs text-muted">
                  {s.name ?? s.id}
                </li>
              ))}
            </ul>
          )}

          <form className="mt-4 space-y-2" onSubmit={send}>
            <label htmlFor="a2a-task-text" className="text-xs font-medium text-ink">
              Task
            </label>
            <textarea
              id="a2a-task-text"
              rows={2}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Check the dependency changes in the release branch for licence risk."
              className="w-full resize-none rounded-lg border border-border bg-panel px-3.5 py-2.5 text-caption text-ink outline-none placeholder:text-faint focus:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30"
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" variant="tonal" disabled={text.trim().length < 3} loading={sending}>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                Send task
              </Button>
              {task && !A2A_TERMINAL.has(task.status.state) && (
                <Button size="sm" variant="ghost" onClick={cancel}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Cancel
                </Button>
              )}
            </div>
          </form>
          {sendError && (
            <p role="alert" className="mt-2 text-caption text-error">
              {sendError}
            </p>
          )}

          {timeline.length > 0 && task && (
            <div className="mt-4 border-t border-border-soft pt-4">
              <p className="mb-3 font-mono text-2xs text-faint">{task.id}</p>
              <ol aria-label="Task status timeline" className="relative space-y-3 pl-5">
                <span aria-hidden="true" className="absolute bottom-1 left-[5px] top-1 w-px bg-border" />
                {timeline.map((t, i) => (
                  <li key={`${t.state}-${i}`} className="relative">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-5 top-1 h-[11px] w-[11px] rounded-full border-2 border-panel ${i === timeline.length - 1 ? (A2A_TERMINAL.has(t.state) ? "bg-ink" : "bg-accent") : "bg-faint"}`}
                    />
                    <div className="flex items-center gap-2">
                      <A2AStatePill state={t.state} />
                      <span className="font-mono text-2xs tabular-nums text-faint">{new Date(t.at).toLocaleTimeString([], { hour12: false })}</span>
                    </div>
                    {t.text && <p className="mt-1 text-xs text-muted">{t.text}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------

function InboundTasks({ projectId, audit }: { projectId: string; audit: A2AAuditRecord[] }) {
  const q = useQuery({
    queryKey: ["capabilities", "a2a-inbound", projectId, audit.length],
    queryFn: () => listInboundTasks(projectId, audit),
  })
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cancel = async (id: string) => {
    setCancelling(id)
    setError(null)
    try {
      await cancelInboundTask(projectId, id)
      await q.refetch()
    } catch (err) {
      setError(describeError(err, "Couldn't cancel that task."))
    } finally {
      setCancelling(null)
    }
  }

  return (
    <section aria-labelledby="inbound-heading">
      <h2 id="inbound-heading" className="mb-3 text-body font-medium text-ink">
        Inbound tasks {q.data && <span className="font-mono text-caption text-faint">{q.data.length}</span>}
      </h2>
      {error && (
        <p role="alert" className="mb-2 text-caption text-error">
          {error}
        </p>
      )}
      {q.isError ? (
        <InlineNotice title="Couldn't load inbound tasks." action={<Button size="sm" variant="secondary" onClick={() => q.refetch()}>Retry</Button>} />
      ) : !q.data ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading inbound tasks">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : q.data.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel">
          <EmptyState icon={Inbox} title="No inbound tasks" description="When another agent sends Forge a task, it shows up here." />
        </div>
      ) : (
        <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-panel" aria-label="Inbound A2A tasks">
          {q.data.map((t) => {
            const meta = (t.metadata ?? {}) as Record<string, unknown>
            const live = !A2A_TERMINAL.has(t.status.state)
            return (
              <li key={t.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-ink">{t.id}</span>
                    {typeof meta.callerAgent === "string" && <span className="text-xs text-faint">from {meta.callerAgent}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-caption text-muted">{taskText(t)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {typeof meta.taskCount === "number" && (
                    <span className="font-mono text-2xs tabular-nums text-faint">
                      {String(meta.waveCount ?? "–")}w · {meta.taskCount}t
                    </span>
                  )}
                  <span className="w-16 text-right font-mono text-2xs tabular-nums text-faint">{formatRelativeTime(t.status.timestamp)}</span>
                  <A2AStatePill state={t.status.state} />
                  {live ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancel(t.id)}
                      loading={cancelling === t.id}
                      aria-label={`Cancel task ${t.id}`}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <span className="hidden w-[72px] sm:block" aria-hidden="true" />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
