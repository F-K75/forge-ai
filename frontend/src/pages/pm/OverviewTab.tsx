import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  Pencil,
  Check,
  X,
  Download,
  FileText,
  Target,
  Layers,
  GitBranch,
  Shield,
  CalendarDays,
  MessageSquare,
  ThumbsUp,
} from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { initiativesApi } from "../../lib/pmApi";
import { motion, motionVariants } from "../../lib/animations";

function EditableList({
  label,
  items,
  onSave,
  icon: Icon,
}: {
  label: string;
  items: string[];
  onSave: (items: string[]) => Promise<void>;
  icon?: typeof FileText;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(items.join("\n"));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft.split("\n").map((s) => s.trim()).filter(Boolean));
      setEditing(false);
    } catch {
      toast.error("Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.section variants={motionVariants.fadeUp}>
      <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-5 shadow-xs flex flex-col h-full hover:border-neutral-300 dark:hover:border-neutral-700 transition">
        <div className="mb-3.5 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800/80 pb-3">
          <div className="flex items-center gap-2">
            {Icon && (
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
              </span>
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
              {label}
            </span>
          </div>
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setDraft(items.join("\n"));
                setEditing(true);
              }}
              className="h-7 w-7 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 flex items-center justify-center transition cursor-pointer"
              aria-label={`Edit ${label}`}
            >
              <Pencil size={12} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="h-7 px-3 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[11px] font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                aria-label="Save"
              >
                <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                <span>SAVE</span>
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-7 px-3 rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                aria-label="Cancel"
              >
                <X size={12} strokeWidth={2.5} aria-hidden="true" />
                <span>CANCEL</span>
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(4, items.length + 1)}
            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#0E1017] p-3 text-xs font-medium text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400"
            placeholder="One item per line"
          />
        ) : items.length === 0 ? (
          <motion.p
            className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase py-2"
            variants={motionVariants.fadeIn}
          >
            Not specified yet.
          </motion.p>
        ) : (
          <motion.ul
            className="space-y-2"
            variants={motionVariants.staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {items.map((item, i) => (
              <motion.li
                key={i}
                className="flex items-start gap-2.5 text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed"
                variants={motionVariants.staggerItem}
                custom={i}
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400"
                  aria-hidden="true"
                />
                <span className="font-medium">{item}</span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </div>
    </motion.section>
  );
}

function EditableText({
  label,
  value,
  onSave,
  icon: Icon,
}: {
  label: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  icon?: typeof FileText;
}) {
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
      <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-5 shadow-xs flex flex-col h-full hover:border-neutral-300 dark:hover:border-neutral-700 transition">
        <div className="mb-3.5 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800/80 pb-3">
          <div className="flex items-center gap-2">
            {Icon && (
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
              </span>
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200">
              {label}
            </span>
          </div>
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setDraft(value);
                setEditing(true);
              }}
              className="h-7 w-7 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 flex items-center justify-center transition cursor-pointer"
              aria-label={`Edit ${label}`}
            >
              <Pencil size={12} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="h-7 px-3 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-[11px] font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                aria-label="Save"
              >
                <Check size={12} strokeWidth={2.5} aria-hidden="true" />
                <span>SAVE</span>
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-7 px-3 rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                aria-label="Cancel"
              >
                <X size={12} strokeWidth={2.5} aria-hidden="true" />
                <span>CANCEL</span>
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#0E1017] p-3 text-xs font-medium text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400"
          />
        ) : (
          <motion.p
            className="whitespace-pre-wrap text-xs leading-relaxed text-neutral-700 dark:text-neutral-300 font-medium"
            variants={motionVariants.fadeIn}
          >
            {value || "Not specified yet."}
          </motion.p>
        )}
      </div>
    </motion.section>
  );
}

export default function OverviewTab() {
  const { initiative, prd, hydrate } = usePMStore();
  const [comments, setComments] = useState<
    Array<{ id: string; comment: string; section: string; user_id: string }>
  >([]);
  const [approvals, setApprovals] = useState<
    Array<{ id: string; approved: boolean; comment: string; user_id: string }>
  >([]);
  const [initiativeComments, setInitiativeComments] = useState<
    Array<{ id: string; comment: string; section: string; user_id: string }>
  >([]);
  const [initiativeApprovals, setInitiativeApprovals] = useState<
    Array<{ id: string; approved: boolean; comment: string; user_id: string }>
  >([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [initiativeCommentDraft, setInitiativeCommentDraft] = useState("");
  const [initiativeApproveComment, setInitiativeApproveComment] = useState("");

  useEffect(() => {
    if (!initiative) return;
    loadComments();
    loadApprovals();
    loadInitiativeComments();
    loadInitiativeApprovals();
  }, [initiative]);

  if (!initiative) return null;

  const saveField = async (field: string, value: unknown) => {
    await initiativesApi.update(initiative.id, { [field]: value });
    await hydrate(initiative.id);
  };

  const loadComments = async () => {
    try {
      const data = await initiativesApi.comments.list(initiative.id);
      setComments(data);
    } catch {
      // ignore
    }
  };

  const loadApprovals = async () => {
    try {
      const data = await initiativesApi.approvals.list(initiative.id);
      setApprovals(data);
    } catch {
      // ignore
    }
  };

  const loadInitiativeComments = async () => {
    try {
      const data = await initiativesApi.initiativeComments.list(initiative.id);
      setInitiativeComments(data);
    } catch {
      // ignore
    }
  };

  const loadInitiativeApprovals = async () => {
    try {
      const data = await initiativesApi.initiativeApprovals.list(initiative.id);
      setInitiativeApprovals(data);
    } catch {
      // ignore
    }
  };

  const handleAddComment = async () => {
    if (!commentDraft.trim()) return;
    try {
      await initiativesApi.comments.create(initiative.id, { comment: commentDraft.trim() });
      setCommentDraft("");
      loadComments();
    } catch {
      toast.error("Couldn't add that comment.");
    }
  };

  const handleApprove = async (approved: boolean) => {
    try {
      await initiativesApi.approvals.create(initiative.id, { approved, comment: approveComment });
      setApproveComment("");
      loadApprovals();
    } catch {
      toast.error("Couldn't record that approval.");
    }
  };

  const handleAddInitiativeComment = async () => {
    if (!initiativeCommentDraft.trim()) return;
    try {
      await initiativesApi.initiativeComments.create(initiative.id, {
        comment: initiativeCommentDraft.trim(),
      });
      setInitiativeCommentDraft("");
      loadInitiativeComments();
    } catch {
      toast.error("Couldn't add that comment.");
    }
  };

  const handleInitiativeApprove = async (approved: boolean) => {
    try {
      await initiativesApi.initiativeApprovals.create(initiative.id, {
        approved,
        comment: initiativeApproveComment,
      });
      setInitiativeApproveComment("");
      loadInitiativeApprovals();
    } catch {
      toast.error("Couldn't record that approval.");
    }
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
      toast.error("The PRD hasn't been generated yet.");
    }
  };

  return (
    <motion.div
      className="max-w-7xl mx-auto px-4 md:px-8 py-8 font-sans space-y-10"
      variants={motionVariants.staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* Section 1: Strategy & Vision */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider border border-blue-200 dark:border-blue-800">
            <Target size={13} strokeWidth={2.4} aria-hidden="true" />
            <span>Strategy & Vision</span>
          </span>
          <span className="text-xs text-neutral-400 font-medium hidden sm:inline">
            Core Architectural Intent
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <motion.div variants={motionVariants.staggerItem}>
            <EditableText
              label="Vision Statement"
              value={initiative.vision ?? ""}
              onSave={(v) => saveField("vision", v)}
              icon={Target}
            />
          </motion.div>
          <motion.div variants={motionVariants.staggerItem}>
            <EditableList
              label="Business Goals"
              items={initiative.business_goals ?? []}
              onSave={(v) => saveField("business_goals", v)}
              icon={Target}
            />
          </motion.div>
          <motion.div variants={motionVariants.staggerItem}>
            <EditableText
              label="Product Scope"
              value={initiative.product_scope ?? ""}
              onSave={(v) => saveField("product_scope", v)}
              icon={Layers}
            />
          </motion.div>
          <motion.div variants={motionVariants.staggerItem}>
            <EditableText
              label="Estimated Timeline"
              value={initiative.estimated_timeline ?? ""}
              onSave={(v) => saveField("estimated_timeline", v)}
              icon={CalendarDays}
            />
          </motion.div>
        </div>
      </section>

      {/* Section 2: Requirements & Specifications */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider border border-emerald-200 dark:border-emerald-800">
            <GitBranch size={13} strokeWidth={2.4} aria-hidden="true" />
            <span>System Requirements & Scope</span>
          </span>
          <span className="text-xs text-neutral-400 font-medium hidden sm:inline">
            INVEST-Compliant Specifications
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <motion.div variants={motionVariants.staggerItem}>
            <EditableList
              label="Functional Requirements"
              items={initiative.functional_requirements ?? []}
              onSave={(v) => saveField("functional_requirements", v)}
              icon={GitBranch}
            />
          </motion.div>
          <motion.div variants={motionVariants.staggerItem}>
            <EditableList
              label="Non-Functional Requirements"
              items={initiative.non_functional_requirements ?? []}
              onSave={(v) => saveField("non_functional_requirements", v)}
              icon={Shield}
            />
          </motion.div>
          <motion.div variants={motionVariants.staggerItem}>
            <EditableList
              label="Success Metrics & OKRs"
              items={initiative.success_metrics ?? []}
              onSave={(v) => saveField("success_metrics", v)}
              icon={Target}
            />
          </motion.div>
          <motion.div variants={motionVariants.staggerItem}>
            <EditableList
              label="Tech Stack & Infrastructure"
              items={initiative.tech_stack ?? []}
              onSave={(v) => saveField("tech_stack", v)}
              icon={GitBranch}
            />
          </motion.div>
        </div>
      </section>

      {/* Section 3: Risks & Mitigations */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-200 dark:border-amber-800">
            <Shield size={13} strokeWidth={2.4} aria-hidden="true" />
            <span>Risks & Mitigations</span>
          </span>
          <span className="text-xs text-neutral-400 font-medium hidden sm:inline">
            Proactive Failure Prevention
          </span>
        </div>

        <motion.section variants={motionVariants.fadeUp}>
          <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-6 shadow-xs">
            {(initiative.risks ?? []).length === 0 ? (
              <motion.p
                className="text-xs font-medium text-neutral-400 uppercase py-2"
                variants={motionVariants.fadeIn}
              >
                No systemic risks identified.
              </motion.p>
            ) : (
              <motion.ul
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                variants={motionVariants.staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {(
                  initiative.risks as {
                    description: string;
                    severity: string;
                    mitigation?: string;
                  }[]
                ).map((r, i) => (
                  <motion.li
                    key={i}
                    className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-50/70 dark:bg-[#0E1017] p-4 flex flex-col justify-between"
                    variants={motionVariants.staggerItem}
                    custom={i}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                            r.severity === "high"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300"
                              : r.severity === "medium"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300"
                              : "bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300"
                          }`}
                        >
                          {r.severity} Priority
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 leading-relaxed">
                        {r.description}
                      </p>
                    </div>
                    {r.mitigation && (
                      <div className="mt-3 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed border-t border-neutral-200/60 dark:border-neutral-700/60 pt-2.5">
                        <span className="font-bold text-neutral-800 dark:text-neutral-200 uppercase text-[10px]">
                          Mitigation:
                        </span>{" "}
                        {r.mitigation}
                      </div>
                    )}
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </div>
        </motion.section>
      </section>

      {/* Section 4: PRD */}
      <section className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 text-xs font-bold uppercase tracking-wider border border-purple-200 dark:border-purple-800">
              <FileText size={13} strokeWidth={2.4} aria-hidden="true" />
              <span>Product Requirements Document</span>
            </span>
            <span className="text-xs text-neutral-400 font-medium hidden sm:inline">
              Full Architecture Spec
            </span>
          </div>
          {prd && (
            <button
              type="button"
              onClick={handleExportMarkdown}
              className="h-8 px-4 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
              aria-label="Export markdown"
            >
              <Download size={13} strokeWidth={2.2} aria-hidden="true" />
              <span>Export Markdown</span>
            </button>
          )}
        </div>

        <motion.section variants={motionVariants.fadeUp}>
          <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-6 shadow-xs">
            {!prd ? (
              <motion.p
                className="text-xs font-medium text-neutral-400 uppercase py-2"
                variants={motionVariants.fadeIn}
              >
                PRD not generated yet. Trigger agent to compile PRD.
              </motion.p>
            ) : (
              <div className="space-y-6">
                <motion.div
                  className="grid grid-cols-1 gap-4 md:grid-cols-2"
                  variants={motionVariants.staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  {[
                    { label: "Executive Summary", value: prd.executive_summary },
                    { label: "Problem Statement", value: prd.problem_statement },
                    { label: "Proposed Solution", value: prd.solution },
                    { label: "API Architecture Overview", value: prd.api_overview },
                    { label: "Database Schema & Overview", value: prd.database_overview, span: true },
                  ].map((field) => (
                    <div
                      key={field.label}
                      className={`rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-50/70 dark:bg-[#0E1017] p-4 ${
                        field.span ? "md:col-span-2" : ""
                      }`}
                    >
                      <h4 className="text-[11px] font-bold uppercase text-neutral-400 mb-1.5 tracking-wider">
                        {field.label}
                      </h4>
                      <p className="text-xs text-neutral-800 dark:text-neutral-200 leading-relaxed font-medium whitespace-pre-wrap">
                        {field.value || "Not specified."}
                      </p>
                    </div>
                  ))}
                </motion.div>

                {/* PRD Review & Comments */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-neutral-100 dark:border-neutral-800 pt-5">
                  {/* PRD Approvals */}
                  <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-50/70 dark:bg-[#0E1017] p-4">
                    <h4 className="text-xs font-bold uppercase text-neutral-500 mb-3 tracking-wide flex items-center gap-1.5">
                      <ThumbsUp size={12} strokeWidth={2.4} />
                      <span>PRD Spec Sign-Off</span>
                    </h4>
                    <div className="space-y-2 mb-3 max-h-36 overflow-y-auto">
                      {approvals.length === 0 ? (
                        <p className="text-xs text-neutral-400 font-medium">
                          No spec approvals recorded.
                        </p>
                      ) : (
                        approvals.map((a) => (
                          <div
                            key={a.id}
                            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#181B26] p-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`font-bold uppercase text-[10px] ${
                                  a.approved ? "text-emerald-600" : "text-rose-600"
                                }`}
                              >
                                {a.approved ? "Approved" : "Rejected"}
                              </span>
                              <span className="text-[10px] text-neutral-400 font-medium">
                                By {a.user_id}
                              </span>
                            </div>
                            {a.comment && (
                              <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300">
                                {a.comment}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        value={approveComment}
                        onChange={(e) => setApproveComment(e.target.value)}
                        placeholder="Spec note…"
                        className="h-8 min-w-0 flex-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#181B26] px-3 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleApprove(true)}
                        className="h-8 px-3.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(false)}
                        className="h-8 px-3 rounded-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>

                  {/* PRD Comments */}
                  <div className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-50/70 dark:bg-[#0E1017] p-4">
                    <h4 className="text-xs font-bold uppercase text-neutral-500 mb-3 tracking-wide flex items-center gap-1.5">
                      <MessageSquare size={12} strokeWidth={2.4} />
                      <span>PRD Spec Notes</span>
                    </h4>
                    <div className="space-y-2 mb-3 max-h-36 overflow-y-auto">
                      {comments.length === 0 ? (
                        <p className="text-xs text-neutral-400 font-medium">
                          No spec comments logged.
                        </p>
                      ) : (
                        comments.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#181B26] p-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between text-[10px] text-neutral-400 font-medium">
                              <span>{c.section ? `Sec: ${c.section}` : "Spec"}</span>
                              <span>By {c.user_id}</span>
                            </div>
                            <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300">
                              {c.comment}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder="Spec comment…"
                        className="h-8 min-w-0 flex-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-[#181B26] px-3 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddComment}
                        className="h-8 px-4 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold shadow-xs cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.section>
      </section>

      {/* Grid: Approvals & Feedback */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Initiative Approvals */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider border border-emerald-200 dark:border-emerald-800">
              <ThumbsUp size={13} strokeWidth={2.4} aria-hidden="true" />
              <span>Initiative Sign-Off</span>
            </span>
          </div>
          <motion.div variants={motionVariants.fadeUp}>
            <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-5 shadow-xs flex flex-col justify-between h-full min-h-[200px]">
              <div className="space-y-2.5 mb-4">
                {initiativeApprovals.length === 0 ? (
                  <p className="text-xs font-medium text-neutral-400 py-2">
                    No sign-offs recorded yet.
                  </p>
                ) : (
                  initiativeApprovals.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-50/70 dark:bg-[#0E1017] p-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            a.approved
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300"
                          }`}
                        >
                          {a.approved ? "Approved" : "Rejected"}
                        </span>
                        <span className="text-[10px] text-neutral-400 font-medium">
                          By {a.user_id}
                        </span>
                      </div>
                      {a.comment && (
                        <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium mt-1">
                          {a.comment}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <input
                  type="text"
                  value={initiativeApproveComment}
                  onChange={(e) => setInitiativeApproveComment(e.target.value)}
                  placeholder="Approval note (optional)…"
                  className="h-8 min-w-0 flex-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#0E1017] px-3 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleInitiativeApprove(true)}
                  className="h-8 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleInitiativeApprove(false)}
                  className="h-8 px-3 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold cursor-pointer"
                >
                  Reject
                </button>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Initiative Comments */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider border border-blue-200 dark:border-blue-800">
              <MessageSquare size={13} strokeWidth={2.4} aria-hidden="true" />
              <span>Team Discussion</span>
            </span>
          </div>
          <motion.div variants={motionVariants.fadeUp}>
            <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-5 shadow-xs flex flex-col justify-between h-full min-h-[200px]">
              <div className="space-y-2.5 mb-4 max-h-48 overflow-y-auto">
                {initiativeComments.length === 0 ? (
                  <p className="text-xs font-medium text-neutral-400 py-2">
                    No comments logged.
                  </p>
                ) : (
                  initiativeComments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border border-neutral-200/80 dark:border-neutral-700/80 bg-neutral-50/70 dark:bg-[#0E1017] p-3"
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold text-neutral-400 mb-1">
                        <span>{c.section ? `Sec: ${c.section}` : "General"}</span>
                        <span>By {c.user_id}</span>
                      </div>
                      <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed font-medium">
                        {c.comment}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <input
                  type="text"
                  value={initiativeCommentDraft}
                  onChange={(e) => setInitiativeCommentDraft(e.target.value)}
                  placeholder="Add feedback or discussion note…"
                  className="h-8 min-w-0 flex-1 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-[#0E1017] px-3 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddInitiativeComment}
                  className="h-8 px-4 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold shadow-xs transition active:scale-95 cursor-pointer"
                >
                  Post
                </button>
              </div>
            </div>
          </motion.div>
        </section>
      </div>
    </motion.div>
  );
}
