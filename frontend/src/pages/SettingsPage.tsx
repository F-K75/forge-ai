import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  Settings,
  X,
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

  const initialTab = useMemo<SettingsTabId>(() => {
    const hash = location.hash.replace("#", "").toLowerCase() as SettingsTabId;
    if (SETTINGS_TABS.some((t) => t.id === hash)) {
      return hash;
    }
    return "profile";
  }, [location.hash]);

  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");

  const handleTabChange = (tabId: SettingsTabId) => {
    setActiveTab(tabId);
    navigate(`/settings#${tabId}`, { replace: true });
  };

  useEffect(() => {
    const hash = location.hash.replace("#", "").toLowerCase() as SettingsTabId;
    if (hash && SETTINGS_TABS.some((t) => t.id === hash)) {
      setActiveTab(hash);
    }
  }, [location.hash]);

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
      className="h-full flex flex-col min-h-0 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5"
    >
      {/* 1. Studio Settings Header */}
      <header
        id="settings-header"
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border shrink-0"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-md border border-border bg-panel flex items-center justify-center text-accent shadow-apple shrink-0">
            <Settings size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-ink">
                Settings
              </h1>
              <span className="text-[11px] font-mono font-medium uppercase tracking-wider text-accent">
                {user?.plan || "PRO"}
              </span>
            </div>
            <p className="text-xs sm:text-[13px] text-muted mt-0.5">
              Manage your account, AI model credentials, and workspace preferences.
            </p>
          </div>
        </div>

        {/* Quick Search Filter */}
        <div className="relative w-full sm:w-72">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            id="settings-search-input"
            type="text"
            placeholder="Quick search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 text-xs pl-9 pr-8 rounded-md bg-panel border border-border text-ink placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-0.5 rounded transition-colors cursor-pointer"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </header>

      {/* 2. Hairline Underline Tab Navigation */}
      <nav
        id="settings-tab-selector"
        role="tablist"
        aria-label="Settings navigation tabs"
        className="flex items-center gap-1 overflow-x-auto scrollbar-none border-b border-border pb-px shrink-0"
      >
        {filteredTabs.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted">
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
                className={`relative shrink-0 px-3 py-2.5 text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                  selected
                    ? "text-accent font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-accent"
                    : "text-muted hover:text-ink"
                }`}
              >
                <Icon size={14} strokeWidth={selected ? 2.25 : 1.75} />
                <span>{tab.label}</span>

                {tab.badge && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })
        )}
      </nav>

      {/* 3. Main Content Surface */}
      <section
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-btn-${activeTab}`}
        className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-apple"
      >
        {/* Section Header Strip */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 shrink-0 bg-panel-alt/50">
          <div className="flex items-center gap-2.5 truncate">
            <activeNav.icon size={16} className="text-accent shrink-0" />
            <h2 className="font-display font-semibold text-sm text-ink">
              {activeNav.label}
            </h2>
            <span className="text-muted text-xs hidden sm:inline truncate">
              — {activeNav.description}
            </span>
          </div>

          <span className="text-[11px] font-mono text-muted shrink-0">
            {activeNav.id}
          </span>
        </div>

        {/* Section Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
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

        {/* Quiet Footer Bar */}
        <div className="h-9 px-5 border-t border-border bg-panel-alt/40 text-muted flex items-center justify-between text-xs shrink-0">
          <span>Changes persist automatically to your account</span>
          <a
            href="https://docs.forge.dev"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-ink transition-colors font-medium"
          >
            <span>Documentation</span>
            <ExternalLink size={11} />
          </a>
        </div>
      </section>
    </div>
  );
}
