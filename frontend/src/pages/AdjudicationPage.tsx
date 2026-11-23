import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Eye, FileWarning, Lock, RefreshCw, ScrollText } from "lucide-react";
import { toast } from "react-hot-toast";
import { LIVE_MODE } from "../lib/env";
import {
  adjudicationApi,
  MIN_EXPAND_PURPOSE_CHARS,
  type AdjudicationExpansion,
  type AdjudicationItemView,
  type AdjudicationQueueItem,
  type AdjudicationStatus,
  type AdjudicationVerdict,
} from "../lib/qualityReview";

/**
 * Admin "Adjudication" (plan §17.3, PV-4/PV-5). The default item view shows
 * only the finding, the redacted excerpt and the blueprint fragment. The full
 * artifact is behind "Expand (logged)", which asks for a purpose. Every list,
 * view, expand and label request is written to the access log by the server.
 */

const VERDICTS: { value: AdjudicationVerdict; label: string }[] = [
  { value: "true_positive", label: "True positive" },
  { value: "false_positive", label: "False positive" },
  { value: "uncertain", label: "Uncertain" },
];

function errorDetail(err: any, fallback: string): string {
  return err?.response?.data?.detail || fallback;
}

function ExcerptBlock({ text, startLine }: { text: string; startLine: number }) {
  const lines = text ? text.split("\n") : [];
  if (!lines.length) {
    return <p className="text-xs text-muted">No excerpt: the file was not available when the finding was queued.</p>;
  }
  return (
    <pre
      id="adjudication-excerpt"
      aria-label="Redacted excerpt"
      className="text-[11px] leading-5 font-mono bg-base border border-border-soft rounded-lg p-3 overflow-x-auto max-h-96"
    >
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre">
          <span className="select-none text-muted inline-block w-10 pr-3 text-right">{startLine + i}</span>
          {line}
        </div>
      ))}
    </pre>
  );
}

function ExpandPanel({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [target, setTarget] = useState<"artifact" | "prompt">("artifact");
  const [busy, setBusy] = useState(false);
  const [expansion, setExpansion] = useState<AdjudicationExpansion | null>(null);

  useEffect(() => {
    setOpen(false);
    setPurpose("");
    setExpansion(null);
  }, [itemId]);

  const purposeOk = purpose.trim().length >= MIN_EXPAND_PURPOSE_CHARS;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purposeOk) return;
    setBusy(true);
    try {
      setExpansion(await adjudicationApi.expand(itemId, purpose.trim(), target));
    } catch (err) {
      toast.error(errorDetail(err, "Couldn't expand this item"));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        id="adjudication-expand-btn"
        type="button"
        onClick={() => setOpen(true)}
        className="bb-btn bb-btn-subtle text-xs px-3 py-1.5 inline-flex items-center gap-1.5"
      >
        <Lock size={12} aria-hidden="true" />
        Expand (logged)
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-warn/30 bg-warn/5 p-3.5">
      <form onSubmit={submit} className="space-y-2.5" aria-label="Expand with a logged purpose">
        <p className="text-[11px] text-muted">
          Expanding shows the full artifact (still redacted). Your purpose is recorded in the access log
          with this request.
        </p>
        <div className="space-y-1">
          <span id="expand-purpose-label" className="text-[11px] font-medium text-ink block">
            Purpose (at least {MIN_EXPAND_PURPOSE_CHARS} characters)
          </span>
          <textarea
            id="adjudication-expand-purpose"
            aria-labelledby="expand-purpose-label"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span id="expand-target-label" className="text-[11px] font-medium text-ink">Show</span>
          <select
            id="adjudication-expand-target"
            aria-labelledby="expand-target-label"
            value={target}
            onChange={(e) => setTarget(e.target.value as "artifact" | "prompt")}
            className="text-xs bg-base border border-border rounded-lg px-2 py-1 text-ink"
          >
            <option value="artifact">Full file</option>
            <option value="prompt">Build prompt</option>
          </select>
          <button
            type="submit"
            disabled={!purposeOk || busy}
            className="bb-btn bb-btn-primary text-xs px-3 py-1.5"
          >
            {busy ? "Expanding..." : "Expand and log"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setExpansion(null);
            }}
            className="bb-btn bb-btn-subtle text-xs px-3 py-1.5"
          >
            Close
          </button>
        </div>
      </form>
      {expansion && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted">
            {expansion.path ?? "Build prompt"} (redacted{expansion.truncated ? ", truncated" : ""}). This
            access was logged.
          </p>
          <pre
            id="adjudication-expanded-content"
            className="text-[11px] leading-5 font-mono bg-base border border-border-soft rounded-lg p-3 overflow-auto max-h-96 whitespace-pre"
          >
            {expansion.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function LabelForm({ item, onSaved }: { item: AdjudicationItemView; onSaved: () => void }) {
  const [verdict, setVerdict] = useState<AdjudicationVerdict | "">(item.my_label?.verdict ?? "");
  const [category, setCategory] = useState(item.my_label?.corrected_category ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setVerdict(item.my_label?.verdict ?? "");
    setCategory(item.my_label?.corrected_category ?? "");
    setNotes("");
  }, [item.item_id, item.my_label]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verdict) return;
    setBusy(true);
    try {
      await adjudicationApi.label(item.item_id, {
        verdict,
        corrected_category: category.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Label saved");
      onSaved();
    } catch (err) {
      toast.error(errorDetail(err, "Couldn't save the label"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="adjudication-label-form" onSubmit={submit} className="space-y-3" aria-label="Label this finding">
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-semibold text-ink">Verdict</legend>
        <div className="flex flex-wrap gap-3">
          {VERDICTS.map((v) => (
            <span key={v.value} className="inline-flex items-center gap-1.5 text-xs text-ink">
              <input
                type="radio"
                id={`verdict-${v.value}`}
                name="verdict"
                value={v.value}
                checked={verdict === v.value}
                onChange={() => setVerdict(v.value)}
                aria-labelledby={`verdict-${v.value}-label`}
              />
              <span id={`verdict-${v.value}-label`}>{v.label}</span>
            </span>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <span id="label-category-label" className="text-[11px] font-medium text-ink block">
            Corrected category (optional)
          </span>
          <input
            id="adjudication-label-category"
            aria-labelledby="label-category-label"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={200}
            className="w-full text-xs bg-base border border-border rounded-lg px-3 py-1.5 text-ink"
          />
        </div>
        <div className="space-y-1">
          <span id="label-notes-label" className="text-[11px] font-medium text-ink block">
            Notes (optional, redacted on save)
          </span>
          <input
            id="adjudication-label-notes"
            aria-labelledby="label-notes-label"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            className="w-full text-xs bg-base border border-border rounded-lg px-3 py-1.5 text-ink"
          />
        </div>
      </div>
      <button type="submit" disabled={!verdict || busy} className="bb-btn bb-btn-primary text-xs px-3.5 py-1.5">
        {busy ? "Saving..." : item.my_label ? "Update label" : "Submit label"}
      </button>
    </form>
  );
}

function ItemView({ itemId, onLabelled }: { itemId: string; onLabelled: () => void }) {
  const [item, setItem] = useState<AdjudicationItemView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adjudicationApi
      .item(itemId)
      .then(setItem)
      .catch((err) => {
        setItem(null);
        setError(errorDetail(err, "Couldn't load this item"));
      });
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <p role="alert" className="text-xs text-warn">
        {error}
      </p>
    );
  }
  if (!item) return <p className="text-xs text-muted">Loading item...</p>;

  const fragment = item.blueprint_fragment || {};
  const counts = Object.entries(item.redaction_report?.counts || {});

  return (
    <article id="adjudication-item" className="space-y-4" aria-label="Adjudication item">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <FileWarning size={15} className="text-warn" aria-hidden="true" />
          {item.finding.rule_or_category}
        </h2>
        <p className="text-xs text-muted font-mono">
          {item.file ?? "(no file)"}
          {item.finding.line ? `:${item.finding.line}` : ""} · build {item.finding.build_id} · basis{" "}
          {item.consent_basis === "internal" ? "internal" : "owner opt-in"}
        </p>
        {item.finding.message && <p className="text-xs text-ink">{item.finding.message}</p>}
      </header>

      <section className="space-y-1.5" aria-label="Excerpt">
        <h3 className="text-xs font-semibold text-ink">
          Redacted excerpt (lines {item.excerpt_start_line}–{item.excerpt_end_line})
        </h3>
        <ExcerptBlock text={item.redacted_excerpt} startLine={item.excerpt_start_line} />
        <p className="text-[11px] text-muted">
          {counts.length
            ? `Redacted: ${counts.map(([rule, n]) => `${rule} ×${n}`).join(", ")}`
            : "Nothing needed redaction."}
        </p>
      </section>

      <section className="space-y-1.5" aria-label="Blueprint fragment">
        <h3 className="text-xs font-semibold text-ink">Blueprint fragment</h3>
        {Object.keys(fragment).length ? (
          <pre className="text-[11px] font-mono bg-base border border-border-soft rounded-lg p-3 overflow-x-auto max-h-60">
            {JSON.stringify(fragment, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-muted">No related part of the blueprint.</p>
        )}
      </section>

      <ExpandPanel itemId={item.item_id} />

      <section className="pt-3 border-t border-border-soft">
        <LabelForm
          item={item}
          onSaved={() => {
            load();
            onLabelled();
          }}
        />
      </section>
    </article>
  );
}

export default function AdjudicationPage() {
  const [status, setStatus] = useState<AdjudicationStatus>("pending");
  const [items, setItems] = useState<AdjudicationQueueItem[]>([]);
  const [loading, setLoading] = useState(LIVE_MODE);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const loadQueue = useCallback(() => {
    if (!LIVE_MODE) return;
    setLoading(true);
    setError(null);
    adjudicationApi
      .queue(status)
      .then((data) => setItems(data.items))
      .catch((err) => setError(errorDetail(err, "Couldn't load the adjudication queue")))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  return (
    <div id="adjudication-view" className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-ink flex items-center gap-2">
            <ClipboardCheck size={16} className="text-accent" aria-hidden="true" />
            Adjudication
          </h1>
          <p className="text-xs text-muted flex items-center gap-1.5">
            <ScrollText size={12} aria-hidden="true" />
            Internal and opted-in builds only. Every view, expand and label is recorded in the access log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span id="adjudication-status-label" className="text-[11px] text-muted">Queue</span>
          <select
            id="adjudication-status-filter"
            aria-labelledby="adjudication-status-label"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AdjudicationStatus);
              setSelected(null);
            }}
            className="text-xs bg-base border border-border rounded-lg px-2 py-1 text-ink"
          >
            <option value="pending">Pending</option>
            <option value="labelled">Labelled</option>
          </select>
          <button
            type="button"
            onClick={loadQueue}
            className="bb-btn bb-btn-subtle text-xs px-2.5 py-1.5 inline-flex items-center gap-1"
            aria-label="Refresh queue"
          >
            <RefreshCw size={12} aria-hidden="true" className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {!LIVE_MODE ? (
        <p className="text-xs text-muted">The adjudication queue needs a live backend.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
          <section aria-label="Adjudication queue" className="rounded-xl border border-border bg-panel p-3 space-y-2">
            {error && (
              <p role="alert" className="text-xs text-warn">
                {error}
              </p>
            )}
            {!error && !loading && items.length === 0 && (
              <p className="text-xs text-muted p-2">No items {status === "pending" ? "waiting" : "labelled"}.</p>
            )}
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item.item_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(item.item_id)}
                    aria-current={selected === item.item_id ? "true" : undefined}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${
                      selected === item.item_id
                        ? "border-accent/40 bg-accent-soft"
                        : "border-border-soft hover:bg-panel-alt"
                    }`}
                  >
                    <span className="font-medium text-ink block">{item.rule_or_category ?? "finding"}</span>
                    <span className="font-mono text-muted block truncate">
                      {item.file ?? "(no file)"}
                      {item.line ? `:${item.line}` : ""}
                    </span>
                    <span className="text-[10px] text-muted">
                      {item.consent_basis === "internal" ? "internal" : "opt-in"} · expires{" "}
                      {new Date(item.expires_at).toLocaleDateString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-border bg-panel p-4" aria-label="Selected item">
            {selected ? (
              <ItemView itemId={selected} onLabelled={loadQueue} />
            ) : (
              <p className="text-xs text-muted flex items-center gap-1.5">
                <Eye size={12} aria-hidden="true" />
                Select an item to view its redacted excerpt. Opening an item is logged.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
