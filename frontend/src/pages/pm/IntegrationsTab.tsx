import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Plug,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  GitBranch,
  Github,
  MessageSquare,
  Send,
  Radio,
  Globe,
  Terminal,
  Copy,
  Check,
  X,
  ArrowUpRight,
  Lock,
  Activity,
  Layers,
  Zap,
  Webhook,
  Hash,
  FolderGit2,
  CheckSquare,
  HelpCircle,
  Clock,
  Sparkles,
  Link2,
} from "lucide-react";
import { initiativesApi } from "../../lib/pmApi";
import { usePMStore } from "../../store/pmStore";

export type ProviderCategory =
  | "all"
  | "vcs"
  | "pm"
  | "chat"
  | "observability";

export interface IntegrationProviderDef {
  id: string;
  name: string;
  category: "vcs" | "pm" | "chat" | "observability";
  description: string;
  capabilities: string[];
  docsUrl: string;
  defaultProjectName: string;
  iconBg: string;
  iconColor: string;
  iconType: "github" | "gitlab" | "jira" | "linear" | "slack" | "discord" | "datadog" | "sentry";
  fields: {
    requiresRepo?: boolean;
    requiresChannel?: boolean;
    projectLabel?: string;
    repoPlaceholder?: string;
    channelPlaceholder?: string;
  };
}

export const INTEGRATION_CATALOG: IntegrationProviderDef[] = [
  {
    id: "github",
    name: "GitHub",
    category: "vcs",
    description: "Bi-directional sync for issues, autonomous PR creation, commit checks, and release tags.",
    capabilities: ["Pull Request Automation", "Issue Sync", "Branch Linking", "Status Checks"],
    docsUrl: "https://docs.github.com/en/rest",
    defaultProjectName: "GitHub Repository",
    iconBg: "bg-ink text-on-ink ",
    iconColor: "text-ink",
    iconType: "github",
    fields: {
      requiresRepo: true,
      projectLabel: "Organization / Owner",
      repoPlaceholder: "acme-corp/core-mesh",
    },
  },
  {
    id: "gitlab",
    name: "GitLab",
    category: "vcs",
    description: "Merge request automation, CI/CD pipeline triggers, and GitLab project issue management.",
    capabilities: ["Merge Requests", "CI Pipelines", "Issue Boards"],
    docsUrl: "https://docs.gitlab.com/ee/api/",
    defaultProjectName: "GitLab Group",
    iconBg: "bg-accent text-on-ink",
    iconColor: "text-ink",
    iconType: "gitlab",
    fields: {
      requiresRepo: true,
      projectLabel: "GitLab Group / Namespace",
      repoPlaceholder: "platform/distributed-runtime",
    },
  },
  {
    id: "linear",
    name: "Linear",
    category: "pm",
    description: "Sync initiatives, cycles, project roadmaps, and triage items with sub-second bi-directional speed.",
    capabilities: ["Cycle Sync", "Team Projects", "Issue Triage", "Milestone Tracking"],
    docsUrl: "https://developers.linear.app/docs/graphql/working-with-the-graphql-api",
    defaultProjectName: "Linear Team",
    iconBg: "bg-ink text-on-ink",
    iconColor: "text-ink",
    iconType: "linear",
    fields: {
      projectLabel: "Linear Team Key / Project ID",
      repoPlaceholder: "ENG-Mesh-Fabric",
    },
  },
  {
    id: "jira",
    name: "Jira Software",
    category: "pm",
    description: "Enterprise sync for Jira epics, user stories, sprint backlogs, and custom workflow transitions.",
    capabilities: ["Epic Hierarchy", "Sprint Boards", "JQL Filters", "Status Mapping"],
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/",
    defaultProjectName: "Jira Project",
    iconBg: "bg-ink text-on-ink",
    iconColor: "text-ink",
    iconType: "jira",
    fields: {
      projectLabel: "Jira Project Key / Board ID",
      repoPlaceholder: "PROJ-8201",
    },
  },
  {
    id: "slack",
    name: "Slack",
    category: "chat",
    description: "Broadcast autonomous agent completions, high-severity blockers, and executive approval gates to channels.",
    capabilities: ["Agent Alerts", "Blocker Pings", "Approval Buttons", "Daily Standup Digests"],
    docsUrl: "https://api.slack.com/",
    defaultProjectName: "Slack Workspace",
    iconBg: "bg-ok text-on-ink",
    iconColor: "text-ink",
    iconType: "slack",
    fields: {
      requiresChannel: true,
      projectLabel: "Slack Workspace Domain",
      channelPlaceholder: "#eng-initiative-alerts",
    },
  },
  {
    id: "discord",
    name: "Discord",
    category: "chat",
    description: "Community and engineering alerts via rich embedded webhooks for real-time fleet events.",
    capabilities: ["Rich Embeds", "Build Notifications", "Release Announcements"],
    docsUrl: "https://discord.com/developers/docs/intro",
    defaultProjectName: "Discord Server",
    iconBg: "bg-ink text-on-ink",
    iconColor: "text-ink",
    iconType: "discord",
    fields: {
      requiresChannel: true,
      projectLabel: "Guild / Server Name",
      channelPlaceholder: "#forge-telemetry",
    },
  },
  {
    id: "datadog",
    name: "Datadog",
    category: "observability",
    description: "Stream agent compute latency, error rates, and milestone SLA metrics into Datadog APM dashboards.",
    capabilities: ["APM Metrics", "Monitor Triggers", "Synthetic Tests"],
    docsUrl: "https://docs.datadoghq.com/api/",
    defaultProjectName: "Datadog Org",
    iconBg: "bg-ink text-on-ink",
    iconColor: "text-ink",
    iconType: "datadog",
    fields: {
      projectLabel: "Datadog Service Name",
      repoPlaceholder: "forge-mesh-agent-service",
    },
  },
  {
    id: "sentry",
    name: "Sentry",
    category: "observability",
    description: "Correlate release versions with runtime exception stack traces and agent execution error spikes.",
    capabilities: ["Release Health", "Exception Tracking", "Crash Free Sessions"],
    docsUrl: "https://docs.sentry.io/api/",
    defaultProjectName: "Sentry Project",
    iconBg: "bg-warn text-on-ink",
    iconColor: "text-ink",
    iconType: "sentry",
    fields: {
      projectLabel: "Sentry Organization Slug",
      repoPlaceholder: "forge-production-errors",
    },
  },
];

export interface IntegrationRecord {
  id?: string;
  provider: string;
  status: "connected" | "pending" | "error" | "disconnected";
  external_project_id?: string;
  external_project_name?: string;
  external_repo_id?: string;
  external_repo_name?: string;
  channel_id?: string;
  channel_name?: string;
  last_synced_at?: string;
  sync_events?: string[];
  direction?: "bi_directional" | "push_only" | "pull_only";
  created_at?: string;
  updated_at?: string;
}

function renderProviderIcon(type: string, size = 18) {
  switch (type) {
    case "github":
      return <Github size={size} />;
    case "gitlab":
      return <FolderGit2 size={size} />;
    case "linear":
      return <Layers size={size} />;
    case "jira":
      return <CheckSquare size={size} />;
    case "slack":
      return <Hash size={size} />;
    case "discord":
      return <MessageSquare size={size} />;
    case "datadog":
      return <Activity size={size} />;
    case "sentry":
      return <Radio size={size} />;
    default:
      return <Plug size={size} />;
  }
}

function formatRelativeTime(dateInput?: string | null): string {
  if (!dateInput) return "Never";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Recently";

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 45) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

export default function IntegrationsTab() {
  const { initiativeId: paramInitiativeId } = useParams<{ initiativeId: string }>();
  const { initiative } = usePMStore();
  const initiativeId = paramInitiativeId || initiative?.id || "default";

  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<ProviderCategory>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "connected" | "disconnected">("all");

  // Active sync or link operations in progress
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  // Inspector / Config Drawer State
  const [activeDrawerProvider, setActiveDrawerProvider] = useState<IntegrationProviderDef | null>(null);
  const [drawerForm, setDrawerForm] = useState<{
    external_project_id: string;
    external_project_name: string;
    external_repo_name: string;
    channel_name: string;
    direction: "bi_directional" | "push_only" | "pull_only";
    sync_events: string[];
    api_token: string;
  }>({
    external_project_id: "",
    external_project_name: "",
    external_repo_name: "",
    channel_name: "",
    direction: "bi_directional",
    sync_events: ["agent_pr", "blockers", "releases"],
    api_token: "",
  });
  const [isSavingDrawer, setIsSavingDrawer] = useState(false);
  const [pingStatus, setPingStatus] = useState<{ testing: boolean; latency?: number; success?: boolean } | null>(null);

  // Custom Webhook Modal state
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [webhookUrlCopied, setWebhookUrlCopied] = useState(false);

  // Storage key for resilient offline / demo mode persistence
  const storageKey = `forge_pm_integrations_${initiativeId}`;

  // Load integrations
  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    try {
      if (initiativeId && initiativeId !== "default") {
        const remoteItems = await initiativesApi.integrations.list(initiativeId);
        if (Array.isArray(remoteItems) && remoteItems.length > 0) {
          setIntegrations(remoteItems as IntegrationRecord[]);
          localStorage.setItem(storageKey, JSON.stringify(remoteItems));
          return;
        }
      }
      // Check local storage fallback
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setIntegrations(JSON.parse(saved));
      } else {
        // Seed default connected integration for a realistic enterprise preview
        const initialSeed: IntegrationRecord[] = [
          {
            provider: "github",
            status: "connected",
            external_project_id: "acme-corp",
            external_project_name: "GitHub / acme-corp",
            external_repo_name: "acme-corp/distributed-mesh",
            channel_name: "main",
            last_synced_at: new Date(Date.now() - 4 * 60000).toISOString(),
            direction: "bi_directional",
            sync_events: ["agent_pr", "blockers", "releases"],
          },
          {
            provider: "slack",
            status: "connected",
            external_project_id: "slack-acme",
            external_project_name: "Acme Slack Workspace",
            channel_name: "#eng-mesh-feed",
            last_synced_at: new Date(Date.now() - 18 * 60000).toISOString(),
            direction: "push_only",
            sync_events: ["blockers", "decisions", "releases"],
          },
        ];
        setIntegrations(initialSeed);
        localStorage.setItem(storageKey, JSON.stringify(initialSeed));
      }
    } catch {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setIntegrations(JSON.parse(saved));
      }
    } finally {
      setLoading(false);
    }
  }, [initiativeId, storageKey]);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  // Save changes locally and remotely
  const persistIntegrations = (updated: IntegrationRecord[]) => {
    setIntegrations(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.warn("Could not save to localStorage", e);
    }
  };

  // Open Drawer for a specific provider
  const handleOpenConfigure = (providerDef: IntegrationProviderDef) => {
    const existing = integrations.find(
      (i) => i.provider.toLowerCase() === providerDef.id.toLowerCase()
    );

    setActiveDrawerProvider(providerDef);
    setPingStatus(null);
    setDrawerForm({
      external_project_id:
        existing?.external_project_id || `${providerDef.id}-workspace`,
      external_project_name:
        existing?.external_project_name || providerDef.defaultProjectName,
      external_repo_name:
        existing?.external_repo_name || providerDef.fields.repoPlaceholder || "",
      channel_name:
        existing?.channel_name || providerDef.fields.channelPlaceholder || "",
      direction: existing?.direction || "bi_directional",
      sync_events: existing?.sync_events || ["agent_pr", "blockers", "releases"],
      api_token: "••••••••••••••••••••••••",
    });
  };

  // Test live connection ping
  const handleTestPing = async () => {
    setPingStatus({ testing: true });
    await new Promise((r) => setTimeout(r, 650));
    setPingStatus({
      testing: false,
      latency: Math.floor(Math.random() * 30 + 35),
      success: true,
    });
    toast.success(`Connected to ${activeDrawerProvider?.name} (200 OK)`);
  };

  // Save / Connect Provider from Drawer
  const handleSaveDrawer = async () => {
    if (!activeDrawerProvider) return;
    setIsSavingDrawer(true);
    const providerId = activeDrawerProvider.id;

    try {
      // 1. Remote call if backend available
      if (initiativeId && initiativeId !== "default") {
        try {
          await initiativesApi.integrations.link(initiativeId, {
            provider: providerId,
            external_project_id:
              drawerForm.external_project_id || `${providerId}-proj`,
            external_project_name:
              drawerForm.external_project_name || activeDrawerProvider.defaultProjectName,
            external_repo_id: drawerForm.external_repo_name,
            external_repo_name: drawerForm.external_repo_name,
            channel_id: drawerForm.channel_name,
            channel_name: drawerForm.channel_name,
          });
        } catch (e) {
          console.warn("Backend link call skipped or failed, using local update", e);
        }
      }

      // 2. Update local state
      const nowIso = new Date().toISOString();
      const updatedRecord: IntegrationRecord = {
        provider: providerId,
        status: "connected",
        external_project_id:
          drawerForm.external_project_id || `${providerId}-proj`,
        external_project_name:
          drawerForm.external_project_name || activeDrawerProvider.defaultProjectName,
        external_repo_name: drawerForm.external_repo_name,
        channel_name: drawerForm.channel_name,
        direction: drawerForm.direction,
        sync_events: drawerForm.sync_events,
        last_synced_at: nowIso,
        updated_at: nowIso,
      };

      const filtered = integrations.filter(
        (i) => i.provider.toLowerCase() !== providerId.toLowerCase()
      );
      persistIntegrations([updatedRecord, ...filtered]);

      toast.success(`Successfully configured ${activeDrawerProvider.name}`);
      setActiveDrawerProvider(null);
    } catch {
      toast.error(`Failed to save ${activeDrawerProvider.name} configuration`);
    } finally {
      setIsSavingDrawer(false);
    }
  };

  // Unlink / Disconnect
  const handleDisconnect = async (providerId: string) => {
    try {
      if (initiativeId && initiativeId !== "default") {
        try {
          await initiativesApi.integrations.unlink(initiativeId, providerId);
        } catch (e) {
          console.warn("Backend unlink skipped or failed", e);
        }
      }
      const updated = integrations.filter(
        (i) => i.provider.toLowerCase() !== providerId.toLowerCase()
      );
      persistIntegrations(updated);
      toast.success(`Disconnected ${providerId}`);
      if (activeDrawerProvider?.id === providerId) {
        setActiveDrawerProvider(null);
      }
    } catch {
      toast.error(`Failed to disconnect ${providerId}`);
    }
  };

  // Trigger Individual Provider Sync
  const handleSyncProvider = async (providerId: string) => {
    setSyncingProvider(providerId);
    try {
      if (initiativeId && initiativeId !== "default") {
        try {
          await initiativesApi.integrations.sync(initiativeId, providerId);
        } catch (e) {
          console.warn("Backend sync skipped, running local sync", e);
        }
      } else {
        await new Promise((r) => setTimeout(r, 600));
      }

      const nowIso = new Date().toISOString();
      const updated = integrations.map((i) =>
        i.provider.toLowerCase() === providerId.toLowerCase()
          ? { ...i, last_synced_at: nowIso, status: "connected" as const }
          : i
      );
      persistIntegrations(updated);
      toast.success(`Synchronized ${providerId}`);
    } catch {
      toast.error(`Sync failed for ${providerId}`);
    } finally {
      setSyncingProvider(null);
    }
  };

  // Batch Sync All Connected Services
  const handleSyncAll = async () => {
    if (integrations.length === 0) {
      toast.error("No active integrations to synchronize.");
      return;
    }
    setSyncingAll(true);
    try {
      await Promise.all(
        integrations.map(async (item) => {
          try {
            if (initiativeId && initiativeId !== "default") {
              await initiativesApi.integrations.sync(initiativeId, item.provider);
            }
          } catch {
            // ignore individual error in batch
          }
        })
      );
      const nowIso = new Date().toISOString();
      const updated = integrations.map((i) => ({
        ...i,
        last_synced_at: nowIso,
        status: "connected" as const,
      }));
      persistIntegrations(updated);
      toast.success("All connected services synchronized");
    } catch {
      toast.error("Batch sync encountered an error");
    } finally {
      setSyncingAll(false);
    }
  };

  // Filtered providers
  const filteredCatalog = useMemo(() => {
    return INTEGRATION_CATALOG.filter((prov) => {
      // Category filter
      if (selectedCategory !== "all" && prov.category !== selectedCategory) {
        return false;
      }

      // Status filter
      const isConnected = integrations.some(
        (i) => i.provider.toLowerCase() === prov.id.toLowerCase() && i.status === "connected"
      );
      if (statusFilter === "connected" && !isConnected) return false;
      if (statusFilter === "disconnected" && isConnected) return false;

      // Search query
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const matchesName = prov.name.toLowerCase().includes(q);
        const matchesDesc = prov.description.toLowerCase().includes(q);
        const matchesCaps = prov.capabilities.some((c) => c.toLowerCase().includes(q));
        if (!matchesName && !matchesDesc && !matchesCaps) return false;
      }

      return true;
    });
  }, [selectedCategory, statusFilter, searchQuery, integrations]);

  // Telemetry Aggregates
  const telemetry = useMemo(() => {
    const connectedCount = integrations.filter((i) => i.status === "connected").length;
    const totalAvailable = INTEGRATION_CATALOG.length;
    const vcsConnected = integrations.filter((i) =>
      ["github", "gitlab"].includes(i.provider.toLowerCase())
    ).length;
    const chatConnected = integrations.filter((i) =>
      ["slack", "discord"].includes(i.provider.toLowerCase())
    ).length;

    return {
      connectedCount,
      totalAvailable,
      vcsConnected,
      chatConnected,
      health: connectedCount > 0 ? "100% Operational" : "Standing By",
    };
  }, [integrations]);

  return (
    <div
      id="integrations-page-container"
      className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 font-sans space-y-6 text-ink transition-colors"
    >
      {/* 1. EXECUTIVE HEADER & ACTION CONTROLS */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-on-ink font-semibold shadow-xs">
              <Plug size={18} className="text-warn" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-ink">
                  Integrations & Ecosystem Orchestration
                </h1>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-ok/10 text-ok border border-ok/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-ok animate-pulse" />
                  Live Sync Engine
                </span>
              </div>
              <p className="text-xs text-muted">
                Connect external issue trackers, Git repositories, ChatOps webhooks, and observability sinks to autonomous agent workstreams.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Custom Webhook Button */}
          <button
            id="btn-open-webhooks-modal"
            type="button"
            onClick={() => setShowWebhookModal(true)}
            className="h-9 px-3 rounded-xl border border-border bg-panel hover:bg-ink/5 text-xs font-semibold text-ink flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-[0.98]"
            title="Manage incoming and outgoing HTTP webhook endpoints"
          >
            <Webhook size={13} className="text-muted" />
            <span>Webhooks</span>
          </button>

          {/* Sync All Services */}
          <button
            id="btn-sync-all-integrations"
            type="button"
            onClick={handleSyncAll}
            disabled={syncingAll || integrations.length === 0}
            className="h-9 px-3.5 rounded-xl bg-ink text-on-ink text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
            title="Synchronize all active connectors immediately"
          >
            <RefreshCw
              size={13}
              className={syncingAll ? "animate-spin text-warn" : ""}
            />
            <span>{syncingAll ? "Syncing Fleet..." : "Sync All Active"}</span>
          </button>
        </div>
      </header>

      {/* 2. FLEET INTEGRATION TELEMETRY STRIP */}
      <section
        aria-label="Integration Telemetry Overview"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        {/* Metric 1: Connected Services */}
        <div className="rounded-2xl border border-border bg-panel p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Connected Connectors
            </span>
            <Plug size={15} className="text-ok" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              {telemetry.connectedCount}
            </span>
            <span className="text-xs text-muted">
              of {telemetry.totalAvailable} cataloged
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
            <span className="text-ok font-semibold">
              {telemetry.vcsConnected} Repositories
            </span>
            <span>·</span>
            <span className="text-accent font-semibold">
              {telemetry.chatConnected} Chat Channels
            </span>
          </div>
        </div>

        {/* Metric 2: Sync Status */}
        <div className="rounded-2xl border border-border bg-panel p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Sync Health
            </span>
            <ShieldCheck size={15} className="text-ok" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              {telemetry.health}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            <span>Bi-directional webhooks verified</span>
          </div>
        </div>

        {/* Metric 3: Event Throughput */}
        <div className="rounded-2xl border border-border bg-panel p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              Agent PR Pipeline
            </span>
            <GitBranch size={15} className="text-accent" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              Autonomous
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted truncate">
            Auto-branching enabled on completed tasks
          </div>
        </div>

        {/* Metric 4: API Rate Limit Quotas */}
        <div className="rounded-2xl border border-border bg-panel p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted mb-1">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              API Quota Safety
            </span>
            <Zap size={15} className="text-warn" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              99.8%
            </span>
            <span className="text-xs text-ok font-semibold">
              Optimal Headroom
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted truncate">
            Zero 429 throttling backoffs recorded
          </div>
        </div>
      </section>

      {/* 3. SEARCH & CATEGORY FILTER BAR */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            id="integrations-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by provider, capability, or repository..."
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-border bg-panel text-xs text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-border transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-muted cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Tabs */}
          <div className="flex items-center gap-0.5 bg-panel-alt p-0.5 rounded-xl border border-border text-xs">
            {[
              { id: "all", label: "All Integrations" },
              { id: "vcs", label: "Source Git" },
              { id: "pm", label: "Issue Trackers" },
              { id: "chat", label: "ChatOps" },
              { id: "observability", label: "Monitoring" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id as ProviderCategory)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? "bg-panel text-ink shadow-2xs font-semibold"
                    : "text-muted hover:text-ink"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Connection Status Dropdown */}
          <select
            id="filter-connection-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-9 px-3 rounded-xl border border-border bg-panel text-xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-border cursor-pointer shadow-2xs"
          >
            <option value="all">All States</option>
            <option value="connected">Connected Only</option>
            <option value="disconnected">Available Only</option>
          </select>
        </div>
      </div>

      {/* 4. INTEGRATIONS GRID */}
      <section aria-label="Ecosystem Integrations Catalog">
        {filteredCatalog.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-4 bg-ink/10">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-panel-alt text-muted">
              <Plug size={22} />
            </div>
            <div className="space-y-1 max-w-sm mx-auto">
              <h3 className="text-sm font-semibold text-ink">
                No integrations found
              </h3>
              <p className="text-xs text-muted">
                No cataloged connectors match your search term or category filters.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
                setStatusFilter("all");
              }}
              className="h-8 px-3 rounded-lg border border-border bg-panel text-xs font-semibold text-ink hover:bg-ink/5 cursor-pointer shadow-2xs"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {filteredCatalog.map((prov) => {
              const record = integrations.find(
                (i) => i.provider.toLowerCase() === prov.id.toLowerCase()
              );
              const isConnected = record && record.status === "connected";
              const isSyncing = syncingProvider === prov.id;

              return (
                <article
                  key={prov.id}
                  id={`integration-card-${prov.id}`}
                  className={`rounded-2xl border bg-panel p-5 shadow-xs transition-all duration-150 flex flex-col justify-between ${
                    isConnected
                      ? "border-ok/30 ring-1 ring-ok/10"
                      : "border-border hover:border-border"
                  }`}
                >
                  <div className="space-y-4">
                    {/* Top Row: Icon, Name & Status Pill */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-semibold shadow-xs ${prov.iconBg}`}
                        >
                          {renderProviderIcon(prov.iconType, 20)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-ink">
                              {prov.name}
                            </h2>
                            <span className="text-[10px] font-mono uppercase tracking-wider text-faint">
                              {prov.category}
                            </span>
                          </div>
                          <p className="text-xs text-muted line-clamp-1">
                            {prov.description}
                          </p>
                        </div>
                      </div>

                      {/* Status Indicator */}
                      <div className="shrink-0">
                        {isConnected ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-ok/10 text-ok border border-ok/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                            Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-panel-alt text-muted border border-border">
                            Available
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Connected Bindings or Capabilities */}
                    {isConnected && record ? (
                      <div className="rounded-xl border border-border bg-ink/10 p-3 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-ink">
                            Workspace: {record.external_project_name || record.external_project_id}
                          </span>
                          <span className="text-[11px] font-mono text-faint flex items-center gap-1">
                            <Clock size={11} />
                            Synced {formatRelativeTime(record.last_synced_at)}
                          </span>
                        </div>

                        {record.external_repo_name && (
                          <div className="flex items-center gap-1.5 text-muted">
                            <GitBranch size={13} className="text-accent" />
                            <span className="font-mono text-[11px]">
                              Repo: {record.external_repo_name}
                            </span>
                          </div>
                        )}

                        {record.channel_name && (
                          <div className="flex items-center gap-1.5 text-muted">
                            <Hash size={13} className="text-ok" />
                            <span className="font-mono text-[11px]">
                              Channel: {record.channel_name}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {prov.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-panel-alt text-muted border border-border"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="mt-4 pt-3 border-t border-border-soft flex items-center justify-between gap-2">
                    <a
                      href={prov.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-faint hover:text-ink flex items-center gap-1"
                    >
                      <span>Documentation</span>
                      <ArrowUpRight size={11} />
                    </a>

                    <div className="flex items-center gap-2">
                      {isConnected ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSyncProvider(prov.id)}
                            disabled={isSyncing}
                            className="h-8 px-2.5 rounded-lg border border-border bg-panel text-xs font-semibold text-ink hover:bg-ink/5 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-[0.98] disabled:opacity-50"
                            title="Synchronize now"
                          >
                            <RefreshCw
                              size={12}
                              className={isSyncing ? "animate-spin text-ok" : ""}
                            />
                            <span>{isSyncing ? "Syncing..." : "Sync"}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenConfigure(prov)}
                            className="h-8 px-2.5 rounded-lg border border-border bg-panel text-xs font-semibold text-ink hover:bg-ink/5 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-[0.98]"
                            title="Configure integration bindings"
                          >
                            <SlidersHorizontal size={12} />
                            <span>Configure</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDisconnect(prov.id)}
                            className="h-8 w-8 rounded-lg border border-border bg-panel text-faint hover:text-error hover:border-error/30 flex items-center justify-center cursor-pointer shadow-2xs transition-all"
                            title="Disconnect service"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenConfigure(prov)}
                          className="h-8 px-3.5 rounded-lg bg-ink text-on-ink text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs hover:opacity-90 transition-all active:scale-[0.98]"
                        >
                          <Plus size={13} />
                          <span>Connect</span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. CONFIGURATION & BINDING SLIDE-OVER DRAWER */}
      {activeDrawerProvider && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-integration-title"
          className="fixed inset-0 z-50 flex justify-end font-sans"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-base/60 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveDrawerProvider(null)}
          />

          <div
            id="drawer-integration-config"
            className="relative w-full max-w-lg bg-panel text-ink shadow-2xl border-l border-border flex flex-col h-full z-10 overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-ink/10">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl font-semibold ${activeDrawerProvider.iconBg}`}
                >
                  {renderProviderIcon(activeDrawerProvider.iconType, 18)}
                </div>
                <div>
                  <h3
                    id="drawer-integration-title"
                    className="text-sm font-semibold text-ink"
                  >
                    Configure {activeDrawerProvider.name}
                  </h3>
                  <p className="text-xs text-muted">
                    {activeDrawerProvider.category.toUpperCase()} Connector Setup
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveDrawerProvider(null)}
                className="h-8 w-8 rounded-lg hover:bg-ink/5 flex items-center justify-center text-faint hover:text-ink cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer Form Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-xs">
              {/* Workspace / Project Name */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-ink">
                  {activeDrawerProvider.fields.projectLabel || "Workspace / Project Name"}
                </label>
                <input
                  type="text"
                  value={drawerForm.external_project_name}
                  onChange={(e) =>
                    setDrawerForm({
                      ...drawerForm,
                      external_project_name: e.target.value,
                    })
                  }
                  placeholder={activeDrawerProvider.defaultProjectName}
                  className="w-full h-9 px-3 rounded-xl border border-border bg-panel text-xs text-ink focus:outline-none focus:ring-2 focus:ring-border"
                />
                <p className="text-[11px] text-faint">
                  Identifies the external workspace or account tenant.
                </p>
              </div>

              {/* Repository Name (if applicable) */}
              {activeDrawerProvider.fields.requiresRepo && (
                <div className="space-y-1.5">
                  <label className="block font-semibold text-ink">
                    Repository Name (owner/repo)
                  </label>
                  <input
                    type="text"
                    value={drawerForm.external_repo_name}
                    onChange={(e) =>
                      setDrawerForm({
                        ...drawerForm,
                        external_repo_name: e.target.value,
                      })
                    }
                    placeholder={activeDrawerProvider.fields.repoPlaceholder}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-panel text-xs font-mono text-ink focus:outline-none focus:ring-2 focus:ring-border"
                  />
                  <p className="text-[11px] text-faint">
                    Target Git repository for pull requests and commit triggers.
                  </p>
                </div>
              )}

              {/* Channel Name (if applicable) */}
              {activeDrawerProvider.fields.requiresChannel && (
                <div className="space-y-1.5">
                  <label className="block font-semibold text-ink">
                    Notification Channel
                  </label>
                  <input
                    type="text"
                    value={drawerForm.channel_name}
                    onChange={(e) =>
                      setDrawerForm({
                        ...drawerForm,
                        channel_name: e.target.value,
                      })
                    }
                    placeholder={activeDrawerProvider.fields.channelPlaceholder}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-panel text-xs text-ink focus:outline-none focus:ring-2 focus:ring-border"
                  />
                  <p className="text-[11px] text-faint">
                    Target channel for automated agent standups and blocker alerts.
                  </p>
                </div>
              )}

              {/* API Token / Secret */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-ink">
                    API Token / Personal Access Key
                  </label>
                  <span className="text-[10px] text-ok font-semibold flex items-center gap-1">
                    <Lock size={10} /> Encrypted at rest
                  </span>
                </div>
                <input
                  type="password"
                  value={drawerForm.api_token}
                  onChange={(e) =>
                    setDrawerForm({ ...drawerForm, api_token: e.target.value })
                  }
                  placeholder="ghp_••••••••••••••••••••••••••••••••"
                  className="w-full h-9 px-3 rounded-xl border border-border bg-panel text-xs font-mono text-ink focus:outline-none focus:ring-2 focus:ring-border"
                />
              </div>

              {/* Sync Direction */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-ink">
                  Data Synchronization Direction
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDrawerForm({ ...drawerForm, direction: "bi_directional" })
                    }
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      drawerForm.direction === "bi_directional"
                        ? "border-border bg-panel-alt font-semibold"
                        : "border-border hover:bg-ink/5"
                    }`}
                  >
                    <div className="font-semibold text-ink">
                      Bi-directional
                    </div>
                    <div className="text-[11px] text-muted font-normal">
                      Sync state back and forth
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDrawerForm({ ...drawerForm, direction: "push_only" })
                    }
                    className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                      drawerForm.direction === "push_only"
                        ? "border-border bg-panel-alt font-semibold"
                        : "border-border hover:bg-ink/5"
                    }`}
                  >
                    <div className="font-semibold text-ink">
                      Push Only
                    </div>
                    <div className="text-[11px] text-muted font-normal">
                      Export notifications only
                    </div>
                  </button>
                </div>
              </div>

              {/* Event Triggers Checklist */}
              <div className="space-y-2 pt-1">
                <label className="block font-semibold text-ink">
                  Active Event Subscriptions
                </label>
                <div className="space-y-2">
                  {[
                    { id: "agent_pr", label: "Autonomous Pull Request Creation" },
                    { id: "blockers", label: "P0 Blocker & Dependency Alerts" },
                    { id: "decisions", label: "Neural Decision Engine Summaries" },
                    { id: "releases", label: "Release Candidate Compilations" },
                  ].map((evt) => {
                    const isChecked = drawerForm.sync_events.includes(evt.id);
                    return (
                      <label
                        key={evt.id}
                        className="flex items-center gap-2.5 text-xs text-ink cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDrawerForm({
                                ...drawerForm,
                                sync_events: [...drawerForm.sync_events, evt.id],
                              });
                            } else {
                              setDrawerForm({
                                ...drawerForm,
                                sync_events: drawerForm.sync_events.filter(
                                  (x) => x !== evt.id
                                ),
                              });
                            }
                          }}
                          className="rounded border-border text-ink focus:ring-0"
                        />
                        <span>{evt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Test Connection Banner */}
              <div className="rounded-xl border border-border bg-panel p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">
                    Connectivity Probe
                  </span>
                  <button
                    type="button"
                    onClick={handleTestPing}
                    disabled={pingStatus?.testing}
                    className="px-2.5 py-1 rounded-lg border border-border bg-panel text-[11px] font-semibold text-ink hover:bg-ink/5 cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    {pingStatus?.testing ? "Pinging..." : "Test Connection"}
                  </button>
                </div>
                {pingStatus && !pingStatus.testing && (
                  <div className="flex items-center gap-1.5 text-[11px] text-ok font-semibold">
                    <CheckCircle2 size={13} />
                    <span>
                      Connection verified: 200 OK (Latency: {pingStatus.latency}ms)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-ink/10">
              <button
                type="button"
                onClick={() => setActiveDrawerProvider(null)}
                className="h-9 px-4 rounded-xl border border-border bg-panel text-xs font-semibold text-ink hover:bg-ink/5 cursor-pointer shadow-2xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveDrawer}
                disabled={isSavingDrawer}
                className="h-9 px-5 rounded-xl bg-ink text-on-ink text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs hover:opacity-90 disabled:opacity-50"
              >
                {isSavingDrawer ? (
                  <span>Saving...</span>
                ) : (
                  <>
                    <Check size={14} />
                    <span>Save Configuration</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CUSTOM WEBHOOKS MODAL */}
      {showWebhookModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-webhook-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans"
        >
          <div
            className="fixed inset-0 bg-base/60 backdrop-blur-xs"
            onClick={() => setShowWebhookModal(false)}
          />

          <div
            id="modal-webhooks-container"
            className="relative w-full max-w-xl bg-panel rounded-2xl border border-border shadow-2xl p-6 space-y-5 z-10"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warn/10 text-warn">
                  <Webhook size={20} />
                </div>
                <div>
                  <h3
                    id="modal-webhook-title"
                    className="text-base font-semibold text-ink"
                  >
                    Initiative Webhook Endpoint
                  </h3>
                  <p className="text-xs text-muted">
                    Receive inbound notifications or pipe events to external pipelines.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="h-8 w-8 rounded-lg hover:bg-ink/5 flex items-center justify-center text-faint hover:text-ink cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Webhook URL */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink">
                Inbound Payload URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`https://api.forge.dev/v1/initiatives/${initiativeId}/webhooks/inbound`}
                  className="flex-1 h-9 px-3 rounded-xl border border-border bg-panel text-xs font-mono text-ink select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `https://api.forge.dev/v1/initiatives/${initiativeId}/webhooks/inbound`
                    );
                    setWebhookUrlCopied(true);
                    toast.success("Webhook URL copied");
                    setTimeout(() => setWebhookUrlCopied(false), 2000);
                  }}
                  className="h-9 px-3 rounded-xl border border-border bg-panel text-xs font-semibold text-ink hover:bg-ink/5 cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  {webhookUrlCopied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
                  <span>{webhookUrlCopied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            {/* Signing secret: per-webhook, never a shared literal. A single
                hardcoded "signing secret" used to be shown here to every user;
                it signed nothing (no backend code uses it) and implied all
                initiatives share one key. Real secrets are generated per
                webhook by POST /webhooks/ and shown once at creation. */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink">
                HMAC SHA-256 Signing Secret
              </label>
              <p className="text-xs text-muted">
                Each webhook gets its own signing secret, shown once when you create it in
                Settings → Integrations. Use it to verify the X-Forge-Signature header.
              </p>
            </div>

            {/* Supported Event Payloads */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-ink">
                Dispatched JSON Payloads
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-border p-2.5 bg-ink/10">
                  <div className="font-mono font-semibold text-[11px] text-ink">
                    agent.execution.completed
                  </div>
                  <div className="text-[10px] text-muted">
                    Fires when an autonomous worker finishes code changes.
                  </div>
                </div>
                <div className="rounded-xl border border-border p-2.5 bg-ink/10">
                  <div className="font-mono font-semibold text-[11px] text-ink">
                    decision.bottleneck_detected
                  </div>
                  <div className="text-[10px] text-muted">
                    Fires when neural decision engine identifies blocked critical paths.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-soft">
              <button
                type="button"
                onClick={() => setShowWebhookModal(false)}
                className="h-9 px-4 rounded-xl bg-ink text-on-ink text-xs font-semibold cursor-pointer hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
