import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Pencil, Check, X, Download, FileText, Target, Layers, GitBranch, Shield, CalendarDays, MessageSquare, ThumbsUp } from "lucide-react";
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
    <motion.section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl transition-all duration-200 hover:border-white/10" variants={motionVariants.fadeUp}>
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
    <motion.section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl transition-all duration-200 hover:border-white/10" variants={motionVariants.fadeUp}>
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

  const [comments, setComments] = useState<Array<{ id: string; comment: string; section: string; user_id: string }>>([])
  const [approvals, setApprovals] = useState<Array<{ id: string; approved: boolean; comment: string; user_id: string }>>([])
  const [commentDraft, setCommentDraft] = useState("")
  const [approveComment, setApproveComment] = useState("")

  const saveField = async (field: string, value: unknown) => {
    await initiativesApi.update(initiative.id, { [field]: value });
    await hydrate(initiative.id);
  };

  const loadComments = async () => {
    try {
      const data = await initiativesApi.comments.list(initiative.id)
      setComments(data)
    } catch {
      // ignore
    }
  }

  const loadApprovals = async () => {
    try {
      const data = await initiativesApi.approvals.list(initiative.id)
      setApprovals(data)
    } catch {
      // ignore
    }
  }

  const handleAddComment = async () => {
    if (!commentDraft.trim()) return
    try {
      await initiativesApi.comments.create(initiative.id, { comment: commentDraft.trim() })
      setCommentDraft("")
      loadComments()
    } catch {
      toast.error("Failed to add comment")
    }
  }

  const handleApprove = async (approved: boolean) => {
    try {
      await initiativesApi.approvals.create(initiative.id, { approved, comment: approveComment })
      setApproveComment("")
      loadApprovals()
    } catch {
      toast.error("Failed to record approval")
    }
  }

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

  useEffect(() => {
    if (!initiative) return
    loadComments()
    loadApprovals()
  }, [initiative])

  return (
    <motion.div className="mx-auto max-w-5xl px-4 py-6 md:px-8" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
      {/* Section: Strategy */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Target size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Strategy & Vision</h2>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-2">
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
          <EditableText label="Estimated timeline" value={initiative.estimated_timeline ?? ""} onSave={v => saveField("estimated_timeline", v)} icon={CalendarDays} />
        </motion.div>
      </div>

      {/* Section: Requirements */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <GitBranch size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Requirements</h2>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-3 md:grid-cols-2">
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
      </div>

      {/* Section: Risks */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-warn/10 text-warn">
          <Shield size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Risks</h2>
      </div>
      <motion.section className="mb-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl" variants={motionVariants.fadeUp}>
        {(initiative.risks ?? []).length === 0 ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>None identified.</motion.p>
        ) : (
          <motion.ul className="space-y-3" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {(initiative.risks as { description: string; severity: string; mitigation?: string }[]).map((r, i) => (
              <motion.li key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/15" variants={motionVariants.staggerItem} custom={i}>
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

      {/* Section: PRD */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <FileText size={12} aria-hidden="true" />
          </span>
          <h2 className="font-display text-sm font-semibold text-ink">Product Requirements Document</h2>
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
      <motion.section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl" variants={motionVariants.fadeUp}>
        {!prd ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Not generated yet.</motion.p>
        ) : (
          <motion.div className="grid grid-cols-1 gap-3 md:grid-cols-2" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/15">
              <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Executive summary</p>
              <p className="text-sm text-ink leading-relaxed">{prd.executive_summary}</p>
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/15">
              <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Problem statement</p>
              <p className="text-sm text-ink leading-relaxed">{prd.problem_statement}</p>
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/15">
              <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Solution</p>
              <p className="text-sm text-ink leading-relaxed">{prd.solution}</p>
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/15">
              <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">API overview</p>
              <p className="text-sm text-ink leading-relaxed">{prd.api_overview}</p>
            </motion.div>
            <motion.div variants={motionVariants.staggerItem} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/15 md:col-span-2">
              <p className="text-xs font-semibold text-muted mb-1.5 uppercase tracking-wider">Database overview</p>
              <p className="text-sm text-ink leading-relaxed">{prd.database_overview}</p>
            </motion.div>
          </motion.div>
        )}
      </motion.section>

      {/* Section: PRD Comments */}
      <div className="mb-3 flex items-center justify-between mt-8">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <MessageSquare size={12} aria-hidden="true" />
          </span>
          <h2 className="font-display text-sm font-semibold text-ink">PRD Comments</h2>
        </div>
      </div>
      <motion.section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl mb-8" variants={motionVariants.fadeUp}>
        <div className="space-y-2 mb-3">
          {comments.length === 0 && (
            <p className="text-xs text-faint">No comments yet.</p>
          )}
          {comments.map(c => (
            <div key={c.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-xs font-medium text-ink">{c.section ? `Section: ${c.section}` : "General"}</p>
              <p className="text-sm text-ink leading-relaxed">{c.comment}</p>
              <p className="mt-1 text-[10px] text-faint">By {c.user_id}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={commentDraft}
            onChange={e => setCommentDraft(e.target.value)}
            placeholder="Add a comment..."
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <button
            type="button"
            onClick={handleAddComment}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Add
          </button>
        </div>
      </motion.section>

      {/* Section: Approvals */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <ThumbsUp size={12} aria-hidden="true" />
          </span>
          <h2 className="font-display text-sm font-semibold text-ink">Approvals</h2>
        </div>
      </div>
      <motion.section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl" variants={motionVariants.fadeUp}>
        <div className="space-y-2 mb-3">
          {approvals.length === 0 && (
            <p className="text-xs text-faint">No approvals yet.</p>
          )}
          {approvals.map(a => (
            <div key={a.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-xs font-medium text-ink">{a.approved ? "Approved" : "Rejected"}</p>
              {a.comment && <p className="text-sm text-ink leading-relaxed">{a.comment}</p>}
              <p className="mt-1 text-[10px] text-faint">By {a.user_id}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={approveComment}
            onChange={e => setApproveComment(e.target.value)}
            placeholder="Approval comment (optional)"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
          <button
            type="button"
            onClick={() => handleApprove(true)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-ok px-3 text-xs font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => handleApprove(false)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-ink hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            Reject
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}
