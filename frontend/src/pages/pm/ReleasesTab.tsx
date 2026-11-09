import React, { useState, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import {
  Rocket,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  Sparkles,
  ShieldCheck,
  Check,
  ChevronRight,
  Copy,
  Download,
  Trash2,
  Edit3,
  ExternalLink,
  Layers,
  Tag,
  RefreshCw,
  X,
  FileText,
  CheckSquare,
  Square,
  SlidersHorizontal,
  ChevronDown,
  LayoutGrid,
  List,
  AlertCircle,
  ArrowUpRight,
  Loader2,
  Terminal,
  ShieldAlert,
  GitBranch,
} from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { releasesApi } from "../../lib/pmApi";
import { findInitiativeById } from "../../lib/pmData";
import { motion, motionVariants } from "../../lib/animations";

export interface PMReleaseItem {
  id: string;
  initiative_id: string;
  version: string;
  features: string[];
  risks?: string[];
  blocked_items?: string[];
  qa_status: "pending" | "in_progress" | "passed" | "at_risk" | "failed" | string;
  deployment_readiness: "not_ready" | "in_progress" | "blocked" | "ready" | string;
  estimated_release_date?: string | null;
  confidence_score: number;
  status: "planned" | "in_progress" | "released" | string;
  created_at?: string;
  updated_at?: string;
  target_sprint?: string;
  lead_approver?: string;
  notes?: string;
  gates?: {
    qa_suite_passed: boolean;
    zero_p0_blockers: boolean;
    invest_criteria_met: boolean;
    staging_build_verified: boolean;
    lead_signoff: boolean;
  };
}

const READINESS_META: Record<
  string,
  { label: string; badgeCls: string; dotCls: string }
> = {
  ready: {
    label: "Ready to Ship",
    badgeCls:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    dotCls: "bg-emerald-500",
  },
  in_progress: {
    label: "In Staging",
    badgeCls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
    dotCls: "bg-sky-500 animate-pulse",
  },
  blocked: {
    label: "Blocked",
    badgeCls:
      "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
    dotCls: "bg-rose-500",
  },
  not_ready: {
    label: "Pending Verification",
    badgeCls:
      "bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20",
    dotCls: "bg-neutral-400",
  },
};

const STATUS_META: Record<
  string,
  { label: string; badgeCls: string }
> = {
  released: {
    label: "Released",
    badgeCls:
      "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30",
  },
  in_progress: {
    label: "Active Release",
    badgeCls:
      "bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/30",
  },
  planned: {
    label: "Planned",
    badgeCls:
      "bg-neutral-200/70 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700",
  },
};

// Calculate next SemVer bump
function getNextSemver(
  currentVersions: string[],
  type: "patch" | "minor" | "major"
): string {
  if (!currentVersions.length) {
    return type === "major" ? "v2.0.0" : type === "minor" ? "v1.1.0" : "v1.0.1";
  }

  // Find the highest version
  const parsed = currentVersions
    .map((v) => {
      const clean = v.replace(/^v/, "").trim();
      const parts = clean.split(".").map((n) => parseInt(n, 10) || 0);
      return {
        raw: v,
        major: parts[0] ?? 1,
        minor: parts[1] ?? 0,
        patch: parts[2] ?? 0,
      };
    })
    .sort((a, b) =>
      b.major !== a.major
        ? b.major - a.major
        : b.minor !== a.minor
        ? b.minor - a.minor
        : b.patch - a.patch
    );

  const top = parsed[0] || { major: 1, minor: 0, patch: 0 };
  if (type === "major") return `v${top.major + 1}.0.0`;
  if (type === "minor") return `v${top.major}.${top.minor + 1}.0`;
  return `v${top.major}.${top.minor}.${top.patch + 1}`;
}

export default function ReleasesTab() {
  const { initiative, stories, tasks, sprints } = usePMStore();

  const [releases, setReleases] = useState<PMReleaseItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modal / Drawer states
  const [selectedRelease, setSelectedRelease] = useState<PMReleaseItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);

  // New release form state
  const [newVersion, setNewVersion] = useState("v1.1.0");
  const [newTargetDate, setNewTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });
  const [newStatus, setNewStatus] = useState<"planned" | "in_progress">("planned");
  const [newFeaturesText, setNewFeaturesText] = useState("");
  const [newLeadApprover, setNewLeadApprover] = useState("Principal Eng & Lead PM");
  const [autoIncludeStories, setAutoIncludeStories] = useState(true);

  // Load releases
  const load = () => {
    if (!initiative) return;
    setLoading(true);
    releasesApi
      .list(initiative.id)
      .then((res: any) => {
        if (Array.isArray(res) && res.length > 0) {
          setReleases(res);
        } else {
          fallbackLoad();
        }
      })
      .catch(() => {
        fallbackLoad();
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const fallbackLoad = () => {
    if (!initiative) return;
    const key = `forge_releases_${initiative.id}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReleases(parsed);
          return;
        }
      } catch (err) {
        console.debug("Failed to parse releases cache", err);
      }
    }

    const pkg = findInitiativeById(initiative.id);
    const initReleases = (pkg as any)?.releases || [];
    if (initReleases.length > 0) {
      setReleases(initReleases);
      localStorage.setItem(key, JSON.stringify(initReleases));
    } else {
      // Seed rich realistic default releases aligned with the initiative workstream
      const seedReleases: PMReleaseItem[] = [
        {
          id: `rel-${initiative.id}-100`,
          initiative_id: initiative.id,
          version: "v1.0.0",
          status: "released",
          deployment_readiness: "ready",
          qa_status: "passed",
          confidence_score: 98,
          estimated_release_date: new Date(Date.now() - 7 * 86400000).toISOString(),
          target_sprint: "Sprint 1",
          lead_approver: "Architecture Lead",
          features: [
            "Core architecture domain model & microservice topology",
            "Multi-tenant data partitioning & schema migrations",
            "Executive telemetry dashboards and real-time event bus",
          ],
          risks: [],
          blocked_items: [],
          notes: "Initial general availability release with verified zero-downtime cutover.",
          gates: {
            qa_suite_passed: true,
            zero_p0_blockers: true,
            invest_criteria_met: true,
            staging_build_verified: true,
            lead_signoff: true,
          },
        },
        {
          id: `rel-${initiative.id}-110`,
          initiative_id: initiative.id,
          version: "v1.1.0-rc1",
          status: "in_progress",
          deployment_readiness: "in_progress",
          qa_status: "in_progress",
          confidence_score: 88,
          estimated_release_date: new Date(Date.now() + 10 * 86400000).toISOString(),
          target_sprint: "Sprint 2",
          lead_approver: "Platform PM & QA Lead",
          features: [
            "Advanced velocity projection & probabilistic burndown modeling",
            "Dynamic dependency visualization mesh with critical path analysis",
            "Automated INVEST score evaluation for agile user stories",
          ],
          risks: ["Cross-region replica synchronization latency under synthetic load"],
          blocked_items: [],
          notes: "Release candidate staging validation underway.",
          gates: {
            qa_suite_passed: true,
            zero_p0_blockers: true,
            invest_criteria_met: true,
            staging_build_verified: false,
            lead_signoff: false,
          },
        },
        {
          id: `rel-${initiative.id}-120`,
          initiative_id: initiative.id,
          version: "v1.2.0",
          status: "planned",
          deployment_readiness: "not_ready",
          qa_status: "pending",
          confidence_score: 75,
          estimated_release_date: new Date(Date.now() + 28 * 86400000).toISOString(),
          target_sprint: "Sprint 3",
          lead_approver: "Product Operations",
          features: [
            "Synthetic voice briefing with automated standup audio playback",
            "Multi-persona AI Copilot context injection across initiative graph",
            "Third-party webhook orchestration for CI/CD notification bridges",
          ],
          risks: ["Third-party API rate limits during peak reporting hours"],
          blocked_items: ["Pending schema review for synthetic audio artifacts"],
          notes: "Roadmap milestone scheduled for end of month.",
          gates: {
            qa_suite_passed: false,
            zero_p0_blockers: false,
            invest_criteria_met: true,
            staging_build_verified: false,
            lead_signoff: false,
          },
        },
      ];
      setReleases(seedReleases);
      localStorage.setItem(key, JSON.stringify(seedReleases));
    }
  };

  useEffect(load, [initiative]);

  // Persist helper
  const persistReleases = (updated: PMReleaseItem[]) => {
    if (!initiative) return;
    setReleases(updated);
    const key = `forge_releases_${initiative.id}`;
    localStorage.setItem(key, JSON.stringify(updated));
  };

  // Auto-Generate release from live tasks/stories
  const handleAutoGenerate = async () => {
    if (!initiative) return;
    setGenerating(true);

    const versionNames = (releases || []).map((r) => r.version);
    const suggestedVersion = getNextSemver(versionNames, "minor");

    try {
      const generated = await releasesApi.generate(initiative.id, suggestedVersion);
      toast.success(`Release ${suggestedVersion} generated!`);
      load();
      if (generated) {
        setSelectedRelease(generated as PMReleaseItem);
      }
    } catch {
      // Deterministic generation from live PM state
      const totalTasks = tasks.length || 1;
      const doneTasks = tasks.filter((t) => t.status === "done").length;
      const blockedTasks = tasks.filter((t) => t.status === "blocked").map((t) => t.title);
      const completionPct = doneTasks / totalTasks;

      const completedStories = stories
        .filter((s) => s.status === "done")
        .map((s) => s.title);
      const shippableFeatures =
        completedStories.length > 0
          ? completedStories
          : stories.slice(0, 4).map((s) => s.title);

      const confidence = Math.max(
        60,
        Math.min(99, Math.round(completionPct * 100 - blockedTasks.length * 10))
      );

      const newRel: PMReleaseItem = {
        id: `rel-${Date.now().toString(36)}`,
        initiative_id: initiative.id,
        version: suggestedVersion,
        confidence_score: confidence,
        status: "planned",
        deployment_readiness: blockedTasks.length > 0 ? "blocked" : "in_progress",
        qa_status: blockedTasks.length > 0 ? "at_risk" : "passed",
        features:
          shippableFeatures.length > 0
            ? shippableFeatures
            : [
                "Sprint deliverables and completed user stories",
                "Automated testing suite & telemetry compliance",
              ],
        risks: blockedTasks.length > 0 ? ["Unresolved sprint blockers in workstream"] : [],
        blocked_items: blockedTasks,
        target_sprint: sprints[0]?.name || "Upcoming Sprint",
        lead_approver: "Product Delivery Lead",
        estimated_release_date: new Date(Date.now() + 14 * 86400000).toISOString(),
        notes: "Deterministically compiled from active initiative workstream.",
        gates: {
          qa_suite_passed: blockedTasks.length === 0,
          zero_p0_blockers: blockedTasks.length === 0,
          invest_criteria_met: true,
          staging_build_verified: false,
          lead_signoff: false,
        },
      };

      const updated = [newRel, ...(releases || [])];
      persistReleases(updated);
      setSelectedRelease(newRel);
      toast.success(`Generated release ${suggestedVersion}`);
    } finally {
      setGenerating(false);
    }
  };

  // Create custom release
  const handleCreateReleaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!initiative || !newVersion.trim()) {
      toast.error("Please provide a valid release version tag");
      return;
    }

    const customFeatures = newFeaturesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const autoFeatures = autoIncludeStories
      ? stories.slice(0, 3).map((s) => s.title)
      : [];

    const finalFeatures = Array.from(
      new Set([...customFeatures, ...autoFeatures])
    );

    const newRel: PMReleaseItem = {
      id: `rel-${Date.now().toString(36)}`,
      initiative_id: initiative.id,
      version: newVersion.trim(),
      status: newStatus,
      deployment_readiness: newStatus === "in_progress" ? "in_progress" : "not_ready",
      qa_status: "pending",
      confidence_score: Math.floor(Math.random() * 12) + 85,
      estimated_release_date: newTargetDate ? new Date(newTargetDate).toISOString() : null,
      target_sprint: sprints[0]?.name || "Sprint 1",
      lead_approver: newLeadApprover || "Engineering Lead",
      features:
        finalFeatures.length > 0
          ? finalFeatures
          : [
              `Target deliverables for ${newVersion.trim()}`,
              "Automated regression assertions and stability verifications",
            ],
      risks: [],
      blocked_items: [],
      notes: "Custom release plan created by product lead.",
      gates: {
        qa_suite_passed: false,
        zero_p0_blockers: true,
        invest_criteria_met: true,
        staging_build_verified: false,
        lead_signoff: false,
      },
    };

    const updated = [newRel, ...(releases || [])];
    persistReleases(updated);
    setShowCreateModal(false);
    setSelectedRelease(newRel);
    toast.success(`Created release ${newVersion.trim()}`);

    // Reset form
    setNewFeaturesText("");
  };

  // Update release patch
  const handleUpdateRelease = async (id: string, patch: Partial<PMReleaseItem>) => {
    if (!releases) return;
    const updated = releases.map((r) => (r.id === id ? { ...r, ...patch } : r));
    persistReleases(updated);

    if (selectedRelease && selectedRelease.id === id) {
      setSelectedRelease({ ...selectedRelease, ...patch });
    }

    try {
      await releasesApi.update(id, patch as any);
    } catch {
      // already locally persisted
    }
  };

  // Delete release
  const handleDeleteRelease = async (id: string) => {
    if (!releases) return;
    if (!window.confirm("Are you sure you want to delete this release plan?")) {
      return;
    }

    const updated = releases.filter((r) => r.id !== id);
    persistReleases(updated);
    if (selectedRelease?.id === id) {
      setSelectedRelease(null);
    }

    try {
      await releasesApi.delete(id);
      toast.success("Release deleted");
    } catch {
      toast.success("Release deleted from local workspace");
    }
  };

  // Re-run deterministic audit on a release
  const handleAuditRelease = (release: PMReleaseItem) => {
    const blockedCount = tasks.filter((t) => t.status === "blocked").length;
    const isPassingQA = blockedCount === 0;
    const newGates = {
      qa_suite_passed: isPassingQA,
      zero_p0_blockers: blockedCount === 0,
      invest_criteria_met: true,
      staging_build_verified: release.gates?.staging_build_verified || false,
      lead_signoff: release.gates?.lead_signoff || false,
    };

    const allPassed = Object.values(newGates).every(Boolean);
    const readiness = allPassed
      ? "ready"
      : blockedCount > 0
      ? "blocked"
      : "in_progress";

    const confidence = Math.min(
      99,
      Math.max(60, 95 - blockedCount * 12 + (allPassed ? 4 : 0))
    );

    handleUpdateRelease(release.id, {
      gates: newGates,
      deployment_readiness: readiness,
      qa_status: isPassingQA ? "passed" : "at_risk",
      confidence_score: confidence,
    });

    toast.success(`Audited ${release.version}: readiness updated to ${readiness}`);
  };

  // Filtered releases
  const filteredReleases = useMemo(() => {
    if (!releases) return [];
    return releases.filter((r) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        r.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.features?.some((f) => f.toLowerCase().includes(searchQuery.toLowerCase())) ||
        r.lead_approver?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "ready"
          ? r.deployment_readiness === "ready"
          : statusFilter === "blocked"
          ? r.deployment_readiness === "blocked" || (r.blocked_items?.length ?? 0) > 0
          : r.status === statusFilter);

      return matchesSearch && matchesStatus;
    });
  }, [releases, searchQuery, statusFilter]);

  // Telemetry aggregates
  const telemetry = useMemo(() => {
    if (!releases || releases.length === 0) {
      return {
        total: 0,
        released: 0,
        inProgress: 0,
        planned: 0,
        avgConfidence: 0,
        totalFeatures: 0,
        totalBlockers: 0,
      };
    }
    const released = releases.filter((r) => r.status === "released").length;
    const inProgress = releases.filter((r) => r.status === "in_progress").length;
    const planned = releases.filter((r) => r.status === "planned").length;
    const sumConfidence = releases.reduce((acc, r) => acc + (r.confidence_score || 0), 0);
    const avgConfidence = Math.round(sumConfidence / releases.length);
    const totalFeatures = releases.reduce(
      (acc, r) => acc + (r.features?.length || 0),
      0
    );
    const totalBlockers = releases.reduce(
      (acc, r) => acc + (r.blocked_items?.length || 0),
      0
    );

    return {
      total: releases.length,
      released,
      inProgress,
      planned,
      avgConfidence,
      totalFeatures,
      totalBlockers,
    };
  }, [releases]);

  // Active or next upcoming release for spotlight banner
  const activeRelease = useMemo(() => {
    if (!releases || releases.length === 0) return null;
    return (
      releases.find((r) => r.status === "in_progress") ||
      releases.find((r) => r.status === "planned") ||
      releases[0]
    );
  }, [releases]);

  // Open create modal with suggested semver
  const handleOpenCreateModal = (type: "patch" | "minor" | "major" = "minor") => {
    const existingVersions = (releases || []).map((r) => r.version);
    setNewVersion(getNextSemver(existingVersions, type));
    setShowCreateModal(true);
  };

  // Generate full consolidated changelog
  const consolidatedChangelog = useMemo(() => {
    if (!releases || releases.length === 0) return "";
    let md = `# ${initiative?.name || "Product"} — Changelog\n\nAll notable deliverables and release milestones for this workstream.\n\n`;

    releases.forEach((r) => {
      const dateStr = r.estimated_release_date
        ? new Date(r.estimated_release_date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "Unscheduled";
      const statusLabel = r.status.toUpperCase();

      md += `## [${r.version}] — ${dateStr} (${statusLabel})\n`;
      md += `**Readiness:** ${READINESS_META[r.deployment_readiness]?.label || r.deployment_readiness} · **Confidence:** ${r.confidence_score}% · **QA:** ${r.qa_status}\n\n`;

      if (r.features && r.features.length > 0) {
        md += `### 🚀 Shipped Deliverables & Features\n`;
        r.features.forEach((f) => {
          md += `- ${f}\n`;
        });
        md += `\n`;
      }

      if (r.blocked_items && r.blocked_items.length > 0) {
        md += `### ⚠️ Known Blockers & Remediation Items\n`;
        r.blocked_items.forEach((b) => {
          md += `- ${b}\n`;
        });
        md += `\n`;
      }

      if (r.notes) {
        md += `*Notes: ${r.notes}*\n\n`;
      }

      md += `---\n\n`;
    });

    return md;
  }, [releases, initiative]);

  return (
    <div
      id="releases-page-container"
      className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 font-sans space-y-6 text-neutral-900 dark:text-neutral-100 transition-colors"
    >
      {/* 1. EXECUTIVE HEADER & CONTROLS */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200/90 dark:border-neutral-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold shadow-xs">
              <Rocket size={18} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
                  Release Management & Orchestration
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
                  SemVer Cadence
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Deterministic deployment gate audits, shippable sprint deliverables, and synthetic changelogs.
              </p>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Export Changelog */}
          <button
            id="btn-export-changelog"
            type="button"
            onClick={() => setShowChangelogModal(true)}
            className="h-9 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-[0.98]"
            title="Preview and export full markdown changelog"
          >
            <FileText size={14} className="text-neutral-500" />
            <span>Changelog</span>
          </button>

          {/* Auto-generate from Workstream */}
          <button
            id="btn-auto-generate-release"
            type="button"
            onClick={handleAutoGenerate}
            disabled={generating}
            className="h-9 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-[0.98] disabled:opacity-50"
            title="Deterministically compile a new release plan from completed tasks and stories"
          >
            {generating ? (
              <Loader2 size={14} className="animate-spin text-amber-500" />
            ) : (
              <Sparkles size={14} className="text-amber-500" />
            )}
            <span>Auto-Compile</span>
          </button>

          {/* New Release Button */}
          <button
            id="btn-create-release"
            type="button"
            onClick={() => handleOpenCreateModal("minor")}
            className="h-9 px-4 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs hover:opacity-90 transition-all active:scale-[0.98]"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>New Release</span>
          </button>
        </div>
      </header>

      {/* 2. KEY RELEASE METRICS & TELEMETRY STRIP */}
      <section
        aria-label="Release Metrics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Active Pipeline
            </span>
            <Tag size={14} className="text-neutral-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {telemetry.total}
            </span>
            <span className="text-xs text-neutral-500">releases tracked</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-neutral-500">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {telemetry.released} Shipped
            </span>
            <span>·</span>
            <span className="text-sky-600 dark:text-sky-400 font-semibold">
              {telemetry.inProgress} Staging
            </span>
            <span>·</span>
            <span>{telemetry.planned} Planned</span>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Mean Confidence
            </span>
            <ShieldCheck size={14} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {telemetry.avgConfidence}%
            </span>
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Deterministic
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                telemetry.avgConfidence >= 80
                  ? "bg-emerald-500"
                  : telemetry.avgConfidence >= 60
                  ? "bg-amber-500"
                  : "bg-rose-500"
              }`}
              style={{ width: `${telemetry.avgConfidence}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Shippable Scope
            </span>
            <Layers size={14} className="text-sky-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
              {telemetry.totalFeatures}
            </span>
            <span className="text-xs text-neutral-500">features & fixes</span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500 truncate">
            Across {telemetry.total} SemVer milestones
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Release Blockers
            </span>
            <AlertCircle
              size={14}
              className={
                telemetry.totalBlockers > 0 ? "text-rose-500" : "text-neutral-400"
              }
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold tracking-tight ${
                telemetry.totalBlockers > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-neutral-900 dark:text-neutral-50"
              }`}
            >
              {telemetry.totalBlockers}
            </span>
            <span className="text-xs text-neutral-500">
              {telemetry.totalBlockers === 0 ? "All clear" : "Need clearance"}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">
            {telemetry.totalBlockers === 0
              ? "Zero deployment blockers detected"
              : "Action required before production ship"}
          </p>
        </div>
      </section>

      {/* 3. ACTIVE RELEASE SPOTLIGHT BANNER */}
      {activeRelease && (
        <section
          id="active-release-spotlight"
          aria-label="Active Release Spotlight"
          className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-gradient-to-r from-neutral-50/90 via-white to-neutral-50/90 dark:from-[#141722] dark:via-[#10121A] dark:to-[#141722] p-5 shadow-xs"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  Target In-Flight Milestone
                </span>
                <span className="text-xs text-neutral-500 font-mono">
                  {activeRelease.target_sprint || "Sprint 2"}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black tracking-tight font-mono text-neutral-900 dark:text-neutral-50">
                  {activeRelease.version}
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    READINESS_META[activeRelease.deployment_readiness]?.badgeCls ||
                    READINESS_META.not_ready.badgeCls
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      READINESS_META[activeRelease.deployment_readiness]?.dotCls ||
                      "bg-neutral-400"
                    }`}
                  />
                  {READINESS_META[activeRelease.deployment_readiness]?.label ||
                    activeRelease.deployment_readiness}
                </span>
              </div>

              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {activeRelease.notes ||
                  `Package encompassing ${activeRelease.features?.length || 0} user-facing features and structural deliverables.`}
              </p>

              {/* Target Date & Lead */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500 pt-1">
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} />
                  <span>
                    Target:{" "}
                    <strong className="text-neutral-700 dark:text-neutral-200">
                      {activeRelease.estimated_release_date
                        ? new Date(
                            activeRelease.estimated_release_date
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "TBD"}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={13} />
                  <span>
                    Approver:{" "}
                    <strong className="text-neutral-700 dark:text-neutral-200">
                      {activeRelease.lead_approver || "Engineering Lead"}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Quality Gates & Action Box */}
            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 pt-4 lg:pt-0 lg:pl-6">
              {/* Gate Checklist Indicators */}
              <div className="space-y-1.5 text-xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  Readiness Gate Matrix
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2
                      size={13}
                      className={
                        activeRelease.gates?.qa_suite_passed
                          ? "text-emerald-500"
                          : "text-neutral-300 dark:text-neutral-600"
                      }
                    />
                    <span>QA Suite</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2
                      size={13}
                      className={
                        (activeRelease.blocked_items?.length || 0) === 0
                          ? "text-emerald-500"
                          : "text-rose-500"
                      }
                    />
                    <span>Zero Blockers</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2
                      size={13}
                      className={
                        activeRelease.gates?.staging_build_verified
                          ? "text-emerald-500"
                          : "text-neutral-300 dark:text-neutral-600"
                      }
                    />
                    <span>Staging Build</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2
                      size={13}
                      className={
                        activeRelease.gates?.lead_signoff
                          ? "text-emerald-500"
                          : "text-neutral-300 dark:text-neutral-600"
                      }
                    />
                    <span>Lead Signoff</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleAuditRelease(activeRelease)}
                  className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Recalculate gate scores using latest task/story completion"
                >
                  <RefreshCw size={12} />
                  <span>Audit Gates</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRelease(activeRelease)}
                  className="h-8 px-3 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs hover:opacity-90"
                >
                  <span>Inspect Plan</span>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 4. SEARCH, FILTER & VIEW CONTROLS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Search bar & Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              id="release-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by version, deliverable, or approver..."
              className="w-full h-9 pl-9 pr-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#141722] text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-white/20 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800/80 p-0.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80">
            {[
              { id: "all", label: "All" },
              { id: "planned", label: "Planned" },
              { id: "in_progress", label: "Staging" },
              { id: "released", label: "Released" },
              { id: "ready", label: "Ready to Ship" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === f.id
                    ? "bg-white dark:bg-neutral-700 text-neutral-950 dark:text-white shadow-2xs font-bold"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 self-end sm:self-center">
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800/80 p-0.5 rounded-xl border border-neutral-200/80 dark:border-neutral-700/80">
            <button
              id="btn-view-grid"
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-neutral-700 text-neutral-950 dark:text-white shadow-2xs"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              id="btn-view-table"
              type="button"
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === "table"
                  ? "bg-white dark:bg-neutral-700 text-neutral-950 dark:text-white shadow-2xs"
                  : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
              title="Table view"
              aria-label="Table view"
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 5. MAIN CONTENT (RELEASES GRID / TABLE) */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3">
          <Loader2 size={28} className="animate-spin text-neutral-400" />
          <p className="text-xs text-neutral-500">Loading release milestones...</p>
        </div>
      ) : filteredReleases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 p-12 text-center space-y-4 bg-neutral-50/50 dark:bg-neutral-900/20">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
            <Rocket size={22} />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              No releases match criteria
            </h3>
            <p className="text-xs text-neutral-500">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your search query or status filter."
                : "No release plans currently created for this initiative."}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleAutoGenerate}
              className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 cursor-pointer shadow-2xs"
            >
              Auto-Compile from Sprints
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreateModal("minor")}
              className="h-8 px-3 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-xs font-bold cursor-pointer hover:opacity-90"
            >
              Create Release
            </button>
          </div>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredReleases.map((release) => (
            <article
              key={release.id}
              id={`release-card-${release.id}`}
              className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] p-5 shadow-xs flex flex-col justify-between hover:border-neutral-300 dark:hover:border-neutral-700 transition-all duration-200 group"
            >
              <div className="space-y-3">
                {/* Card Top: Version, Status & Confidence */}
                <div className="flex items-start justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold font-mono tracking-tight text-neutral-900 dark:text-neutral-50 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                        {release.version}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                          STATUS_META[release.status]?.badgeCls ||
                          STATUS_META.planned.badgeCls
                        }`}
                      >
                        {STATUS_META[release.status]?.label || release.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 font-medium mt-0.5">
                      {release.target_sprint || "Sprint Deliverable"}
                    </div>
                  </div>

                  {/* Confidence Pill */}
                  <div className="text-right">
                    <div className="text-xs font-bold font-mono text-neutral-800 dark:text-neutral-200">
                      {release.confidence_score}%
                    </div>
                    <div className="text-[9px] uppercase tracking-wider text-neutral-400 font-medium">
                      Confidence
                    </div>
                  </div>
                </div>

                {/* Readiness & QA Status */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                      READINESS_META[release.deployment_readiness]?.badgeCls ||
                      READINESS_META.not_ready.badgeCls
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        READINESS_META[release.deployment_readiness]?.dotCls ||
                        "bg-neutral-400"
                      }`}
                    />
                    {READINESS_META[release.deployment_readiness]?.label ||
                      release.deployment_readiness}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                      release.qa_status === "passed"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                        : release.qa_status === "at_risk"
                        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700"
                    }`}
                  >
                    QA: {release.qa_status.toUpperCase()}
                  </span>
                </div>

                {/* Features Preview List */}
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Included Deliverables ({release.features?.length || 0})
                  </div>
                  <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-300 line-clamp-3">
                    {release.features && release.features.length > 0 ? (
                      release.features.slice(0, 3).map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-amber-500 text-xs leading-tight">›</span>
                          <span className="truncate">{f}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-neutral-400 italic text-[11px]">
                        No deliverables attached
                      </li>
                    )}
                  </ul>
                  {release.features && release.features.length > 3 && (
                    <p className="text-[10px] text-neutral-400 font-medium">
                      +{release.features.length - 3} more deliverables
                    </p>
                  )}
                </div>

                {/* Blocked Items Warning (if any) */}
                {release.blocked_items && release.blocked_items.length > 0 && (
                  <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 p-2.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                      <AlertTriangle size={12} />
                      <span>{release.blocked_items.length} Blocked Item(s)</span>
                    </div>
                    <p className="text-[11px] text-rose-600 dark:text-rose-300/90 truncate">
                      {release.blocked_items[0]}
                    </p>
                  </div>
                )}
              </div>

              {/* Card Footer: Metadata & Actions */}
              <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                  <Calendar size={11} />
                  <span>
                    {release.estimated_release_date
                      ? new Date(release.estimated_release_date).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" }
                        )
                      : "No target date"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    id={`btn-inspect-release-${release.id}`}
                    type="button"
                    onClick={() => setSelectedRelease(release)}
                    className="h-7 px-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <span>Manage</span>
                    <ChevronRight size={11} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="rounded-2xl border border-neutral-200/90 dark:border-neutral-800 bg-white dark:bg-[#141722] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/60 text-neutral-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Version</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Readiness Gate</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">QA Status</th>
                  <th className="py-3 px-4">Target Date</th>
                  <th className="py-3 px-4">Deliverables</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                {filteredReleases.map((release) => (
                  <tr
                    key={release.id}
                    id={`release-row-${release.id}`}
                    className="hover:bg-neutral-50/70 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-neutral-900 dark:text-neutral-100">
                      {release.version}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                          STATUS_META[release.status]?.badgeCls ||
                          STATUS_META.planned.badgeCls
                        }`}
                      >
                        {STATUS_META[release.status]?.label || release.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                          READINESS_META[release.deployment_readiness]?.badgeCls ||
                          READINESS_META.not_ready.badgeCls
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            READINESS_META[release.deployment_readiness]?.dotCls ||
                            "bg-neutral-400"
                          }`}
                        />
                        {READINESS_META[release.deployment_readiness]?.label ||
                          release.deployment_readiness}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">
                          {release.confidence_score}%
                        </span>
                        <div className="w-12 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              release.confidence_score >= 80
                                ? "bg-emerald-500"
                                : release.confidence_score >= 60
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                            style={{ width: `${release.confidence_score}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[11px]">
                      <span
                        className={
                          release.qa_status === "passed"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : release.qa_status === "at_risk"
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-neutral-500"
                        }
                      >
                        {release.qa_status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-neutral-500 text-[11px]">
                      {release.estimated_release_date
                        ? new Date(release.estimated_release_date).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric", year: "numeric" }
                          )
                        : "—"}
                    </td>
                    <td className="py-3.5 px-4 text-neutral-600 dark:text-neutral-300">
                      {release.features?.length || 0} items
                      {release.blocked_items && release.blocked_items.length > 0 && (
                        <span className="ml-1 text-rose-500 font-bold">
                          ({release.blocked_items.length} blocked)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedRelease(release)}
                        className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-[11px] font-semibold cursor-pointer"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. CREATE RELEASE MODAL */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-release-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans"
        >
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowCreateModal(false)}
          />

          <div
            id="modal-create-release"
            className="relative w-full max-w-lg bg-white dark:bg-[#141722] text-neutral-900 dark:text-neutral-100 rounded-2xl shadow-2xl border border-neutral-200/90 dark:border-neutral-800 overflow-hidden z-10"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-neutral-200/90 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/80 dark:bg-neutral-900/60">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950">
                  <Rocket size={14} className="text-amber-400" />
                </div>
                <h3
                  id="create-release-title"
                  className="text-sm font-bold text-neutral-900 dark:text-neutral-100"
                >
                  Create New Release Plan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="h-7 w-7 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateReleaseSubmit} className="p-6 space-y-4 text-xs">
              {/* Version with SemVer quick presets */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="input-release-version"
                    className="font-bold text-neutral-700 dark:text-neutral-300"
                  >
                    Version Tag (SemVer)
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-neutral-400 mr-1">Bump:</span>
                    <button
                      id="btn-semver-patch"
                      type="button"
                      onClick={() =>
                        setNewVersion(
                          getNextSemver(
                            (releases || []).map((r) => r.version),
                            "patch"
                          )
                        )
                      }
                      className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-[10px] font-mono cursor-pointer"
                    >
                      Patch
                    </button>
                    <button
                      id="btn-semver-minor"
                      type="button"
                      onClick={() =>
                        setNewVersion(
                          getNextSemver(
                            (releases || []).map((r) => r.version),
                            "minor"
                          )
                        )
                      }
                      className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-[10px] font-mono cursor-pointer"
                    >
                      Minor
                    </button>
                    <button
                      id="btn-semver-major"
                      type="button"
                      onClick={() =>
                        setNewVersion(
                          getNextSemver(
                            (releases || []).map((r) => r.version),
                            "major"
                          )
                        )
                      }
                      className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 text-[10px] font-mono cursor-pointer"
                    >
                      Major
                    </button>
                  </div>
                </div>
                <input
                  id="input-release-version"
                  type="text"
                  required
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="e.g. v1.2.0"
                  className="w-full h-9 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-white/20"
                />
              </div>

              {/* Target Date & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="input-release-target-date"
                    className="font-bold text-neutral-700 dark:text-neutral-300"
                  >
                    Target Release Date
                  </label>
                  <input
                    id="input-release-target-date"
                    type="date"
                    value={newTargetDate}
                    onChange={(e) => setNewTargetDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-white/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="select-release-status"
                    className="font-bold text-neutral-700 dark:text-neutral-300"
                  >
                    Initial Status
                  </label>
                  <select
                    id="select-release-status"
                    value={newStatus}
                    onChange={(e) =>
                      setNewStatus(e.target.value as "planned" | "in_progress")
                    }
                    className="w-full h-9 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-white/20"
                  >
                    <option value="planned">Planned (Upcoming)</option>
                    <option value="in_progress">In Staging (Active)</option>
                  </select>
                </div>
              </div>

              {/* Lead Approver */}
              <div className="space-y-1.5">
                <label
                  htmlFor="input-release-approver"
                  className="font-bold text-neutral-700 dark:text-neutral-300"
                >
                  Lead Approver / Delivery Lead
                </label>
                <input
                  id="input-release-approver"
                  type="text"
                  value={newLeadApprover}
                  onChange={(e) => setNewLeadApprover(e.target.value)}
                  placeholder="e.g. Architecture Lead & PM"
                  className="w-full h-9 px-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-white/20"
                />
              </div>

              {/* Custom deliverables textarea */}
              <div className="space-y-1.5">
                <label
                  htmlFor="textarea-release-features"
                  className="font-bold text-neutral-700 dark:text-neutral-300"
                >
                  Deliverables & Features (One per line)
                </label>
                <textarea
                  id="textarea-release-features"
                  rows={3}
                  value={newFeaturesText}
                  onChange={(e) => setNewFeaturesText(e.target.value)}
                  placeholder="e.g. User authentication and OAuth SSO&#10;Multi-tenant database schema migrations&#10;Staging benchmark latency reduction"
                  className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 text-xs focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:focus:ring-white/20 font-sans"
                />
              </div>

              {/* Auto-include stories checkbox */}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={autoIncludeStories}
                  onChange={(e) => setAutoIncludeStories(e.target.checked)}
                  className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span className="text-neutral-600 dark:text-neutral-300">
                  Automatically pull shippable user stories from initiative backlog
                </span>
              </label>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-neutral-200/90 dark:border-neutral-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-create-release"
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-xs font-bold hover:opacity-90 cursor-pointer shadow-xs"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. RELEASE DETAILS & INSPECTION DRAWER */}
      {selectedRelease && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Release Details"
          className="fixed inset-0 z-50 flex justify-end font-sans"
        >
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedRelease(null)}
          />

          <div
            id="drawer-release-details"
            className="relative w-full max-w-2xl bg-white dark:bg-[#141722] text-neutral-900 dark:text-neutral-100 shadow-2xl border-l border-neutral-200/90 dark:border-neutral-800 flex flex-col h-full z-10 overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-neutral-200/90 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/80 dark:bg-neutral-900/60">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold">
                  <Rocket size={16} className="text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold font-mono tracking-tight text-neutral-900 dark:text-neutral-50">
                      {selectedRelease.version}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                        STATUS_META[selectedRelease.status]?.badgeCls ||
                        STATUS_META.planned.badgeCls
                      }`}
                    >
                      {STATUS_META[selectedRelease.status]?.label ||
                        selectedRelease.status}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500">
                    {selectedRelease.target_sprint || "Target Milestone"} · Approver:{" "}
                    {selectedRelease.lead_approver || "Lead"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id={`btn-delete-release-${selectedRelease.id}`}
                  type="button"
                  onClick={() => handleDeleteRelease(selectedRelease.id)}
                  className="h-8 w-8 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-800 flex items-center justify-center cursor-pointer transition-colors"
                  title="Delete release"
                >
                  <Trash2 size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRelease(null)}
                  className="h-8 w-8 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {/* Status Promotion Bar */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Release Lifecycle Progression
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAuditRelease(selectedRelease)}
                    className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <RefreshCw size={11} />
                    <span>Audit with Live Workstream</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateRelease(selectedRelease.id, {
                        status: "planned",
                        deployment_readiness: "not_ready",
                      })
                    }
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                      selectedRelease.status === "planned"
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-neutral-900 dark:border-white shadow-2xs font-bold"
                        : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    1. Planned
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateRelease(selectedRelease.id, {
                        status: "in_progress",
                        deployment_readiness: "in_progress",
                      })
                    }
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                      selectedRelease.status === "in_progress"
                        ? "bg-sky-600 text-white border-sky-600 shadow-2xs font-bold"
                        : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    2. In Staging
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateRelease(selectedRelease.id, {
                        status: "released",
                        deployment_readiness: "ready",
                        qa_status: "passed",
                      })
                    }
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                      selectedRelease.status === "released"
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs font-bold"
                        : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    3. Shipped / GA
                  </button>
                </div>
              </div>

              {/* Deployment Readiness Quality Gates Checklist */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-500" />
                    <span>Deployment Readiness Gates</span>
                  </h4>
                  <span className="text-[11px] font-mono text-neutral-500">
                    Confidence: {selectedRelease.confidence_score}%
                  </span>
                </div>

                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800/80 bg-white dark:bg-neutral-900/40">
                  {[
                    {
                      id: "qa_suite_passed",
                      label: "QA Test Suite Execution",
                      desc: "Automated regression tests and synthetic browser assertions pass with zero defects.",
                      checked: selectedRelease.gates?.qa_suite_passed ?? true,
                    },
                    {
                      id: "zero_p0_blockers",
                      label: "Zero P0 / Critical Blockers",
                      desc: "All priority blockers resolved and cleared by engineering delivery leads.",
                      checked:
                        (selectedRelease.blocked_items?.length || 0) === 0 &&
                        (selectedRelease.gates?.zero_p0_blockers ?? true),
                    },
                    {
                      id: "invest_criteria_met",
                      label: "INVEST User Story Criteria",
                      desc: "All attached stories have measurable acceptance criteria and story point estimates.",
                      checked: selectedRelease.gates?.invest_criteria_met ?? true,
                    },
                    {
                      id: "staging_build_verified",
                      label: "Staging Canary Verification",
                      desc: "Deployed to preview container and validated under synthetic traffic load.",
                      checked: selectedRelease.gates?.staging_build_verified ?? false,
                    },
                    {
                      id: "lead_signoff",
                      label: "Executive Sign-Off & Approvals",
                      desc: "Final approval granted by Product Lead and Architecture Approver.",
                      checked: selectedRelease.gates?.lead_signoff ?? false,
                    },
                  ].map((gate) => (
                    <div
                      key={gate.id}
                      className="p-3.5 flex items-start justify-between gap-3 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {gate.label}
                        </div>
                        <p className="text-[11px] text-neutral-500">{gate.desc}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const updatedGates = {
                            ...(selectedRelease.gates || {
                              qa_suite_passed: true,
                              zero_p0_blockers: true,
                              invest_criteria_met: true,
                              staging_build_verified: false,
                              lead_signoff: false,
                            }),
                            [gate.id]: !gate.checked,
                          };
                          handleUpdateRelease(selectedRelease.id, {
                            gates: updatedGates,
                          });
                        }}
                        className="mt-0.5 text-neutral-400 hover:text-neutral-800 dark:hover:text-white cursor-pointer"
                        title="Toggle verification status"
                      >
                        {gate.checked ? (
                          <CheckCircle2 size={18} className="text-emerald-500" />
                        ) : (
                          <Square size={18} />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Deliverables / Features List Management */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <Layers size={14} className="text-sky-500" />
                    <span>Included Deliverables ({selectedRelease.features?.length || 0})</span>
                  </h4>
                </div>

                <div className="space-y-1.5">
                  {selectedRelease.features && selectedRelease.features.length > 0 ? (
                    selectedRelease.features.map((feature, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/40 dark:bg-neutral-900/30 group"
                      >
                        <div className="flex items-center gap-2">
                          <Check size={13} className="text-emerald-500 shrink-0" />
                          <span className="text-xs text-neutral-800 dark:text-neutral-200 font-medium">
                            {feature}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const filtered = selectedRelease.features.filter(
                              (_, i) => i !== idx
                            );
                            handleUpdateRelease(selectedRelease.id, {
                              features: filtered,
                            });
                          }}
                          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-rose-500 transition-opacity cursor-pointer p-1"
                          title="Remove item"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-neutral-400 italic text-[11px] p-2">
                      No deliverables added to this release plan yet.
                    </p>
                  )}

                  {/* Inline Add Deliverable Form */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      id="input-add-feature"
                      type="text"
                      placeholder="Add another deliverable to this release..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.currentTarget.value.trim()) {
                          const val = e.currentTarget.value.trim();
                          const current = selectedRelease.features || [];
                          handleUpdateRelease(selectedRelease.id, {
                            features: [...current, val],
                          });
                          e.currentTarget.value = "";
                        }
                      }}
                      className="flex-1 h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const input = document.getElementById(
                          "input-add-feature"
                        ) as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const current = selectedRelease.features || [];
                          handleUpdateRelease(selectedRelease.id, {
                            features: [...current, input.value.trim()],
                          });
                          input.value = "";
                        }
                      }}
                      className="h-8 px-3 rounded-lg bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 font-semibold text-neutral-700 dark:text-neutral-200 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              {/* Blocked Items & Remediation */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-rose-500" />
                    <span>
                      Blocked Items & Risks ({selectedRelease.blocked_items?.length || 0})
                    </span>
                  </h4>
                </div>

                {selectedRelease.blocked_items &&
                selectedRelease.blocked_items.length > 0 ? (
                  <div className="space-y-1.5">
                    {selectedRelease.blocked_items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20"
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle size={13} className="text-rose-500 shrink-0" />
                          <span className="text-xs text-rose-800 dark:text-rose-200 font-medium">
                            {item}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = selectedRelease.blocked_items!.filter(
                              (_, i) => i !== idx
                            );
                            handleUpdateRelease(selectedRelease.id, {
                              blocked_items: updated,
                              deployment_readiness:
                                updated.length === 0 ? "ready" : "blocked",
                            });
                            toast.success("Resolved blocker");
                          }}
                          className="px-2 py-0.5 rounded bg-white dark:bg-neutral-800 text-[10px] font-bold text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 cursor-pointer"
                        >
                          Resolve
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl border border-neutral-200/80 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-900/20 text-neutral-500 text-[11px] flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span>No active blockers recorded for this milestone.</span>
                  </div>
                )}
              </div>

              {/* Release Notes / Markdown Preview & Copy */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                    <FileText size={14} className="text-neutral-400" />
                    <span>Formatted Release Notes</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const notes = `## [${selectedRelease.version}] - ${
                        selectedRelease.estimated_release_date
                          ? new Date(
                              selectedRelease.estimated_release_date
                            ).toLocaleDateString()
                          : "TBD"
                      }\n\n### Deliverables\n${selectedRelease.features
                        ?.map((f) => `- ${f}`)
                        .join("\n")}\n\n### Confidence\n${
                        selectedRelease.confidence_score
                      }%`;
                      navigator.clipboard.writeText(notes);
                      toast.success("Release notes copied to clipboard!");
                    }}
                    className="text-[11px] text-neutral-600 dark:text-neutral-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Copy size={11} />
                    <span>Copy Markdown</span>
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-neutral-900 text-neutral-200 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-40 border border-neutral-800">
                  <pre className="whitespace-pre-wrap">
                    {`## [${selectedRelease.version}] - ${
                      selectedRelease.estimated_release_date
                        ? new Date(
                            selectedRelease.estimated_release_date
                          ).toISOString().split("T")[0]
                        : "TBD"
                    }
Status: ${selectedRelease.status.toUpperCase()} | Confidence: ${selectedRelease.confidence_score}%

### Features & Scope
${selectedRelease.features?.map((f) => `- ${f}`).join("\n") || "- No items"}

${
  selectedRelease.blocked_items && selectedRelease.blocked_items.length > 0
    ? `### Known Blockers\n${selectedRelease.blocked_items.map((b) => `- ${b}`).join("\n")}\n`
    : ""
}`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-4 border-t border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/60 flex items-center justify-between">
              <div className="text-[11px] text-neutral-500">
                Initiative: {initiative?.name}
              </div>
              <button
                type="button"
                onClick={() => setSelectedRelease(null)}
                className="px-4 py-2 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold text-xs cursor-pointer hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. CONSOLIDATED CHANGELOG MODAL */}
      {showChangelogModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="changelog-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans"
        >
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setShowChangelogModal(false)}
          />

          <div
            id="modal-export-changelog"
            className="relative w-full max-w-2xl bg-white dark:bg-[#141722] text-neutral-900 dark:text-neutral-100 rounded-2xl shadow-2xl border border-neutral-200/90 dark:border-neutral-800 overflow-hidden z-10 flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200/90 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/80 dark:bg-neutral-900/60">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-950">
                  <FileText size={14} className="text-amber-400" />
                </div>
                <div>
                  <h3
                    id="changelog-modal-title"
                    className="text-sm font-bold text-neutral-900 dark:text-neutral-100"
                  >
                    Initiative Changelog & Release Notes
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Consolidated markdown formatted according to KeepAChangelog
                    specifications.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="h-7 w-7 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Markdown Display */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="p-4 rounded-xl bg-neutral-900 text-neutral-200 font-mono text-xs leading-relaxed overflow-x-auto border border-neutral-800 select-all">
                <pre className="whitespace-pre-wrap">{consolidatedChangelog}</pre>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-neutral-200/90 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/60 flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                {releases?.length || 0} release milestone(s) documented
              </span>
              <div className="flex items-center gap-2">
                <button
                  id="btn-copy-changelog"
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(consolidatedChangelog);
                    toast.success("Changelog copied to clipboard!");
                  }}
                  className="px-3.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 font-semibold text-xs flex items-center gap-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer shadow-2xs"
                >
                  <Copy size={13} />
                  <span>Copy Markdown</span>
                </button>

                <button
                  id="btn-download-changelog"
                  type="button"
                  onClick={() => {
                    const blob = new Blob([consolidatedChangelog], {
                      type: "text/markdown;charset=utf-8",
                    });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `CHANGELOG-${initiative?.name || "release"}.md`;
                    link.click();
                    URL.revokeObjectURL(url);
                    toast.success("Changelog downloaded!");
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold text-xs flex items-center gap-1.5 hover:opacity-90 cursor-pointer shadow-2xs"
                >
                  <Download size={13} />
                  <span>Download .md</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
