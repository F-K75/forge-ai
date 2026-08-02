import { useState } from "react";
import toast from "react-hot-toast";
import { Pencil, Check, X, Download, FileText, Target, Layers, GitBranch, Shield, CalendarDays } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { initiativesApi } from "../../lib/pmApi";
import { motion, motionVariants } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";

function EditableList({
  label, items, onSave, icon: Icon,
}: { label: string; items: string[]; onSave: (items: string[]) => Promise<void>; icon?: typeof FileText }) {
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
    <motion.section className="py-5 border-b border-white/[0.06]" variants={motionVariants.fadeUp}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-accent" />}
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</h3>
        </div>
        {!editing ? (
          <motion.button
            onClick={() => { setDraft(items.join("\n")); setEditing(true); }}
            {...presets.button}
            className="text-faint hover:text-ink transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded p-1"
            aria-label={`Edit ${label}`}
          >
            <Pencil size={12} />
          </motion.button>
        ) : (
          <div className="flex items-center gap-1">
            <motion.button onClick={save} disabled={saving} className="text-ok hover:opacity-80 focus:outline-none p-1 rounded" aria-label="Save" whileTap={{ scale: 0.92 }}>
              <Check size={14} />
            </motion.button>
            <motion.button onClick={() => setEditing(false)} className="text-faint hover:text-ink focus:outline-none p-1 rounded" aria-label="Cancel" whileTap={{ scale: 0.92 }}>
              <X size={14} />
            </motion.button>
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={Math.max(3, items.length + 1)}
          className="w-full bg-panel border border-white/10 rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 placeholder:text-faint"
          placeholder="One item per line"
        />
      ) : items.length === 0 ? (
        <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Not set.</motion.p>
      ) : (
        <motion.ul className="space-y-2" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
          {items.map((item, i) => (
            <motion.li key={i} className="text-sm text-ink flex gap-3 items-start" variants={motionVariants.staggerItem} custom={i}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" aria-hidden="true" />
              <span className="leading-relaxed">{item}</span>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </motion.section>
  );
}

function EditableText({
  label, value, onSave, icon: Icon,
}: { label: string; value: string; onSave: (value: string) => Promise<void>; icon?: typeof FileText }) {
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
    <motion.section className="py-5 border-b border-white/[0.06]" variants={motionVariants.fadeUp}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-accent" />}
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</h3>
        </div>
        {!editing ? (
          <motion.button
            onClick={() => { setDraft(value); setEditing(true); }}
            {...presets.button}
            className="text-faint hover:text-ink transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded p-1"
            aria-label={`Edit ${label}`}
          >
            <Pencil size={12} />
          </motion.button>
        ) : (
          <div className="flex items-center gap-1">
            <motion.button onClick={save} disabled={saving} className="text-ok hover:opacity-80 focus:outline-none p-1 rounded" aria-label="Save" whileTap={{ scale: 0.92 }}>
              <Check size={14} />
            </motion.button>
            <motion.button onClick={() => setEditing(false)} className="text-faint hover:text-ink focus:outline-none p-1 rounded" aria-label="Cancel" whileTap={{ scale: 0.92 }}>
              <X size={14} />
            </motion.button>
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          className="w-full bg-panel border border-white/10 rounded-xl px-4 py-3 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 placeholder:text-faint"
        />
      ) : (
        <motion.p className="text-sm text-ink leading-relaxed whitespace-pre-wrap" variants={motionVariants.fadeIn}>{value || "Not set."}</motion.p>
      )}
    </motion.section>
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
    <motion.div className="px-6 md:px-8 py-6 max-w-3xl" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
      <motion.div variants={motionVariants.staggerItem}>
        <EditableText label="Vision" value={initiative.vision ?? ""} onSave={v => saveField("vision", v)} icon={Target} />
      </motion.div>
      <motion.div variants={motionVariants.staggerItem}>
        <EditableList label="Business goals" items={initiative.business_goals ?? []} onSave={v => saveField("business_goals", v)} icon={Target} />
      </motion.div>
      <motion.div variants={motionVariants.staggerItem}>
        <EditableText label="Product scope" value={initiative.product_scope ?? ""} onSave={v => saveField("product_scope", v)} icon={Layers} />
      </motion.div>
      <motion.div variants={motionVariants.staggerItem}>
        <EditableList
          label="Functional requirements"
          items={initiative.functional_requirements ?? []}
          onSave={v => saveField("functional_requirements", v)}
          icon={GitBranch}
        />
      </motion.div>
      <motion.div variants={motionVariants.staggerItem}>
        <EditableList
          label="Non-functional requirements"
          items={initiative.non_functional_requirements ?? []}
          onSave={v => saveField("non_functional_requirements", v)}
          icon={Shield}
        />
      </motion.div>
      <motion.div variants={motionVariants.staggerItem}>
        <EditableList label="Success metrics" items={initiative.success_metrics ?? []} onSave={v => saveField("success_metrics", v)} icon={Target} />
      </motion.div>
      <motion.div variants={motionVariants.staggerItem}>
        <EditableList label="Tech stack" items={initiative.tech_stack ?? []} onSave={v => saveField("tech_stack", v)} icon={GitBranch} />
      </motion.div>
      <motion.div variants={motionVariants.staggerItem}>
        <EditableText label="Estimated timeline" value={initiative.estimated_timeline ?? ""} onSave={v => saveField("estimated_timeline", v)} icon={CalendarDays} />
      </motion.div>

      <motion.section className="py-5 border-b border-white/[0.06]" variants={motionVariants.fadeUp}>
        <div className="flex items-center gap-2 mb-4">
          <Shield size={14} className="text-warn" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Risks</h3>
        </div>
        {(initiative.risks ?? []).length === 0 ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>None identified.</motion.p>
        ) : (
          <motion.ul className="space-y-3" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {(initiative.risks as { description: string; severity: string; mitigation?: string }[]).map((r, i) => (
              <motion.li key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4" variants={motionVariants.staggerItem} custom={i}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${
                      r.severity === "high" ? "bg-error/10 text-error" : r.severity === "medium" ? "bg-warn/10 text-warn" : "bg-white/5 text-muted"
                    }`}
                  >
                    {r.severity}
                  </span>
                </div>
                <p className="text-sm text-ink leading-relaxed">{r.description}</p>
                {r.mitigation && (
                  <p className="mt-2 text-xs text-muted leading-relaxed">
                    <span className="font-medium text-ink/80">Mitigation:</span> {r.mitigation}
                  </p>
                )}
              </motion.li>
            ))}
          </motion.ul>
        )}
      </motion.section>

      <motion.section className="py-5" variants={motionVariants.fadeUp}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-accent" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Product Requirements Document</h3>
          </div>
          {prd && (
            <motion.button
              onClick={handleExportMarkdown}
              {...presets.button}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded px-2 py-1"
            >
              <Download size={12} aria-hidden="true" />
              Export Markdown
            </motion.button>
          )}
        </div>
        {!prd ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Not generated yet.</motion.p>
        ) : (
          <motion.div className="space-y-5" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Executive summary</p>
              <p className="text-sm text-ink leading-relaxed">{prd.executive_summary}</p>
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Problem statement</p>
              <p className="text-sm text-ink leading-relaxed">{prd.problem_statement}</p>
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Solution</p>
              <p className="text-sm text-ink leading-relaxed">{prd.solution}</p>
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">API overview</p>
              <p className="text-sm text-ink leading-relaxed">{prd.api_overview}</p>
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Database overview</p>
              <p className="text-sm text-ink leading-relaxed">{prd.database_overview}</p>
            </motion.div>
          </motion.div>
        )}
      </motion.section>
    </motion.div>
  );
}
