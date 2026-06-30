import type { Agent } from "./agents";

// ─── Projects ────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  agents: Agent["id"][];
  qaScore: number;
  lastBuilt: string;
  live: boolean;
}

export const PROJECTS: Project[] = [
  {
    id: "proj-001",
    name: "habit-tracker",
    description: "Daily habit tracking with streaks, heatmaps, and reminders.",
    agents: ["developer", "designer", "pm"],
    qaScore: 94,
    lastBuilt: "2h ago",
    live: true,
  },
  {
    id: "proj-002",
    name: "nse-backtester",
    description: "Backtest equity strategies against NSE historical data.",
    agents: ["architect", "developer", "integration"],
    qaScore: 88,
    lastBuilt: "1d ago",
    live: true,
  },
  {
    id: "proj-003",
    name: "options-pricer",
    description: "Black-Scholes and binomial tree options pricing with Greeks.",
    agents: ["developer", "pm"],
    qaScore: 91,
    lastBuilt: "3d ago",
    live: false,
  },
  {
    id: "proj-004",
    name: "crm-lite",
    description: "Lightweight CRM with contacts, pipeline stages, and activity feed.",
    agents: ["architect", "designer", "developer", "integration"],
    qaScore: 79,
    lastBuilt: "5d ago",
    live: false,
  },
  {
    id: "proj-005",
    name: "invoice-gen",
    description: "PDF invoice generator with client management and tax line items.",
    agents: ["developer", "designer", "integration"],
    qaScore: 86,
    lastBuilt: "12h ago",
    live: true,
  },
];

// ─── Starters (empty-state chips) ────────────────────────────────────────────

export interface Starter {
  label: string;
  iconName: string;
  hue: string;
}

export const STARTERS: Starter[] = [
  { label: "SaaS dashboard", iconName: "boxes",        hue: "#6366F1" },
  { label: "Marketplace",    iconName: "store",        hue: "#A855F7" },
  { label: "Auth + billing", iconName: "shield-check", hue: "#22D3EE" },
  { label: "AI chat app",    iconName: "sparkles",     hue: "#34D399" },
];

// ─── Templates (Marketplace) ─────────────────────────────────────────────────

export interface Template {
  id: string;
  name: string;
  author: string;
  source: "official" | "community";
  description: string;
  tags: string[];
  rating: number;
  installs: string;
  hue: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "tpl-001",
    name: "Stripe SaaS Kit",
    author: "Forge Team",
    source: "official",
    description: "Full-stack SaaS starter with Stripe Checkout, webhooks, and a subscription dashboard.",
    tags: ["saas", "stripe", "billing"],
    rating: 4.9,
    installs: "2.4k",
    hue: "#6366F1",
  },
  {
    id: "tpl-002",
    name: "Realtime Chat",
    author: "devhaus",
    source: "community",
    description: "WebSocket-powered chat rooms with presence indicators and message history.",
    tags: ["chat", "websocket", "realtime"],
    rating: 4.7,
    installs: "1.1k",
    hue: "#22D3EE",
  },
  {
    id: "tpl-003",
    name: "Admin Panel",
    author: "Forge Team",
    source: "official",
    description: "Data-table admin dashboard with CRUD ops, role-based access, and CSV export.",
    tags: ["admin", "crud", "tables"],
    rating: 4.8,
    installs: "3.8k",
    hue: "#A855F7",
  },
  {
    id: "tpl-004",
    name: "E-commerce Store",
    author: "pixelcraft",
    source: "community",
    description: "Product catalogue, cart, checkout flow, and order management backend.",
    tags: ["ecommerce", "stripe", "inventory"],
    rating: 4.6,
    installs: "1.9k",
    hue: "#F59E0B",
  },
  {
    id: "tpl-005",
    name: "Analytics Dash",
    author: "chartsmith",
    source: "community",
    description: "Event tracking pipeline with Recharts visualisations and date-range filters.",
    tags: ["analytics", "charts", "metrics"],
    rating: 4.5,
    installs: "950",
    hue: "#34D399",
  },
  {
    id: "tpl-006",
    name: "Booking System",
    author: "Forge Team",
    source: "official",
    description: "Calendar-based appointment booking with email confirmations and timezone support.",
    tags: ["booking", "calendar", "email"],
    rating: 4.7,
    installs: "1.4k",
    hue: "#EF4444",
  },
];

// ─── Billing ──────────────────────────────────────────────────────────────────

export interface UsageStat {
  label: string;
  value: string;
  sub: string;
  tone: "accent" | "info" | "ok";
}

export const USAGE_STATS: UsageStat[] = [
  { label: "Credits used",      value: "138 / 750",  sub: "this month",       tone: "accent" },
  { label: "Builds this month", value: "11",          sub: "avg 13 credits",   tone: "info"   },
  { label: "Avg QA score",      value: "88",          sub: "+4 vs last month", tone: "ok"     },
];

export interface AgentSpend {
  agent: Agent["id"];
  credits: number;
}

// Total 534 — reflects cumulative spend; current month (138) is a subset shown in USAGE_STATS
export const AGENT_SPEND: AgentSpend[] = [
  { agent: "developer",   credits: 285 },
  { agent: "architect",   credits: 96  },
  { agent: "designer",    credits: 64  },
  { agent: "integration", credits: 58  },
  { agent: "pm",          credits: 31  },
];

export interface Plan {
  name: "Free" | "Standard" | "Pro";
  price: string;
  credits: string;
  features: string[];
  active: boolean;
  cta: string;
}

export const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    credits: "10 credits",
    features: ["1 project", "Community templates", "Public builds"],
    active: false,
    cta: "Downgrade",
  },
  {
    name: "Standard",
    price: "$20",
    credits: "100 / month",
    features: ["Unlimited projects", "Private builds", "GitHub sync"],
    active: false,
    cta: "Switch to Standard",
  },
  {
    name: "Pro",
    price: "$60",
    credits: "750 / month",
    features: ["1M context window", "Bring your own key", "Priority builds", "Marketplace publishing"],
    active: true,
    cta: "Current plan",
  },
];

// ─── Settings ────────────────────────────────────────────────────────────────

export interface SettingsState {
  byok: boolean;
  maskedKey: string;
  github: { connected: boolean; repo: string };
  notifyOnBuild: boolean;
  autoDeploy: boolean;
  debugIterations: number;
}

export const DEFAULT_SETTINGS: SettingsState = {
  byok: true,
  maskedKey: "sk-ant-•••••••••••••••••4f2a",
  github: { connected: true, repo: "frendia/forge-apps" },
  notifyOnBuild: true,
  autoDeploy: false,
  debugIterations: 3,
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface AdminStat {
  label: string;
  value: string;
  delta: string;
  iconName: string;
  hue: string;
}

export const ADMIN_STATS: AdminStat[] = [
  { label: "Active users",     value: "3,482",  delta: "+12%", iconName: "users",       hue: "#6366F1" },
  { label: "Builds today",     value: "1,209",  delta: "+8%",  iconName: "activity",    hue: "#22D3EE" },
  { label: "MRR",              value: "$48.2k", delta: "+5%",  iconName: "credit-card", hue: "#34D399" },
  { label: "Credits consumed", value: "892k",   delta: "+18%", iconName: "zap",         hue: "#F59E0B" },
];

export interface AgentHealth {
  agent: Agent["id"];
  uptime: number;
  latency: string;
}

export const AGENT_HEALTH: AgentHealth[] = [
  { agent: "architect",   uptime: 99.9, latency: "1.2s" },
  { agent: "designer",    uptime: 99.7, latency: "1.8s" },
  { agent: "developer",   uptime: 98.1, latency: "4.8s" },
  { agent: "integration", uptime: 99.4, latency: "2.1s" },
  { agent: "pm",          uptime: 99.8, latency: "0.9s" },
];

export interface AdminBuild {
  user: string;
  project: string;
  status: "complete" | "debugging" | "failed";
  qaScore: number | null;
  credits: number;
}

export const RECENT_BUILDS: AdminBuild[] = [
  { user: "sarah_dev",   project: "saas-starter",   status: "complete",  qaScore: 94,   credits: 13 },
  { user: "marcos_ux",   project: "e-commerce-lite", status: "debugging", qaScore: null, credits: 21 },
  { user: "priya_eng",   project: "api-gateway",     status: "complete",  qaScore: 88,   credits: 9  },
  { user: "luka_ml",     project: "data-pipeline",   status: "failed",    qaScore: null, credits: 17 },
  { user: "ana_product", project: "crm-dashboard",   status: "complete",  qaScore: 91,   credits: 11 },
];

// ─── Project history ──────────────────────────────────────────────────────────

export interface BuildRun {
  id: string;
  label: string;
  time: string;
  status: "complete" | "debugging" | "failed";
  qaScore: number | null;
  credits: number;
  agents: Agent["id"][];
  filesChanged: number;
  debugLoops: number;
}

export const BUILD_HISTORY: BuildRun[] = [
  {
    id: "run-001",
    label: "Add Stripe checkout",
    time: "2h ago",
    status: "complete",
    qaScore: 96,
    credits: 18,
    agents: ["architect", "developer", "integration"],
    filesChanged: 12,
    debugLoops: 0,
  },
  {
    id: "run-002",
    label: "Fix auth token refresh",
    time: "5h ago",
    status: "debugging",
    qaScore: null,
    credits: 24,
    agents: ["developer", "integration"],
    filesChanged: 4,
    debugLoops: 2,
  },
  {
    id: "run-003",
    label: "Redesign dashboard layout",
    time: "1d ago",
    status: "complete",
    qaScore: 91,
    credits: 14,
    agents: ["designer", "developer", "pm"],
    filesChanged: 8,
    debugLoops: 0,
  },
  {
    id: "run-004",
    label: "Scaffold API endpoints",
    time: "2d ago",
    status: "complete",
    qaScore: 89,
    credits: 10,
    agents: ["architect", "developer"],
    filesChanged: 6,
    debugLoops: 0,
  },
];

// ─── Current user ─────────────────────────────────────────────────────────────

export interface User {
  name: string;
  email: string;
  plan: "Free" | "Standard" | "Pro";
  creditsUsed: number;
  creditsTotal: number;
}

export const CURRENT_USER: User = {
  name: "Keshav Frendia",
  email: "frendiakeshav75@gmail.com",
  plan: "Pro",
  creditsUsed: 138,
  creditsTotal: 750,
};
