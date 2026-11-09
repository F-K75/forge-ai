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
      className="h-full flex flex-col min-h-0 space-y-3 p-3 sm:p-5 relative overflow-hidden neobrutal-root"
    >
      {/* =========================================================================
          1. CLEAN NEO-BRUTALIST HEADER
      ========================================================================= */}
      <header
        id="settings-header"
        className="z-10 p-3.5 sm:p-4 shrink-0 neobrutal-panel-elevated"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left Column: Title & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#FFE600] border-2 border-black shadow-[3px_3px_0px_#000] flex items-center justify-center text-black font-black shrink-0">
              <span className="text-lg">⚙️</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight text-black">
                  Settings
                </h1>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-[#67E8F9] text-black border border-black rounded shadow-[1.5px_1.5px_0px_#000]">
                  {user?.plan || "PRO"}
                </span>
              </div>
              <p className="text-xs font-bold text-stone-700 mt-0.5">
                Manage your account, AI model credentials, and preferences.
              </p>
            </div>
          </div>

          {/* Right Column: Clean Search Filter */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black font-bold pointer-events-none" />
            <input
              id="settings-search-input"
              type="text"
              placeholder="Quick search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-8 py-2 rounded bg-white border-2 border-black text-black font-bold placeholder:text-stone-500 shadow-[3px_3px_0px_#000] focus:shadow-[4px_4px_0px_#FFE600] focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-black px-1 cursor-pointer hover:bg-neutral-200 rounded"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </header>

      {/* =========================================================================
          2. CLEAN TACTILE NAVIGATION TABS
      ========================================================================= */}
      <nav
        id="settings-tab-selector"
        role="tablist"
        aria-label="Settings navigation tabs"
        className="z-10 p-2 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 neobrutal-panel"
      >
        {filteredTabs.length === 0 ? (
          <div className="px-4 py-2 text-xs font-black uppercase text-black bg-[#FFE600] border-2 border-black rounded shadow-[2px_2px_0px_#000]">
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
                className={`shrink-0 px-3 py-1.5 rounded text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
                  selected
                    ? "neobrutal-tab-active"
                    : "bg-white text-black border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-neutral-100 active:translate-x-0.5 active:translate-y-0.5"
                }`}
              >
                <Icon size={14} className={selected ? "stroke-[2.5]" : "stroke-[2]"} />
                <span className="tracking-tight">{tab.label}</span>

                {tab.badge && (
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.2 rounded uppercase ${
                      selected
                        ? "bg-black text-[#FFE600]"
                        : "bg-black text-white"
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

      {/* =========================================================================
          3. MAIN CONTENT CONTAINER
      ========================================================================= */}
      <section
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-btn-${activeTab}`}
        className="flex-1 min-h-0 flex flex-col overflow-hidden relative neobrutal-panel-elevated z-10"
      >
        {/* Section Header Strip */}
        <div className="h-11 px-4 border-b-2 border-black bg-[#FFE600] text-black flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 truncate">
            <activeNav.icon size={16} className="stroke-[2.5]" />
            <h2 className="font-black text-sm uppercase tracking-tight">
              {activeNav.label}
            </h2>
            <span className="text-stone-800 text-xs font-bold hidden sm:inline truncate">
              — {activeNav.description}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase font-black bg-black text-white">
              {activeNav.id}
            </span>
          </div>
        </div>

        {/* Section Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-cyber-scroll">
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

        {/* Clean Footer Bar */}
        <div className="h-8 px-4 border-t-2 border-black bg-[#F7F4EA] text-black flex items-center justify-between text-xs font-bold shrink-0 select-none">
          <div className="flex items-center gap-2">
            <span className="font-black">FORGE SETTINGS</span>
            <span className="opacity-40">•</span>
            <span className="font-semibold text-stone-700">Changes persist to account</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://docs.forge.dev"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:underline text-black font-black text-[11px]"
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
