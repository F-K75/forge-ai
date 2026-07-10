import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, CircleDashed, OctagonX } from "lucide-react";
import { useBuildStore } from "../../store/buildStore";
import { AGENTS } from "../../lib/agents";
import { isRecord } from "../../lib/wsContract";

// Center-panel view of the build pipeline: each agent's structured output as
// it lands (architect blueprint, business model, design, PM validation), and
// — on interactive builds — the gate card asking the user to approve the
// stage or answer the architect's clarifying questions.

const AGENT_DESCRIPTIONS: Record<string, string> = {
  architect: "Blueprint: pages, data models, API endpoints",
  business_improver: "Business model review",
  designer: "Design system and UI direction",
  developer: "Writes the code — watch the Code tab",
  integration: "Wires external services",
  pm: "Validates the build and scores quality",
};

export function AgentFlowPanel() {
  const agentStates = useBuildStore((s) => s.agentStates);
  const agentOutputs = useBuildStore((s) => s.agentOutputs);
  const pendingGate = useBuildStore((s) => s.pendingGate);
  const status = useBuildStore((s) => s.status);

  const gateRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (pendingGate) gateRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [pendingGate]);

  return (
    <div className="h-full overflow-y-auto px-6 py-5" aria-label="Agent outputs">
      {status === "idle" && (
        <p className="text-sm text-faint">
          Agent plans and outputs appear here as the pipeline runs.
        </p>
      )}

      <ol className="space-y-3 max-w-2xl">
        {AGENTS.map((agent) => {
          const state = agentStates[agent.id] ?? "idle";
          const output = agentOutputs[agent.id];
          const gated = pendingGate?.agent === agent.id;
          if (state === "idle" && output === undefined && !gated) return null;

          const Icon = agent.icon;
          return (
            <li key={agent.id} className="rounded-lg border border-border bg-panel/50">
              <div className="flex items-center gap-2.5 px-4 py-3">
                <Icon size={15} strokeWidth={1.5} style={{ color: agent.hue }} aria-hidden="true" />
                <span className="text-sm font-medium text-ink">{agent.label}</span>
                <span className="text-xs text-faint truncate">{AGENT_DESCRIPTIONS[agent.id]}</span>
                <span className="ml-auto shrink-0">
                  <StatusBadge state={state} waiting={gated} />
                </span>
              </div>

              {output !== undefined && (
                <div className="border-t border-border-soft px-4 py-3">
                  <OutputView output={output} />
                </div>
              )}

              {gated && pendingGate && (
                <div ref={gateRef} className="border-t border-border-soft">
                  <GateCard />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StatusBadge({ state, waiting }: { state: string; waiting: boolean }) {
  if (waiting)
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-warn">
        <CircleDashed size={12} aria-hidden="true" /> Waiting for you
      </span>
    );
  if (state === "active" || state === "debugging")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <span className="w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {state === "debugging" ? "Debugging" : "Working"}
      </span>
    );
  if (state === "done")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ok">
        <Check size={12} aria-hidden="true" /> Done
      </span>
    );
  return <span className="text-xs text-faint">Queued</span>;
}

// ─── Gate card ───────────────────────────────────────────────────────────────

function GateCard() {
  const pendingGate = useBuildStore((s) => s.pendingGate);
  const gateSubmitting = useBuildStore((s) => s.gateSubmitting);
  const respondGate = useBuildStore((s) => s.respondGate);

  if (!pendingGate) return null;
  const isQuestions = pendingGate.kind === "questions";

  return (
    <div className="px-4 py-4 bg-panel-alt/60">
      {isQuestions ? (
        <QuestionsForm
          questions={pendingGate.questions}
          submitting={gateSubmitting}
          onSubmit={(answers) => respondGate("answers", answers)}
          onSkip={() => respondGate("approve")}
        />
      ) : (
        <>
          <p className="text-sm text-ink mb-1">Review this output.</p>
          <p className="text-xs text-muted mb-3">
            The next agent starts once you approve.
            <GateCountdown />
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => respondGate("approve")}
              disabled={gateSubmitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
            >
              Approve & continue <ChevronRight size={13} aria-hidden="true" />
            </button>
            <CancelButton disabled={gateSubmitting} onCancel={() => respondGate("cancel")} />
          </div>
        </>
      )}
    </div>
  );
}

function QuestionsForm({
  questions,
  submitting,
  onSubmit,
  onSkip,
}: {
  questions: string[];
  submitting: boolean;
  onSubmit: (answers: string[]) => void;
  onSkip: () => void;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const hasAnswer = answers.some((a) => a.trim());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (hasAnswer) onSubmit(answers);
      }}
    >
      <p className="text-sm text-ink mb-1">A few questions before the architecture is drawn.</p>
      <p className="text-xs text-muted mb-3">
        Answer what you can — skipping lets the architect decide.
        <GateCountdown />
      </p>
      <div className="space-y-3 mb-4">
        {questions.map((q, i) => (
          <label key={i} className="block">
            <span className="block text-xs text-muted mb-1">{q}</span>
            <input
              type="text"
              value={answers[i]}
              onChange={(e) =>
                setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
              }
              disabled={submitting}
              className="w-full rounded-md bg-transparent border border-border px-3 py-1.5 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 disabled:opacity-50"
              placeholder="Your answer…"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting || !hasAnswer}
          className="px-3.5 py-1.5 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
        >
          Send answers
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="px-3.5 py-1.5 rounded-md border border-border text-sm text-muted hover:text-ink disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
        >
          Skip
        </button>
      </div>
    </form>
  );
}

// Two-step cancel so a stray click can't kill a build.
function CancelButton({ disabled, onCancel }: { disabled: boolean; onCancel: () => void }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  return (
    <button
      onClick={() => (confirming ? onCancel() : setConfirming(true))}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md border text-sm transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-error/50 ${
        confirming ? "border-error/60 text-error" : "border-border text-muted hover:text-ink"
      }`}
    >
      {confirming && <OctagonX size={13} aria-hidden="true" />}
      {confirming ? "Really cancel build?" : "Cancel build"}
    </button>
  );
}

function GateCountdown() {
  const pendingGate = useBuildStore((s) => s.pendingGate);
  const [remaining, setRemaining] = useState<number | null>(pendingGate?.timeoutSeconds ?? null);

  useEffect(() => {
    setRemaining(pendingGate?.timeoutSeconds ?? null);
    if (!pendingGate?.timeoutSeconds) return;
    const id = window.setInterval(() => {
      setRemaining((r) => (r === null || r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [pendingGate?.gateId, pendingGate?.timeoutSeconds]);

  if (remaining === null) return null;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <span className="text-faint">
      {" "}
      Auto-continues in {m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`}.
    </span>
  );
}

// ─── Output rendering ────────────────────────────────────────────────────────
// Mostly generic (agents return free-form JSON) with light heuristics so the
// architect blueprint and PM validation read as documents, not JSON dumps.

function OutputView({ output }: { output: unknown }) {
  if (typeof output === "string") {
    return output.trim() ? <p className="text-sm text-muted whitespace-pre-wrap">{output}</p> : null;
  }
  if (!isRecord(output)) {
    return <RawJson value={output} />;
  }

  const entries = Object.entries(output).filter(([, v]) => !isEmptyValue(v));
  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => (
        <OutputEntry key={key} name={key} value={value} />
      ))}
      <RawJson value={output} />
    </div>
  );
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (isRecord(v) && Object.keys(v).length === 0) return true;
  return false;
}

function labelize(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function OutputEntry({ name, value }: { name: string; value: unknown }) {
  // Scalars: single row.
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return (
      <div className="text-sm">
        <span className="text-faint">{labelize(name)}: </span>
        <span className="text-muted">{typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    // Array of strings → chips.
    if (value.every((v) => typeof v === "string")) {
      return (
        <div>
          <div className="text-xs text-faint mb-1.5">{labelize(name)}</div>
          <div className="flex flex-wrap gap-1.5">
            {(value as string[]).map((v, i) => (
              <span key={i} className="px-2 py-0.5 rounded border border-border-soft text-xs text-muted">
                {v}
              </span>
            ))}
          </div>
        </div>
      );
    }
    // Array of objects → labelled list.
    return (
      <div>
        <div className="text-xs text-faint mb-1.5">{labelize(name)}</div>
        <ul className="space-y-1">
          {value.map((item, i) => (
            <li key={i} className="text-sm text-muted flex gap-2">
              <span className="text-faint select-none">·</span>
              <span>{itemLabel(item)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Nested object → indent one level of key/values.
  if (isRecord(value)) {
    return (
      <div>
        <div className="text-xs text-faint mb-1.5">{labelize(name)}</div>
        <div className="pl-3 border-l border-border-soft space-y-1">
          {Object.entries(value)
            .filter(([, v]) => !isEmptyValue(v))
            .map(([k, v]) => (
              <div key={k} className="text-sm">
                <span className="text-faint">{labelize(k)}: </span>
                <span className="text-muted">{scalarish(v)}</span>
              </div>
            ))}
        </div>
      </div>
    );
  }

  return null;
}

function itemLabel(item: unknown): string {
  if (typeof item === "string") return item;
  if (!isRecord(item)) return JSON.stringify(item);
  const o = item as Record<string, unknown>;
  // API endpoints read best as "GET /api/habits — description".
  if (typeof o.method === "string" && typeof o.path === "string") {
    return `${o.method} ${o.path}${typeof o.description === "string" && o.description ? ` — ${o.description}` : ""}`;
  }
  const primary = [o.name, o.title, o.file, o.path].find((v) => typeof v === "string") as string | undefined;
  const secondary = [o.route, o.description, o.severity].find((v) => typeof v === "string") as string | undefined;
  if (primary) return secondary ? `${primary} — ${secondary}` : primary;
  return JSON.stringify(item);
}

function scalarish(v: unknown): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return (v as string[]).join(", ");
  return JSON.stringify(v);
}

function RawJson({ value }: { value: unknown }) {
  return (
    <details className="group">
      <summary className="text-xs text-faint cursor-pointer hover:text-muted select-none">
        Raw output
      </summary>
      <pre className="mt-2 p-3 rounded-md bg-panel-alt border border-border-soft text-xs text-muted overflow-x-auto">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
