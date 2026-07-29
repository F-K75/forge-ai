import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Download, FastForward, FileCode2, FileText, Loader2, WifiOff, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useBuildStore, AGENT_ORDER, AGENT_LABELS, type PipelineNodeState } from "../../store/buildStore";
import { AGENTS, agentById, type Agent } from "../../lib/agents";
import { motionVariants } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";
import { buildsApi } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { resolveMockGate } from "../../lib/mockEmitter";
import { Toggle } from "../Toggle";
import { AgentDocumentView } from "./AgentDocument";
import { agentDocumentToMarkdown } from "./AgentDocument.utils";

// Triggers a browser download built client-side from content already in the
// store — there's no server endpoint for single-file/document export.
function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Resolves an interactive build's pending gate — a real POST in live mode,
// or the demo timeline's own gate wait (see lib/mockEmitter's
// resolveMockGate) when there's no backend to call.
async function sendGateResponse(
  buildId: string,
  data: { gate_id: string; action: "approve" | "answers"; answers?: string[] }
) {
  if (LIVE_MODE) {
    await buildsApi.respondToGate(buildId, data);
  } else {
    resolveMockGate(data.gate_id, data);
  }
}

// When autoApprove is on, respond to any new gate the instant it arrives
// instead of waiting for the user — runs regardless of whether
// GateApprovalCard is even mounted, so toggling it on mid-gate resolves
// the gate immediately.
function useAutoApproveGate() {
  const buildId = useBuildStore((s) => s.buildId);
  const pendingGate = useBuildStore((s) => s.pendingGate);
  const autoApprove = useBuildStore((s) => s.autoApprove);
  const respondedGateId = useRef<string | null>(null);

  useEffect(() => {
    if (!autoApprove || !pendingGate || !buildId) return;
    if (respondedGateId.current === pendingGate.gateId) return;
    respondedGateId.current = pendingGate.gateId;
    sendGateResponse(buildId, { gate_id: pendingGate.gateId, action: "approve" }).catch(() => {
      respondedGateId.current = null;
    });
  }, [autoApprove, pendingGate, buildId]);
}

function GateApprovalCard() {
  const buildId = useBuildStore((s) => s.buildId);
  const pendingGate = useBuildStore((s) => s.pendingGate);
  const autoApprove = useBuildStore((s) => s.autoApprove);
  const setAutoApprove = useBuildStore((s) => s.setAutoApprove);
  const [answers, setAnswers] = useState<string[]>([]);
  const [busy, setBusy] = useState<"approve" | "auto" | "answers" | null>(null);

  useEffect(() => {
    setAnswers(pendingGate ? pendingGate.questions.map(() => "") : []);
    // Reset only when a *different* gate arrives, not on every pendingGate
    // field change (e.g. re-renders while typing an answer shouldn't wipe it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGate?.gateId]);

  // Auto-approve mode resolves gates itself (see useAutoApproveGate) — no
  // card to show, just let the pipeline keep moving.
  if (!pendingGate || !buildId || autoApprove) return null;

  const label = AGENT_LABELS[pendingGate.agent] ?? pendingGate.agent;
  const nextIndex = AGENT_ORDER.indexOf(pendingGate.agent as Agent["id"]) + 1;
  const nextLabel = nextIndex > 0 && nextIndex < AGENT_ORDER.length ? AGENT_LABELS[AGENT_ORDER[nextIndex]] : "the next step";

  const respond = async (action: "approve" | "answers", extra?: { answers?: string[] }) => {
    setBusy(action === "approve" ? "approve" : "answers");
    try {
      await sendGateResponse(buildId, { gate_id: pendingGate.gateId, action, ...extra });
    } finally {
      setBusy(null);
    }
  };

  const handleAutoApprove = async () => {
    setBusy("auto");
    setAutoApprove(true);
    try {
      await sendGateResponse(buildId, { gate_id: pendingGate.gateId, action: "approve" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="mx-3 mt-3 rounded-lg border border-ember/30 bg-ember/10 p-3"
    >
      {pendingGate.kind === "approval" ? (
        <p className="text-xs text-ink leading-snug">
          <span style={{ color: agentById(pendingGate.agent as Agent["id"])?.hue }} className="font-medium">
            {label}
          </span>{" "}
          is done — continue to <span className="font-medium">{nextLabel}</span>?
        </p>
      ) : (
        <div>
          <p className="mb-2 text-xs text-ink leading-snug">
            <span style={{ color: agentById(pendingGate.agent as Agent["id"])?.hue }} className="font-medium">
              {label}
            </span>{" "}
            has a few questions before starting:
          </p>
          <div className="space-y-2">
            {pendingGate.questions.map((q, i) => (
              <div key={i}>
                <label className="mb-1 block text-[11px] text-muted">{q}</label>
                <input
                  type="text"
                  value={answers[i] ?? ""}
                  onChange={(e) =>
                    setAnswers((cur) => {
                      const next = [...cur];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  placeholder="Your answer…"
                  className="w-full rounded-md border border-border bg-panel/70 px-2 py-1.5 text-xs text-ink placeholder:text-faint focus:outline-none focus:border-ember/60"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pendingGate.kind === "approval" ? (
          <button
            type="button"
            onClick={() => respond("approve")}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-md gradient-ember px-2.5 py-1.5 text-xs font-medium text-ink disabled:opacity-50 hover:brightness-110 transition-[filter]"
          >
            {busy === "approve" ? (
              <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Check size={12} aria-hidden="true" />
            )}
            Approve
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => respond("answers", { answers: answers.filter((a) => a.trim().length > 0) })}
              disabled={busy !== null}
              className="flex items-center gap-1.5 rounded-md gradient-ember px-2.5 py-1.5 text-xs font-medium text-ink disabled:opacity-50 hover:brightness-110 transition-[filter]"
            >
              {busy === "answers" ? (
                <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Check size={12} aria-hidden="true" />
              )}
              Submit answers
            </button>
            <button
              type="button"
              onClick={() => respond("approve")}
              disabled={busy !== null}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:text-ink hover:border-border-soft transition-colors disabled:opacity-50"
            >
              Skip
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handleAutoApprove}
          disabled={busy !== null}
          title="Approve this and every future gate automatically"
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:text-ink hover:border-border-soft transition-colors disabled:opacity-50"
        >
          {busy === "auto" ? (
            <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <FastForward size={12} aria-hidden="true" />
          )}
          Auto-approve
        </button>
      </div>
    </motion.div>
  );
}

function AutoApproveStatus() {
  const autoApprove = useBuildStore((s) => s.autoApprove);
  const setAutoApprove = useBuildStore((s) => s.setAutoApprove);
  const status = useBuildStore((s) => s.status);

  if (status === "idle" || status === "complete" || status === "failed") return null;

  return (
    <div className="mx-3 mt-3 flex items-center justify-between rounded-lg border border-border-soft px-2.5 py-1.5">
      <span className="flex items-center gap-1.5 text-[11px] text-muted">
        <FastForward size={11} aria-hidden="true" />
        Auto-approve gates
      </span>
      <Toggle on={autoApprove} onChange={setAutoApprove} label="Auto-approve gates" />
    </div>
  );
}

function AgentFilesPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const files = useBuildStore((s) => s.files);
  const setOpenFile = useBuildStore((s) => s.setOpenFile);
  const agentRun = useBuildStore((s) => s.agents.find((a) => a.type === agent.id));
  const state = useBuildStore((s) => s.agentStates[agent.id] as PipelineNodeState | undefined);
  const output = useBuildStore((s) => s.agentOutputs[agent.id]);
  const paths = agentRun?.filesChanged ?? [];
  const Icon = agent.icon;
  const hasDocument = output !== undefined && output !== null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="overflow-hidden border-b border-border-soft"
    >
      <div className="px-4 py-3 max-h-96 overflow-y-auto">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon size={12} style={{ color: agent.hue }} aria-hidden="true" />
            <span className="text-[11px] font-medium" style={{ color: agent.hue }}>
              {agent.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close agent explorer"
            className="text-faint hover:text-ink transition-colors"
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>

        {state === "active" || state === "debugging" ? (
          <p className="flex items-center gap-1.5 text-xs text-faint">
            <Loader2 size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Still working — its document and files will appear here once it's done.
          </p>
        ) : (
          <>
            {hasDocument && (
              <div className="mb-3 pb-3 border-b border-border-soft">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-faint">Document</span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadBlob(
                        `${agent.id}.md`,
                        agentDocumentToMarkdown(agent.id, agent.label, output),
                        "text/markdown;charset=utf-8"
                      )
                    }
                    aria-label={`Download ${agent.label} document`}
                    title="Download as Markdown"
                    className="flex items-center gap-1 text-[10px] text-faint hover:text-ink transition-colors"
                  >
                    <FileText size={10} aria-hidden="true" />
                    <Download size={10} aria-hidden="true" />
                  </button>
                </div>
                <AgentDocumentView agentId={agent.id} output={output} />
              </div>
            )}

            {paths.length === 0 ? (
              !hasDocument && (
                <p className="text-xs text-faint">
                  {state === "done" ? "No files attributed to this agent." : "Hasn't started yet."}
                </p>
              )
            ) : (
              <>
                {hasDocument && <span className="text-[10px] uppercase tracking-wider text-faint">Files changed</span>}
                <ul className="space-y-0.5 mt-1">
                  {paths.map((path) => (
                    <li key={path} className="flex items-center gap-1 group">
                      <button
                        type="button"
                        onClick={() => setOpenFile(path)}
                        className="flex-1 min-w-0 flex items-center gap-1.5 rounded px-1.5 py-1 text-left hover:bg-panel-alt transition-colors"
                        title={`Open ${path}`}
                      >
                        <FileCode2 size={11} className="shrink-0 text-faint" aria-hidden="true" />
                        <span className="truncate text-xs font-mono text-muted group-hover:text-ink">{path}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadBlob(path.split("/").pop() || path, files[path] ?? "", "text/plain;charset=utf-8")}
                        disabled={files[path] === undefined}
                        aria-label={`Download ${path}`}
                        title={`Download ${path}`}
                        className="shrink-0 p-1 rounded text-faint hover:text-ink hover:bg-panel-alt transition-colors disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <Download size={11} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function PipelineStrip() {
  const agentStates = useBuildStore((s) => s.agentStates);
  const doneCount = Object.values(agentStates).filter((s) => s === "done").length;
  const [selected, setSelected] = useState<Agent["id"] | null>(null);
  const selectedAgent = selected ? agentById(selected) : undefined;

  return (
    <div className="border-b border-border-soft">
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-faint">
          <span>Pipeline</span>
          <span>{doneCount}/{AGENTS.length} done</span>
        </div>
        <ol className="grid grid-cols-6 gap-1.5">
          {AGENTS.map((agent) => {
            const state = (agentStates[agent.id] as PipelineNodeState) ?? "idle";
            const isActive = state === "active" || state === "debugging";
            const isDone = state === "done";
            const isSelected = selected === agent.id;
            const Icon = agent.icon;
            return (
              <li key={agent.id} className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelected((cur) => (cur === agent.id ? null : agent.id))}
                  aria-pressed={isSelected}
                  aria-label={`${agent.label} — ${state}. Show files it changed.`}
                  className="relative grid h-9 w-9 place-items-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
                  style={{
                    color: agent.hue,
                    borderColor: isSelected
                      ? agent.hue
                      : isActive || isDone
                      ? `color-mix(in oklab, ${agent.hue} 55%, transparent)`
                      : "var(--border)",
                    background: isSelected
                      ? `color-mix(in oklab, ${agent.hue} 20%, transparent)`
                      : isActive
                      ? `color-mix(in oklab, ${agent.hue} 14%, transparent)`
                      : isDone
                      ? `color-mix(in oklab, ${agent.hue} 8%, transparent)`
                      : "transparent",
                    boxShadow: isActive ? `0 0 16px -4px color-mix(in oklab, ${agent.hue} 55%, transparent)` : "none",
                  }}
                >
                  {isActive && (
                    <span className="absolute inset-0 rounded-lg animate-tick" style={{ color: agent.hue }} aria-hidden="true" />
                  )}
                  {isDone ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <Icon size={15} className={isActive ? "animate-tick" : ""} aria-hidden="true" />
                  )}
                </button>
                <span
                  className="w-full truncate text-center text-[9.5px]"
                  style={{ color: isActive || isDone || isSelected ? agent.hue : "var(--faint)" }}
                  title={agent.label}
                >
                  {agent.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <AnimatePresence>
        {selectedAgent && <AgentFilesPanel agent={selectedAgent} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}

function ChatTranscript({ scrollRef }: { scrollRef: React.MutableRefObject<HTMLDivElement | null> }) {
  const messages = useBuildStore((s) => s.messages);
  const status = useBuildStore((s) => s.status);

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Build conversation"
      className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3"
    >
      {messages.length === 0 && (
        <p className="text-xs text-faint">
          Describe what you want to build and the agents will take it from there.
        </p>
      )}
      <motion.div variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
        {messages.map((msg, i) => {
          if (msg.from === "user") {
            return (
              <motion.div key={i} data-msg variants={motionVariants.staggerItem} className="flex flex-col items-end mb-3">
                <div className="max-w-[92%] rounded-2xl rounded-tr-sm border border-ember/30 bg-ember/10 px-3 py-2 text-sm leading-snug text-ink">
                  {msg.text}
                </div>
              </motion.div>
            );
          }
          const agent = msg.agent ? agentById(msg.agent) : undefined;
          if (!agent) {
            return (
              <motion.div key={i} data-msg variants={motionVariants.staggerItem} className="text-xs text-muted leading-relaxed mb-3">
                {msg.text}
              </motion.div>
            );
          }
          const Icon = agent.icon;
          return (
            <motion.div key={i} data-msg variants={motionVariants.staggerItem} className="flex gap-2 text-sm leading-snug mb-3">
              <div
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded"
                style={{ color: agent.hue, background: `color-mix(in oklab, ${agent.hue} 14%, transparent)` }}
              >
                <Icon size={11} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider" style={{ color: agent.hue }}>
                  {agent.label}
                </div>
                <p className="text-muted">{msg.text}</p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
      {(status === "running" || status === "debugging") && (
        <div className="flex items-center gap-2 pl-7 text-xs text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-ember animate-tick" aria-hidden="true" />
          Agents are working…
        </div>
      )}
    </div>
  );
}

export function ChatPanel({ onSubmit }: { onSubmit: (prompt: string) => void | Promise<void> }) {
  const messages = useBuildStore((s) => s.messages);
  const status = useBuildStore((s) => s.status);
  const pendingGate = useBuildStore((s) => s.pendingGate);
  useAutoApproveGate();

  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const busy = status === "running" || status === "debugging" || submitting;

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || busy || isOffline) return;
    setDraft("");
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.aside
      variants={motionVariants.slideInLeft}
      initial="hidden"
      animate="visible"
      transition={{ ...presets.sidebarItem }}
      className="glass-strong rounded-xl flex flex-col min-h-0 overflow-hidden"
    >
      <PipelineStrip />
      <AutoApproveStatus />
      <AnimatePresence>{pendingGate && <GateApprovalCard />}</AnimatePresence>
      <ChatTranscript scrollRef={scrollRef} />

      {isOffline && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-3 mb-2 px-3 py-2 rounded-lg bg-warn/10 border border-warn/30 text-warn text-xs flex items-center gap-2"
        >
          <WifiOff size={12} aria-hidden="true" />
          You're offline — reconnect to keep building.
        </motion.div>
      )}

      <form
        className="p-3 border-t border-border-soft"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="relative rounded-lg border border-border bg-panel/70 focus-within:border-ember/60 focus-within:ring-2 focus-within:ring-ember/25 transition-colors">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={isOffline ? "You're offline…" : busy ? "Agents are working — you can queue changes after this build." : "Describe your app…"}
            disabled={busy || isOffline}
            aria-label="Build prompt"
            className="w-full resize-none rounded-lg bg-transparent px-3 py-2.5 pr-11 text-sm text-ink placeholder:text-faint focus:outline-none disabled:opacity-50"
          />
          <motion.button
            type="submit"
            disabled={busy || isOffline || !draft.trim()}
            aria-label="Send prompt"
            whileHover={presets.button.whileHover}
            whileTap={presets.button.whileTap}
            className="absolute right-2 bottom-2 grid h-7 w-7 place-items-center rounded-md gradient-ember text-base disabled:opacity-30 hover:brightness-110 transition-[filter]"
          >
            <ArrowUp size={13} strokeWidth={2.5} aria-hidden="true" />
          </motion.button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-faint">
          <span>Shift + Enter for newline</span>
          <span>{draft.length}/2000</span>
        </div>
      </form>
    </motion.aside>
  );
}
