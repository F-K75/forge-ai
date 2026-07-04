import { useState } from "react";
import toast from "react-hot-toast";
import { Pencil, Check, X, Download } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { initiativesApi } from "../../lib/pmApi";

function EditableList({
  label, items, onSave,
}: { label: string; items: string[]; onSave: (items: string[]) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(items.join("\n"));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft.split("\n").map(s => s.trim()).filter(Boolean));
      setEditing(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="py-6 border-b border-border-soft">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-[0.14em] text-muted">{label}</h3>
        {!editing ? (
          <button
            onClick={() => { setDraft(items.join("\n")); setEditing(true); }}
            className="text-faint hover:text-ink transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded"
            aria-label={`Edit ${label}`}
          >
            <Pencil size={12} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="text-ok hover:opacity-80 focus:outline-none" aria-label="Save">
              <Check size={14} />
            </button>
            <button onClick={() => setEditing(false)} className="text-faint hover:text-ink focus:outline-none" aria-label="Cancel">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={Math.max(3, items.length + 1)}
          className="w-full bg-panel border border-border rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
          placeholder="One item per line"
        />
      ) : items.length === 0 ? (
        <p className="text-sm text-faint">Not set.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-ink flex gap-2">
              <span className="text-faint">—</span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EditableText({
  label, value, onSave,
}: { label: string; value: string; onSave: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="py-6 border-b border-border-soft">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-[0.14em] text-muted">{label}</h3>
        {!editing ? (
          <button
            onClick={() => { setDraft(value); setEditing(true); }}
            className="text-faint hover:text-ink transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded"
            aria-label={`Edit ${label}`}
          >
            <Pencil size={12} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving} className="text-ok hover:opacity-80 focus:outline-none" aria-label="Save">
              <Check size={14} />
            </button>
            <button onClick={() => setEditing(false)} className="text-faint hover:text-ink focus:outline-none" aria-label="Cancel">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          className="w-full bg-panel border border-border rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
        />
      ) : (
        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{value || "Not set."}</p>
      )}
    </section>
  );
}

export default function OverviewTab() {
  const { initiative, prd, hydrate } = usePMStore();
  if (!initiative) return null;

  const saveField = async (field: string, value: unknown) => {
    await initiativesApi.update(initiative.id, { [field]: value });
    await hydrate(initiative.id);
  };

  const handleExportMarkdown = async () => {
    try {
      const { markdown } = await initiativesApi.getPrd(initiative.id, "markdown");
      const blob = new Blob([markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${initiative.name}-PRD.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("PRD not generated yet");
    }
  };

  return (
    <div className="px-6 md:px-8 py-6 max-w-3xl">
      <EditableText label="Vision" value={initiative.vision ?? ""} onSave={v => saveField("vision", v)} />
      <EditableList label="Business goals" items={initiative.business_goals ?? []} onSave={v => saveField("business_goals", v)} />
      <EditableText label="Product scope" value={initiative.product_scope ?? ""} onSave={v => saveField("product_scope", v)} />
      <EditableList
        label="Functional requirements"
        items={initiative.functional_requirements ?? []}
        onSave={v => saveField("functional_requirements", v)}
      />
      <EditableList
        label="Non-functional requirements"
        items={initiative.non_functional_requirements ?? []}
        onSave={v => saveField("non_functional_requirements", v)}
      />
      <EditableList label="Success metrics" items={initiative.success_metrics ?? []} onSave={v => saveField("success_metrics", v)} />
      <EditableList label="Tech stack" items={initiative.tech_stack ?? []} onSave={v => saveField("tech_stack", v)} />
      <EditableText label="Estimated timeline" value={initiative.estimated_timeline ?? ""} onSave={v => saveField("estimated_timeline", v)} />

      <section className="py-6 border-b border-border-soft">
        <h3 className="text-xs uppercase tracking-[0.14em] text-muted mb-3">Risks</h3>
        {(initiative.risks ?? []).length === 0 ? (
          <p className="text-sm text-faint">None identified.</p>
        ) : (
          <ul className="space-y-2">
            {(initiative.risks as { description: string; severity: string; mitigation?: string }[]).map((r, i) => (
              <li key={i} className="text-sm">
                <span
                  className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mr-2 uppercase ${
                    r.severity === "high" ? "bg-error/10 text-error" : r.severity === "medium" ? "bg-warn/10 text-warn" : "bg-border text-muted"
                  }`}
                >
                  {r.severity}
                </span>
                <span className="text-ink">{r.description}</span>
                {r.mitigation && <span className="block text-xs text-muted mt-0.5 pl-1">Mitigation: {r.mitigation}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="py-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-[0.14em] text-muted">Product Requirements Document</h3>
          {prd && (
            <button
              onClick={handleExportMarkdown}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded"
            >
              <Download size={12} aria-hidden="true" />
              Export Markdown
            </button>
          )}
        </div>
        {!prd ? (
          <p className="text-sm text-faint">Not generated yet.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted mb-1">Executive summary</p>
              <p className="text-sm text-ink leading-relaxed">{prd.executive_summary}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted mb-1">Problem statement</p>
              <p className="text-sm text-ink leading-relaxed">{prd.problem_statement}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted mb-1">Solution</p>
              <p className="text-sm text-ink leading-relaxed">{prd.solution}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted mb-1">API overview</p>
              <p className="text-sm text-ink leading-relaxed">{prd.api_overview}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted mb-1">Database overview</p>
              <p className="text-sm text-ink leading-relaxed">{prd.database_overview}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
