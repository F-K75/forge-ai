import { useId, useMemo, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, ArrowRight, GitBranch, MessagesSquare } from "lucide-react";
import { useBuildStore, AGENT_LABELS, AGENT_MESSAGE_REASONS, type PendingGate, type StepRecord } from "../../store/buildStore";
import { useCollaborationStore } from "../../store/collaborationStore";
import type { BlackboardEntry, CollabMessage, Escalation, MessageState } from "../../lib/collabContract";
import { asUtc, timeOf } from "../../lib/buildContract";
import { buildsApi } from "../../lib/api";
import { hydrateBuild } from "../../lib/buildSync";
import { resolveMockGate } from "../../lib/mockEmitter";
import { LIVE_MODE } from "../../lib/env";

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

const agentLabel = (id: string | null | undefined) => (id ? AGENT_LABELS[id] ?? id.replace(/_/g, " ") : "Orchestrator");

const MESSAGE_STATE_LABELS: Record<MessageState, string> = {
  queued: "Queued",
  dispatched: "Awaiting reply",
  completed: "Answered",
  rejected: "Rejected",
  timed_out: "Timed out",
  interrupted: "Interrupted",
  failed: "Failed",
};

// Colour is only ever a secondary cue (a dot next to a text label), so the
// lanes stay readable in both themes and for colour-blind users.
const MESSAGE_STATE_DOT: Record<MessageState, string> = {
  queued: "bg-faint",
  dispatched: "bg-info",
  completed: "bg-ok",
  rejected: "bg-warn",
  timed_out: "bg-warn",
  interrupted: "bg-warn",
  failed: "bg-error",
};

const KIND_LABELS: Record<BlackboardEntry["kind"], string> = {
  decision: "Decision",
  assumption: "Assumption",
  open_question: "Open question",
  risk: "Risk",
  constraint: "Constraint",
};

const typeLabel = (t: string) => t.replace(/_/g, " ");

function resolvedByLabel(by: string | null): string | null {
  if (!by) return null;
  if (by === "user") return "you";
  if (by === "default") return "the decision owner, after the time limit";
  if (by.startsWith("agent:")) return agentLabel(by.slice(6));
  return by;
}

function Time({ at }: { at: string | null | undefined }) {
  const iso = asUtc(at);
  const t = timeOf(at);
  if (!iso || t === null) return null;
  return (
    <time dateTime={iso} className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
      {new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </time>
  );
}

function StateLabel({ dot, children }: { dot: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Lane shell                                                          */
/* ------------------------------------------------------------------ */

function Lane({
  title,
  icon,
  count,
  empty,
  live,
  children,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  empty: string;
  live?: boolean;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex min-h-0 flex-col rounded-xl border border-border bg-panel shadow-apple">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-ink">
          {icon}
          {title}
        </h3>
        <span className="font-mono text-xs tabular-nums text-muted" aria-label={`${count} item${count === 1 ? "" : "s"}`}>
          {count}
        </span>
      </header>
      {count === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted">{empty}</p>
      ) : (
        <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live={live ? "polite" : undefined}>
          {children}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

function MessageItem({ m }: { m: CollabMessage }) {
  const unanswered = m.state !== "completed" && m.state !== "queued" && m.state !== "dispatched";
  return (
    <li className="rounded-lg border border-border bg-panel-alt/60 p-3 text-xs" data-testid="collab-message">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1 font-medium text-ink">
            <span>{agentLabel(m.sender)}</span>
            <ArrowRight size={11} className="text-muted" aria-hidden="true" />
            <span className="sr-only">to</span>
            <span>{agentLabel(m.recipient)}</span>
            <span className="ml-1 rounded border border-border px-1.5 py-px text-[10px] font-normal capitalize text-muted">
              {typeLabel(m.message_type)}
            </span>
          </p>
          <StateLabel dot={MESSAGE_STATE_DOT[m.state]}>{MESSAGE_STATE_LABELS[m.state]}</StateLabel>
        </div>
        <Time at={m.created_at} />
      </div>
      {m.subject && <p className="mt-2 font-semibold text-ink">{m.subject}</p>}
      <p className="mt-1 whitespace-pre-wrap text-ink">{m.content}</p>
      {m.answer && (
        <p className="mt-2 whitespace-pre-wrap border-l-2 border-accent/50 pl-2 text-ink">
          <span className="font-medium">{agentLabel(m.recipient)}:</span> {m.answer}
        </p>
      )}
      {unanswered && (
        <p className="mt-2 text-muted">
          No answer{m.reason ? ` — ${AGENT_MESSAGE_REASONS[m.reason] ?? m.reason.replace(/_/g, " ")}` : ""}.
        </p>
      )}
    </li>
  );
}

function StepItem({ step, buildEnded }: { step: StepRecord; buildEnded: boolean }) {
  const label = step.agent === "debugger" ? `Debug iteration${step.iteration ? ` ${step.iteration}` : ""}` : agentLabel(step.agent);
  const text =
    step.status === "success" ? `${label} completed` : step.status === "failed" ? `${label} failed` : buildEnded ? `${label} stopped` : `${label} working…`;
  const dot = step.status === "success" ? "bg-ok" : step.status === "failed" || buildEnded ? "bg-error" : "bg-info";
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs" data-testid="collab-step">
      <StateLabel dot={dot}>{text}</StateLabel>
      <Time at={step.completedAt ?? step.startedAt} />
    </li>
  );
}

/** A current entry and the earlier versions it replaced (newest first). */
interface DecisionChain {
  entry: BlackboardEntry;
  replaced: BlackboardEntry[];
}

/**
 * The backend re-sends a superseded entry with `superseded_by` set, then the
 * new version. Group each chain under its newest entry so a replacement
 * reads as one decision that changed, not as two decisions.
 */
function decisionChains(entries: BlackboardEntry[]): DecisionChain[] {
  const byId = new Map(entries.map((e) => [e.entry_id, e]));
  const predecessors = new Map<string, BlackboardEntry[]>();
  for (const e of entries) {
    if (e.superseded_by && byId.has(e.superseded_by)) {
      predecessors.set(e.superseded_by, [...(predecessors.get(e.superseded_by) ?? []), e]);
    }
  }
  // Heads: not superseded, or superseded by an entry that hasn't arrived yet.
  const heads = entries.filter((e) => !e.superseded_by || !byId.has(e.superseded_by));
  return heads.map((entry) => {
    const replaced: BlackboardEntry[] = [];
    const seen = new Set([entry.entry_id]);
    let frontier = predecessors.get(entry.entry_id) ?? [];
    while (frontier.length > 0) {
      const next: BlackboardEntry[] = [];
      for (const p of [...frontier].sort((a, b) => b.version - a.version)) {
        if (seen.has(p.entry_id)) continue;
        seen.add(p.entry_id);
        replaced.push(p);
        next.push(...(predecessors.get(p.entry_id) ?? []));
      }
      frontier = next;
    }
    return { entry, replaced };
  });
}

function DecisionItem({ e, replaced = [] }: { e: BlackboardEntry; replaced?: BlackboardEntry[] }) {
  // Only an entry whose replacement hasn't arrived yet is shown as superseded on its own.
  const superseded = Boolean(e.superseded_by);
  return (
    <li className={`rounded-lg border border-border p-3 text-xs ${superseded ? "bg-base/50" : "bg-panel-alt/60"}`} data-testid="collab-decision">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded border border-border px-1.5 py-px text-[10px] font-medium text-ink">{KIND_LABELS[e.kind]}</span>
        <Time at={e.created_at} />
      </div>
      <p className="mt-2 break-all font-mono text-[11px] text-muted">
        {e.key}
        {e.version > 1 && <span> · v{e.version}</span>}
      </p>
      <p className={`mt-1 whitespace-pre-wrap font-medium text-ink ${superseded ? "line-through decoration-muted" : ""}`}>{e.value}</p>
      {e.rationale && <p className="mt-1 whitespace-pre-wrap text-muted">{e.rationale}</p>}
      <p className="mt-2 text-[11px] text-muted">
        {e.owner_agent ? `Owner: ${agentLabel(e.owner_agent)}` : null}
        {superseded && <span className="font-medium text-ink">{e.owner_agent ? " · " : ""}Replaced</span>}
      </p>
      {replaced.length > 0 && (
        <div className="mt-2 border-t border-border pt-2">
          <p className="text-[11px] font-medium text-ink">Replaces</p>
          <ul className="mt-1 space-y-1" aria-label="Replaced versions">
            {replaced.map((r) => (
              <li key={r.entry_id} className="text-[11px] text-muted">
                <span className="line-through decoration-muted">{r.value}</span>
                <span>
                  {" "}
                  (v{r.version}
                  {r.owner_agent ? `, ${agentLabel(r.owner_agent)}` : ""})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

interface EscalationItemProps {
  e: Escalation;
  gate: PendingGate | null;
  /** `option` null = accept the decision owner's recommendation (action "approve"). */
  onAnswer: (gate: PendingGate, option: string | null) => void;
  sending: string | null;
  sent: string | null;
}

function EscalationItem({ e, gate, onAnswer, sending, sent }: EscalationItemProps) {
  const awaitingUser = e.state === "open" && gate !== null;
  const optionsLabelId = useId();
  const stateLabel = e.state === "open" ? (awaitingUser ? "Needs your decision" : "Open") : e.state === "resolved" ? "Resolved" : "Expired";
  const dot = e.state === "open" ? (awaitingUser ? "bg-warn" : "bg-info") : e.state === "resolved" ? "bg-ok" : "bg-faint";
  const by = resolvedByLabel(e.resolved_by);

  return (
    <li
      className={`rounded-lg border p-3 text-xs ${awaitingUser ? "border-warn/60 bg-panel" : "border-border bg-panel-alt/60"}`}
      data-testid="collab-escalation"
    >
      <div className="flex items-start justify-between gap-2">
        <StateLabel dot={dot}>{stateLabel}</StateLabel>
        <Time at={e.resolved_at ?? e.created_at} />
      </div>
      <h4 className="mt-2 text-sm font-semibold text-ink">{e.subject || "Escalation"}</h4>
      {(e.raised_by || e.decision_owner) && (
        <p className="mt-0.5 text-[11px] text-muted">
          {e.raised_by ? `Raised by ${agentLabel(e.raised_by)}` : ""}
          {e.raised_by && e.decision_owner ? " · " : ""}
          {e.decision_owner ? `Decision owner: ${agentLabel(e.decision_owner)}` : ""}
        </p>
      )}
      {e.detail && <p className="mt-2 whitespace-pre-wrap text-ink">{e.detail}</p>}
      {e.conflict && (
        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 rounded-md border border-border bg-base/50 p-2 text-[11px]">
          <dt className="text-muted">Key</dt>
          <dd className="break-all font-mono text-ink">{e.conflict.key}</dd>
          <dt className="text-muted">Recorded</dt>
          <dd className="text-ink">{e.conflict.existing_value}</dd>
          <dt className="text-muted">Proposed</dt>
          <dd className="text-ink">{e.conflict.proposed_value}</dd>
        </dl>
      )}

      {awaitingUser && gate && (
        <div className="mt-3">
          {sent ? (
            <p className="text-ink" role="status">
              {sent === OWNER_CHOICE
                ? `Left it to ${agentLabel(e.decision_owner)}. Waiting for the build to continue…`
                : `Sent “${sent}”. Waiting for the build to continue…`}
            </p>
          ) : (
            <>
              <p id={optionsLabelId} className="mb-1.5 font-medium text-ink">
                Choose an option:
              </p>
              <div role="group" aria-labelledby={optionsLabelId} className="flex flex-wrap gap-1.5">
                {(e.options.length > 0 ? e.options : gate.options ?? []).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={sending !== null}
                    onClick={() => onAnswer(gate, option)}
                    className="inline-flex min-h-[34px] items-center rounded-md border border-border bg-panel px-3 text-xs font-medium text-ink hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending === option ? "Sending…" : option}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={sending !== null}
                onClick={() => onAnswer(gate, null)}
                className="mt-2 text-xs font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending === OWNER_CHOICE ? "Sending…" : `Let ${agentLabel(e.decision_owner ?? gate.agent)} decide`}
              </button>
            </>
          )}
        </div>
      )}

      {e.state === "open" && !awaitingUser && e.options.length > 0 && (
        <p className="mt-2 text-muted">
          Options: {e.options.join(" · ")}. Waiting for {agentLabel(e.decision_owner)} to decide.
        </p>
      )}
      {e.state === "resolved" && (
        <p className="mt-2 text-ink">
          <span className="font-medium">Resolution:</span> {e.resolution ?? "—"}
          {by && <span className="text-muted"> (by {by})</span>}
        </p>
      )}
      {e.rationale && e.state !== "open" && <p className="mt-1 whitespace-pre-wrap text-muted">{e.rationale}</p>}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

type ActivityItem = { kind: "step"; key: string; at: number | null; step: StepRecord } | { kind: "message"; key: string; at: number | null; message: CollabMessage };

// Stable chronological order; an item without a timestamp keeps its place
// after the item before it in its own sequence.
function chronological<T extends { at: number | null }>(...sequences: T[][]): T[] {
  const tagged: Array<{ item: T; t: number; seq: number; idx: number }> = [];
  sequences.forEach((list, seq) => {
    let last = -Infinity;
    list.forEach((item, idx) => {
      if (item.at !== null) last = item.at;
      tagged.push({ item, t: last, seq, idx });
    });
  });
  tagged.sort((a, b) => a.t - b.t || a.seq - b.seq || a.idx - b.idx);
  return tagged.map((x) => x.item);
}

/** A pending escalation gate whose escalation record never arrived. */
function escalationFromGate(gate: PendingGate): Escalation {
  return {
    escalation_id: gate.escalationId ?? gate.gateId,
    raised_by: null,
    decision_owner: gate.agent || null,
    subject: gate.subject ?? "Decision needed",
    detail: gate.detail ?? "",
    options: gate.options ?? [],
    conflict: null,
    state: "open",
    resolution: null,
    resolved_by: null,
    rationale: null,
    created_at: gate.requestedAt || null,
    resolved_at: null,
  };
}

function byTime<T>(list: T[], at: (t: T) => string | null): T[] {
  return chronological(list.map((item) => ({ item, at: timeOf(at(item)) }))).map((x) => x.item);
}

/** Marks the "let the decision owner decide" answer in local UI state. */
const OWNER_CHOICE = "\u0000owner";

const errorStatus = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;

export function CollaborationPanel() {
  const buildId = useBuildStore((s) => s.buildId);
  const steps = useBuildStore((s) => s.steps);
  const pendingGate = useBuildStore((s) => s.pendingGate);
  const status = useBuildStore((s) => s.status);
  const protocolVersion = useCollaborationStore((s) => s.protocolVersion);
  const messages = useCollaborationStore((s) => s.messages);
  const decisions = useCollaborationStore((s) => s.decisions);
  const escalations = useCollaborationStore((s) => s.escalations);
  const budget = useCollaborationStore((s) => s.budget);

  const [sending, setSending] = useState<{ gateId: string; option: string } | null>(null);
  const [sent, setSent] = useState<{ gateId: string; option: string } | null>(null);

  const escalationGate = pendingGate?.kind === "escalation" ? pendingGate : null;
  const buildEnded = status === "complete" || status === "failed";
  const legacy = protocolVersion < 2;

  const activityItems = useMemo(() => {
    const stepItems: ActivityItem[] = steps.map((step, i) => ({ kind: "step", key: `s${i}`, at: timeOf(step.completedAt ?? step.startedAt), step }));
    const msgItems: ActivityItem[] = messages
      .filter((m) => legacy || m.lane === "activity")
      .map((message) => ({ kind: "message", key: message.message_id, at: timeOf(message.created_at), message }));
    return chronological(stepItems, msgItems);
  }, [steps, messages, legacy]);

  const laneMessages = (lane: CollabMessage["lane"]) => (legacy ? [] : messages.filter((m) => m.lane === lane));

  const escalationList = useMemo(() => {
    let list = escalations;
    if (escalationGate && !list.some((e) => e.escalation_id === escalationGate.escalationId)) {
      list = [...list, escalationFromGate(escalationGate)];
    }
    // Open ones first: they are the ones that may need an answer.
    return [...byTime(list.filter((e) => e.state === "open"), (e) => e.created_at), ...byTime(list.filter((e) => e.state !== "open"), (e) => e.created_at)];
  }, [escalations, escalationGate]);

  // answers[0] = the chosen option resolves it as the user's decision; a
  // plain approve accepts the decision owner's recommendation.
  const answer = async (gate: PendingGate, option: string | null) => {
    if (!buildId) return;
    const marker = option ?? OWNER_CHOICE;
    setSending({ gateId: gate.gateId, option: marker });
    try {
      if (LIVE_MODE) {
        await buildsApi.respondToGate(
          buildId,
          option === null
            ? { gate_id: gate.gateId, action: "approve" }
            : { gate_id: gate.gateId, action: "answers", answers: [option] },
        );
      } else {
        resolveMockGate(gate.gateId, option === null ? { action: "approve" } : { action: "answers", answers: [option] });
      }
      setSent({ gateId: gate.gateId, option: marker });
    } catch (err) {
      const code = errorStatus(err);
      toast.error(code === 409 ? "This decision has already been made." : "Couldn’t send your answer. Please try again.");
      if (code === 409) void hydrateBuild(buildId);
    } finally {
      setSending(null);
    }
  };

  const gateFor = (e: Escalation) =>
    escalationGate && e.state === "open" && (escalationGate.escalationId ?? escalationGate.gateId) === e.escalation_id ? escalationGate : null;

  if (!buildId) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-muted">Run a build to see how the agents work together: their messages, the decisions they record and anything they escalate.</p>
      </div>
    );
  }

  const decisionsLaneItems = chronological(
    decisionChains(decisions).map(({ entry, replaced }) => ({
      at: timeOf(entry.created_at),
      node: <DecisionItem key={entry.entry_id} e={entry} replaced={replaced} />,
    })),
    laneMessages("decisions").map((m) => ({ at: timeOf(m.created_at), node: <MessageItem key={m.message_id} m={m} /> })),
  );
  const escalationMessages = laneMessages("escalations");

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-5" data-testid="collaboration-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Agent collaboration</h2>
          <p className="text-xs text-muted">
            {legacy
              ? "This build uses the original protocol: agent messages only."
              : "Messages between agents, the decisions they record, and conflicts that need a decision."}
          </p>
        </div>
        {budget && budget.max_messages > 0 && (
          <p className="font-mono text-xs tabular-nums text-muted" data-testid="collab-budget">
            {budget.messages_used}/{budget.max_messages} messages · {budget.credits_used} credit{budget.credits_used === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {legacy ? (
        <Lane
          title="Messages"
          icon={<MessagesSquare size={14} className="text-accent" aria-hidden="true" />}
          count={messages.length}
          empty="No agent-to-agent messages in this build."
        >
          {byTime(messages, (m) => m.created_at).map((m) => (
            <MessageItem key={m.message_id} m={m} />
          ))}
        </Lane>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Lane
            title="Activity"
            icon={<MessagesSquare size={14} className="text-accent" aria-hidden="true" />}
            count={activityItems.length}
            empty="No agent activity yet."
          >
            {activityItems.map((item) =>
              item.kind === "step" ? (
                <StepItem key={item.key} step={item.step} buildEnded={buildEnded} />
              ) : (
                <MessageItem key={item.key} m={item.message} />
              ),
            )}
          </Lane>
          <Lane
            title="Decisions"
            icon={<GitBranch size={14} className="text-accent" aria-hidden="true" />}
            count={decisionsLaneItems.length}
            empty="No decisions recorded yet."
          >
            {decisionsLaneItems.map((x) => x.node)}
          </Lane>
          <Lane
            title="Escalations"
            icon={<AlertTriangle size={14} className="text-warn" aria-hidden="true" />}
            count={escalationList.length + escalationMessages.length}
            empty="No escalations. Conflicting decisions would appear here."
            live
          >
            {escalationList.map((e) => {
              const gate = gateFor(e);
              return (
                <EscalationItem
                  key={e.escalation_id}
                  e={e}
                  gate={gate}
                  onAnswer={answer}
                  sending={gate && sending?.gateId === gate.gateId ? sending.option : null}
                  sent={gate && sent?.gateId === gate.gateId ? sent.option : null}
                />
              );
            })}
            {escalationMessages.map((m) => (
              <MessageItem key={m.message_id} m={m} />
            ))}
          </Lane>
        </div>
      )}
    </div>
  );
}
