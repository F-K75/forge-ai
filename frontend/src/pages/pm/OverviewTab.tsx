import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Pencil, Check, X, Download, FileText, Target, Layers, GitBranch, Shield, CalendarDays, MessageSquare, ThumbsUp } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { initiativesApi } from "../../lib/pmApi";
import { motion, motionVariants } from "../../lib/animations";
import { Card, Button, Heading } from "../../components/ui";
import { radius, fontSize } from "../../lib/designTokens";

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
      toast.error("Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.section variants={motionVariants.fadeUp}>
      <Card variant="content" className="transition-colors hover:border-accent/30">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={14} className="text-accent" aria-hidden="true" />}
            <Heading level="label">{label}</Heading>
          </div>
          {!editing ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setDraft(items.join("\n")); setEditing(true); }}
              className="!px-1.5"
              aria-label={`Edit ${label}`}
            >
              <Pencil size={12} aria-hidden="true" />
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button variant="chip" size="sm" onClick={save} disabled={saving} className="text-ok" aria-label="Save">
                <Check size={14} aria-hidden="true" />
              </Button>
              <Button variant="chip" size="sm" onClick={() => setEditing(false)} aria-label="Cancel">
                <X size={14} aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={Math.max(3, items.length + 1)}
            className="w-full border border-border bg-panel px-4 py-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            style={{ borderRadius: radius.sm }}
            placeholder="One item per line"
          />
        ) : items.length === 0 ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Not set.</motion.p>
        ) : (
          <motion.ul className="space-y-2" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {items.map((item, i) => (
              <motion.li key={i} className="flex items-start gap-3 text-sm text-ink" variants={motionVariants.staggerItem} custom={i}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent/60" aria-hidden="true" />
                <span className="leading-relaxed">{item}</span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </Card>
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
      toast.error("Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.section variants={motionVariants.fadeUp}>
      <Card variant="content" className="transition-colors hover:border-accent/30">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Icon && <Icon size={14} className="text-accent" aria-hidden="true" />}
            <Heading level="label">{label}</Heading>
          </div>
          {!editing ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setDraft(value); setEditing(true); }}
              className="!px-1.5"
              aria-label={`Edit ${label}`}
            >
              <Pencil size={12} aria-hidden="true" />
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button variant="chip" size="sm" onClick={save} disabled={saving} className="text-ok" aria-label="Save">
                <Check size={14} aria-hidden="true" />
              </Button>
              <Button variant="chip" size="sm" onClick={() => setEditing(false)} aria-label="Cancel">
                <X size={14} aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={4}
            className="w-full border border-border bg-panel px-4 py-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            style={{ borderRadius: radius.sm }}
          />
        ) : (
          <motion.p className="whitespace-pre-wrap text-sm leading-relaxed text-ink" variants={motionVariants.fadeIn}>{value || "Not set."}</motion.p>
        )}
      </Card>
    </motion.section>
  );
}

export default function OverviewTab() {
  const { initiative, prd, hydrate } = usePMStore();
  const [comments, setComments] = useState<Array<{ id: string; comment: string; section: string; user_id: string }>>([])
  const [approvals, setApprovals] = useState<Array<{ id: string; approved: boolean; comment: string; user_id: string }>>([])
  const [initiativeComments, setInitiativeComments] = useState<Array<{ id: string; comment: string; section: string; user_id: string }>>([])
  const [initiativeApprovals, setInitiativeApprovals] = useState<Array<{ id: string; approved: boolean; comment: string; user_id: string }>>([])
  const [commentDraft, setCommentDraft] = useState("")
  const [approveComment, setApproveComment] = useState("")
  const [initiativeCommentDraft, setInitiativeCommentDraft] = useState("")
  const [initiativeApproveComment, setInitiativeApproveComment] = useState("")

  useEffect(() => {
    if (!initiative) return
    loadComments()
    loadApprovals()
    loadInitiativeComments()
    loadInitiativeApprovals()
  }, [initiative])

  if (!initiative) return null;

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

  const loadInitiativeComments = async () => {
    try {
      const data = await initiativesApi.initiativeComments.list(initiative.id)
      setInitiativeComments(data)
    } catch {
      // ignore
    }
  }

  const loadInitiativeApprovals = async () => {
    try {
      const data = await initiativesApi.initiativeApprovals.list(initiative.id)
      setInitiativeApprovals(data)
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
      toast.error("Couldn't add that comment.")
    }
  }

  const handleApprove = async (approved: boolean) => {
    try {
      await initiativesApi.approvals.create(initiative.id, { approved, comment: approveComment })
      setApproveComment("")
      loadApprovals()
    } catch {
      toast.error("Couldn't record that approval.")
    }
  }

  const handleAddInitiativeComment = async () => {
    if (!initiativeCommentDraft.trim()) return
    try {
      await initiativesApi.initiativeComments.create(initiative.id, { comment: initiativeCommentDraft.trim() })
      setInitiativeCommentDraft("")
      loadInitiativeComments()
    } catch {
      toast.error("Couldn't add that comment.")
    }
  }

  const handleInitiativeApprove = async (approved: boolean) => {
    try {
      await initiativesApi.initiativeApprovals.create(initiative.id, { approved, comment: initiativeApproveComment })
      setInitiativeApproveComment("")
      loadInitiativeApprovals()
    } catch {
      toast.error("Couldn't record that approval.")
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
      toast.error("The PRD hasn't been generated yet.");
    }
  };

  return (
    <motion.div className="mx-auto max-w-5xl px-4 py-6 md:px-8" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
      {/* Section: Strategy */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
          <Target size={12} aria-hidden="true" />
        </span>
        <Heading level="section">Strategy & Vision</Heading>
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
      <div className="mb-3 flex items-center gap-2 mt-8">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
          <GitBranch size={12} aria-hidden="true" />
        </span>
        <Heading level="section">Requirements</Heading>
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
      <div className="mb-3 flex items-center gap-2 mt-8">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-warn/10 text-warn">
          <Shield size={12} aria-hidden="true" />
        </span>
        <Heading level="section">Risks</Heading>
      </div>
      <motion.section className="mb-8" variants={motionVariants.fadeUp}>
        <Card variant="content">
          {(initiative.risks ?? []).length === 0 ? (
            <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>None identified.</motion.p>
          ) : (
            <motion.ul className="space-y-3" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
              {(initiative.risks as { description: string; severity: string; mitigation?: string }[]).map((r, i) => (
                <motion.li key={i} className="rounded-md border border-border bg-panel-alt p-4" variants={motionVariants.staggerItem} custom={i}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full uppercase ${
                        r.severity === "high" ? "bg-error/10 text-error" : r.severity === "medium" ? "bg-warn/10 text-warn" : "bg-panel-alt text-muted"
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
        </Card>
      </motion.section>

      {/* Section: PRD */}
      <div className="mb-3 flex items-center justify-between mt-8">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
            <FileText size={12} aria-hidden="true" />
          </span>
          <Heading level="section">Product Requirements Document</Heading>
        </div>
        {prd && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportMarkdown}
            className="text-muted hover:text-ink"
            aria-label="Export markdown"
          >
            <Download size={12} aria-hidden="true" />
            Export Markdown
          </Button>
        )}
      </div>
      <motion.section variants={motionVariants.fadeUp}>
        <Card variant="content">
          {!prd ? (
            <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>Not generated yet.</motion.p>
          ) : (
            <motion.div className="grid grid-cols-1 gap-3 md:grid-cols-2" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
              {[
                { label: "Executive summary", value: prd.executive_summary },
                { label: "Problem statement", value: prd.problem_statement },
                { label: "Solution", value: prd.solution },
                { label: "API overview", value: prd.api_overview },
                { label: "Database overview", value: prd.database_overview, span: true },
              ].map(field => (
                <Card key={field.label} variant="stat" className={field.span ? "md:col-span-2" : undefined}>
                  <Heading level="label">{field.label}</Heading>
                  <p className="text-sm text-ink leading-relaxed">{field.value}</p>
                </Card>
              ))}
            </motion.div>
          )}
        </Card>
      </motion.section>

      {/* Section: Initiative Comments */}
      <div className="mb-3 flex items-center justify-between mt-8">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
            <MessageSquare size={12} aria-hidden="true" />
          </span>
          <Heading level="section">Initiative Comments</Heading>
        </div>
      </div>
      <motion.section className="mb-8" variants={motionVariants.fadeUp}>
        <Card variant="content">
          <div className="space-y-2 mb-3">
            {initiativeComments.length === 0 && (
              <p className="text-xs text-faint">No comments yet.</p>
            )}
            {initiativeComments.map(c => (
              <div key={c.id} className="rounded-md border border-border bg-panel-alt p-3">
                <p className="text-xs font-medium text-ink">{c.section ? `Section: ${c.section}` : "General"}</p>
                <p className="text-sm text-ink leading-relaxed">{c.comment}</p>
                <p className="mt-1 text-faint" style={{ fontSize: fontSize.label }}>By {c.user_id}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={initiativeCommentDraft}
              onChange={e => setInitiativeCommentDraft(e.target.value)}
              placeholder="Add a comment..."
              className="min-w-0 flex-1 rounded-md border border-border bg-panel-alt px-3 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            <Button type="button" onClick={handleAddInitiativeComment} variant="primary" size="sm">Add</Button>
          </div>
        </Card>
      </motion.section>

      {/* Section: PRD Comments */}
      <div className="mb-3 flex items-center justify-between mt-8">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
            <MessageSquare size={12} aria-hidden="true" />
          </span>
          <Heading level="section">PRD Comments</Heading>
        </div>
      </div>
      <motion.section className="mb-8" variants={motionVariants.fadeUp}>
        <Card variant="content">
          <div className="space-y-2 mb-3">
            {comments.length === 0 && (
              <p className="text-xs text-faint">No comments yet.</p>
            )}
            {comments.map(c => (
              <div key={c.id} className="rounded-md border border-border bg-panel-alt p-3">
                <p className="text-xs font-medium text-ink">{c.section ? `Section: ${c.section}` : "General"}</p>
                <p className="text-sm text-ink leading-relaxed">{c.comment}</p>
                <p className="mt-1 text-faint" style={{ fontSize: fontSize.label }}>By {c.user_id}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={commentDraft}
              onChange={e => setCommentDraft(e.target.value)}
              placeholder="Add a comment..."
              className="min-w-0 flex-1 rounded-md border border-border bg-panel-alt px-3 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            <Button type="button" onClick={handleAddComment} variant="primary" size="sm">Add</Button>
          </div>
        </Card>
      </motion.section>

      {/* Section: Initiative Approvals */}
      <div className="mb-3 flex items-center justify-between mt-8">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
            <ThumbsUp size={12} aria-hidden="true" />
          </span>
          <Heading level="section">Initiative Approvals</Heading>
        </div>
      </div>
      <motion.section className="mb-8" variants={motionVariants.fadeUp}>
        <Card variant="content">
          <div className="space-y-2 mb-3">
            {initiativeApprovals.length === 0 && (
              <p className="text-xs text-faint">No approvals yet.</p>
            )}
            {initiativeApprovals.map(a => (
              <div key={a.id} className="rounded-md border border-border bg-panel-alt p-3">
                <p className="text-xs font-medium text-ink">{a.approved ? "Approved" : "Rejected"}</p>
                {a.comment && <p className="text-sm text-ink leading-relaxed">{a.comment}</p>}
                <p className="mt-1 text-faint" style={{ fontSize: fontSize.label }}>By {a.user_id}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={initiativeApproveComment}
              onChange={e => setInitiativeApproveComment(e.target.value)}
              placeholder="Approval comment (optional)"
              className="min-w-0 flex-1 rounded-md border border-border bg-panel-alt px-3 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            <Button type="button" onClick={() => handleInitiativeApprove(true)} variant="primary" size="sm" className="bg-ok">Approve</Button>
            <Button type="button" onClick={() => handleInitiativeApprove(false)} variant="secondary" size="sm">Reject</Button>
          </div>
        </Card>
      </motion.section>

      {/* Section: Approvals */}
      <div className="mb-3 flex items-center justify-between mt-8">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
            <ThumbsUp size={12} aria-hidden="true" />
          </span>
          <Heading level="section">Approvals</Heading>
        </div>
      </div>
      <motion.section variants={motionVariants.fadeUp}>
        <Card variant="content">
          <div className="space-y-2 mb-3">
            {approvals.length === 0 && (
              <p className="text-xs text-faint">No approvals yet.</p>
            )}
            {approvals.map(a => (
              <div key={a.id} className="rounded-md border border-border bg-panel-alt p-3">
                <p className="text-xs font-medium text-ink">{a.approved ? "Approved" : "Rejected"}</p>
                {a.comment && <p className="text-sm text-ink leading-relaxed">{a.comment}</p>}
                <p className="mt-1 text-faint" style={{ fontSize: fontSize.label }}>By {a.user_id}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={approveComment}
              onChange={e => setApproveComment(e.target.value)}
              placeholder="Approval comment (optional)"
              className="min-w-0 flex-1 rounded-md border border-border bg-panel-alt px-3 py-2 text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            <Button type="button" onClick={() => handleApprove(true)} variant="primary" size="sm" className="bg-ok">Approve</Button>
            <Button type="button" onClick={() => handleApprove(false)} variant="secondary" size="sm">Reject</Button>
          </div>
        </Card>
      </motion.section>
    </motion.div>
  );
}
