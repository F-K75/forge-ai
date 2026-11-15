import { useState, useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  User,
  Palette,
  Cpu,
  Bot,
  Key,
  Share2,
  Bell,
  ShieldCheck,
  Database,
  LifeBuoy,
  Search,
  ExternalLink,
  Settings as SettingsIcon,
  CreditCard,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import type { SettingsTabId } from "./settings/types";
import { ProfileTab } from "./settings/ProfileTab";
import { AppearanceTab } from "./settings/AppearanceTab";
import { ModelsTab } from "./settings/ModelsTab";
import { AgentFleetTab } from "./settings/AgentFleetTab";
import { ApiKeysTab } from "./settings/ApiKeysTab";
import { IntegrationsTab } from "./settings/IntegrationsTab";
import { NotificationsTab } from "./settings/NotificationsTab";
import { SecurityTab } from "./settings/SecurityTab";
import { PrivacyTab } from "./settings/PrivacyTab";
import { SupportTab } from "./settings/SupportTab";

interface SettingsNavTab {
  id: SettingsTabId;
  label: string;
  description: string;
  icon: typeof User;
  badge?: string;
  keywords: string[];
}

const SETTINGS_TABS: SettingsNavTab[] = [
  {
    id: "profile",
    label: "Profile",
    description: "Account identity, avatar, display name, and local timezone",
    icon: User,
    keywords: ["name", "email", "avatar", "role", "organization", "timezone", "bio", "id", "profile"],
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Themes, editor typography, and visual preferences",
    icon: Palette,
    keywords: ["theme", "dark", "light", "high contrast", "monaco", "font", "size", "appearance"],
  },
  {
    id: "models",
    label: "AI Models",
    description: "Gemini, Claude, DeepSeek, OpenAI, and reasoning provider keys",
    icon: Cpu,
    badge: "BYOK",
    keywords: ["anthropic", "claude", "openai", "deepseek", "groq", "api key", "temperature", "models"],
  },
  {
    id: "agents",
    label: "Agent Fleet",
    description: "Autonomous self-healing loops, commit formatting, and build rules",
    icon: Bot,
    keywords: ["auto deploy", "debug loops", "approval gates", "git", "agents", "fleet"],
  },
  {
    id: "api-keys",
    label: "Developer API Keys",
    description: "Command line interface tokens and developer automation keys",
    icon: Key,
    keywords: ["cli", "token", "service key", "automation", "api keys"],
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "Connected GitHub repositories, webhooks, and team alerts",
    icon: Share2,
    keywords: ["github", "pull request", "repo", "webhook", "endpoints", "slack", "integrations"],
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "System digests, build updates, and delivery channels",
    icon: Bell,
    keywords: ["email", "sound", "alerts", "digest", "notifications"],
  },
  {
    id: "security",
    label: "Security",
    description: "Two-factor verification (2FA), password, and active sessions",
    icon: ShieldCheck,
    badge: "2FA",
    keywords: ["two factor", "totp", "mfa", "password", "devices", "active sessions", "security"],
  },
  {
    id: "privacy",
    label: "Privacy",
    description: "Data export, cache management, and account options",
    icon: Database,
    keywords: ["gdpr", "export", "download", "json", "cache", "privacy"],
  },
  {
    id: "support",
    label: "Support",
    description: "Documentation, troubleshooting guides, and developer help",
    icon: LifeBuoy,
    keywords: ["support", "tickets", "help", "contact", "docs", "status"],
  },
];

export default function SettingsPage() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Extract initial tab from URL hash
  const initialTab = useMemo<SettingsTabId>(() => {
    const hash = location.hash.replace("#", "").toLowerCase() as SettingsTabId;
    if (SETTINGS_TABS.some((t) => t.id === hash)) {
      return hash;
    }
    return "profile";
  }, [location.hash]);

  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");

  // Sync hash when activeTab changes
  const handleTabChange = (tabId: SettingsTabId) => {
    setActiveTab(tabId);
    navigate(`/settings#${tabId}`, { replace: true });
  };

  // Keep state in sync if external hash changes
  useEffect(() => {
    const hash = location.hash.replace("#", "").toLowerCase() as SettingsTabId;
    if (hash && SETTINGS_TABS.some((t) => t.id === hash)) {
      setActiveTab(hash);
    }
  }, [location.hash]);

  // Filter tabs when user types in search query
  const filteredTabs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SETTINGS_TABS;
    return SETTINGS_TABS.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const activeNav = SETTINGS_TABS.find((t) => t.id === activeTab) || SETTINGS_TABS[0]!;

  return (
    <div
      id="settings-view"
      className="h-full flex flex-col min-h-0 space-y-3 p-3 sm:p-5 relative overflow-hidden bg-base text-ink"
    >
      {/* Header */}
      <header
        id="settings-header"
        className="z-10 p-3.5 sm:p-4 shrink-0 bg-panel border border-border rounded-xl shadow-m3-1"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left Column: Title & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-soft border border-accent/30 flex items-center justify-center text-accent shrink-0">
              <SettingsIcon size={18} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-ink">
                  Settings
                </h1>
                <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 bg-accent-soft text-accent border border-accent/30 rounded-md">
                  {user?.plan || "PRO"}
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Manage your account, AI model credentials, and preferences.
              </p>
            </div>
          </div>

          {/* Right Column: Billing Cross-Link + Search Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <Link
              to="/billing"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-panel-alt border border-border text-xs font-medium text-ink hover:border-accent/50 hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent shrink-0"
            >
              <CreditCard size={14} aria-hidden="true" />
              <span>Billing & Plans</span>
            </Link>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                id="settings-search-input"
                type="text"
                placeholder="Quick search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-8 py-2 rounded-lg bg-panel-alt border border-border text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all duration-150"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted hover:text-ink px-1 cursor-pointer rounded"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav
        id="settings-tab-selector"
        role="tablist"
        aria-label="Settings navigation tabs"
        className="z-10 p-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 bg-panel border border-border rounded-xl"
      >
        {filteredTabs.length === 0 ? (
          <div className="px-4 py-2 text-xs font-medium text-muted">
            No settings found matching "{searchQuery}"
          </div>
        ) : (
          filteredTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                id={`tab-btn-${tab.id}`}
                type="button"
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                onClick={() => handleTabChange(tab.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-all duration-150 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  selected
                    ? "bg-accent-soft text-accent border border-accent/30 font-semibold"
                    : "bg-transparent text-muted border border-transparent hover:bg-panel-alt hover:text-ink"
                }`}
              >
                <Icon size={14} />
                <span className="tracking-tight">{tab.label}</span>

                {tab.badge && (
                  <span
                    className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded uppercase ${
                      selected
                        ? "bg-accent text-base"
                        : "bg-panel-alt text-muted border border-border"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })
        )}
      </nav>

      {/* Main Content Container */}
      <section
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-btn-${activeTab}`}
        className="flex-1 min-h-0 flex flex-col overflow-hidden relative bg-panel border border-border rounded-xl shadow-m3-1 z-10"
      >
        {/* Section Header Strip */}
        <div className="h-11 px-4 border-b border-border bg-panel-alt text-ink flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 truncate">
            <activeNav.icon size={16} className="text-accent shrink-0" />
            <h2 className="font-semibold text-sm tracking-tight text-ink">
              {activeNav.label}
            </h2>
            <span className="text-muted text-xs hidden sm:inline truncate">
              — {activeNav.description}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-2 py-0.5 rounded-md font-mono uppercase font-medium bg-panel border border-border text-muted">
              {activeNav.id}
            </span>
          </div>
        </div>

        {/* Section Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-4xl space-y-6">
            {activeTab === "profile" && <ProfileTab />}
            {activeTab === "appearance" && <AppearanceTab />}
            {activeTab === "models" && <ModelsTab />}
            {activeTab === "agents" && <AgentFleetTab />}
            {activeTab === "api-keys" && <ApiKeysTab />}
            {activeTab === "integrations" && <IntegrationsTab />}
            {activeTab === "notifications" && <NotificationsTab />}
            {activeTab === "security" && <SecurityTab />}
            {activeTab === "privacy" && <PrivacyTab />}
            {activeTab === "support" && <SupportTab />}
          </div>
        </div>

        {/* Footer Bar */}
        <div className="h-9 px-4 border-t border-border bg-panel-alt text-muted flex items-center justify-between text-xs shrink-0 select-none">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-ink">FORGE SETTINGS</span>
            <span className="opacity-40">•</span>
            <span>Changes persist to account</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/billing"
              className="hover:text-ink transition-colors text-[11px] font-medium"
            >
              Billing &amp; Usage
            </Link>
            <a
              href="https://docs.forge.dev"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:text-ink transition-colors font-medium text-[11px]"
            >
              <span>Documentation</span>
              <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
