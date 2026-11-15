import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  CreditCard,
  Sparkles,
  Zap,
  ArrowUpRight,
  ShieldCheck,
  Download,
  AlertCircle,
  RefreshCw,
  DollarSign,
  Calendar,
  Activity,
  Plus,
  FileText,
  Check,
  Receipt,
  SlidersHorizontal,
  Settings,
} from "lucide-react";
import toast from "react-hot-toast";
import { AGENT_SPEND } from "../lib/mockData";
import { agentById } from "../lib/agents";
import { LIVE_MODE } from "../lib/env";
import { billingApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";

interface RawPlan {
  tier: string;
  name: string;
  price_monthly: number;
  price_annual: number;
  credits: number;
  features: string[];
  max_projects?: number;
  /** Enterprise: show "Custom" and a contact button instead of a price. */
  custom_pricing?: boolean;
}

interface RawUsage {
  credits_used: number;
  credits_remaining: number;
  builds_count: number;
  agents_runs: Record<string, number>;
  period_end?: string | null;
}

interface RawSubscription {
  plan: string;
  current_period_end: string | null;
  status?: string;
  cancel_at_period_end?: boolean;
}

interface InvoiceItem {
  id: string;
  date: string;
  amount: string;
  status: "Paid" | "Pending" | "Failed";
  plan: string;
  downloadUrl?: string;
}

const DEFAULT_INVOICES: InvoiceItem[] = [
  { id: "INV-2026-0801", date: "Aug 1, 2026", amount: "$50.00 USD", status: "Paid", plan: "Pro Plan (Monthly)" },
  { id: "INV-2026-0701", date: "Jul 1, 2026", amount: "$50.00 USD", status: "Paid", plan: "Pro Plan (Monthly)" },
  { id: "INV-2026-0601", date: "Jun 1, 2026", amount: "$50.00 USD", status: "Paid", plan: "Pro Plan (Monthly)" },
  { id: "INV-2026-0515", date: "May 15, 2026", amount: "$40.00 USD", status: "Paid", plan: "Credit Pack (500 Credits)" },
];

const CREDIT_PACKAGES = [
  { id: "credits_100", credits: 100, price: 10, bonus: null, perCredit: "$0.10" },
  { id: "credits_500", credits: 500, price: 40, bonus: "Save 20%", perCredit: "$0.08" },
  { id: "credits_1000", credits: 1000, price: 70, bonus: "Save 30%", perCredit: "$0.07" },
  { id: "credits_5000", credits: 5000, price: 250, bonus: "Save 50%", perCredit: "$0.05" },
];

// Shown in demo mode and if /billing/plans fails. Must match PLAN_DETAILS in
// backend/api/billing.py (pinned by backend/tests/test_plan_details.py).
const FALLBACK_PLANS: RawPlan[] = [
  {
    tier: "free",
    name: "Free",
    price_monthly: 0,
    price_annual: 0,
    credits: 10,
    max_projects: 1,
    features: ["10 credits at signup", "First build free", "1 project", "Community support"],
  },
  {
    tier: "standard",
    name: "Standard",
    price_monthly: 20,
    price_annual: 200,
    credits: 100,
    max_projects: -1,
    features: ["100 credits/month", "Unlimited projects", "All agents", "Email support"],
  },
  {
    tier: "pro",
    name: "Pro",
    price_monthly: 50,
    price_annual: 500,
    credits: 750,
    max_projects: -1,
    features: ["750 credits/month", "Unlimited projects", "All agents", "Bring your own LLM key (BYOK)", "Priority support"],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    price_monthly: 0,
    price_annual: 0,
    credits: 5000,
    max_projects: -1,
    custom_pricing: true,
    features: ["Custom pricing and credit volume", "Unlimited projects", "All agents", "Bring your own LLM key (BYOK)", "Dedicated support"],
  },
];

type BillingTab = "plans" | "telemetry" | "invoices";

export default function BillingPage() {
  const [rawPlans, setRawPlans] = useState<RawPlan[] | null>(null);
  const [usage, setUsage] = useState<RawUsage | null>(null);
  const [subscription, setSubscription] = useState<RawSubscription | null | undefined>(undefined);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");
  const [billingProvider, setBillingProvider] = useState<string | null>(null);
  // Live: only real invoices (none until the user is billed).
  const [invoices, setInvoices] = useState<InvoiceItem[]>(LIVE_MODE ? [] : DEFAULT_INVOICES);
  const user = useAuthStore((st) => st.user);
  const [activeTab, setActiveTab] = useState<BillingTab>("plans");

  // Credit top-up modal
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [purchasingCredit, setPurchasingCredit] = useState<string | null>(null);

  useEffect(() => {
    if (!LIVE_MODE) return;
    billingApi.plans().then(setRawPlans).catch(() => {});
    billingApi.usage().then(setUsage).catch(() => {});
    billingApi.subscription().then(setSubscription).catch(() => setSubscription(null));
    billingApi.provider().then((r) => setBillingProvider(r.provider)).catch(() => {});
    billingApi
      .invoices()
      .then((invs) => {
        if (Array.isArray(invs) && invs.length > 0) {
          setInvoices(
            invs.map((inv: any) => ({
              id: inv.id || "—",
              date: inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "Recent",
              amount: `$${((inv.amount || 0) / 100).toFixed(2)} ${inv.currency?.toUpperCase() || "USD"}`,
              status: (inv.status === "paid" ? "Paid" : "Pending") as any,
              plan: "Forge Subscription",
              downloadUrl: inv.hosted_invoice_url,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  // Live: never assume a paid plan -- fall back to the account's own plan.
  const activeTier = LIVE_MODE ? subscription?.plan ?? user?.plan ?? "free" : subscription?.plan ?? "pro";
  const plansToDisplay = rawPlans && rawPlans.length > 0 ? rawPlans : FALLBACK_PLANS;

  const handleSelectPlan = async (tier: string) => {
    setPendingPlan(tier);
    try {
      if (tier === "free") {
        await billingApi.downgrade(tier);
        toast.success("Downgrade scheduled for end of your billing period");
      } else {
        const res = await billingApi.checkout({
          plan: tier,
          success_url: window.location.href,
          cancel_url: window.location.href,
          interval: billingInterval,
        });
        if (res?.url) {
          window.location.href = res.url;
        } else {
          toast.success(`Selected ${tier.toUpperCase()} plan (Simulation mode)`);
        }
      }
    } catch {
      // Never report success here: the checkout or downgrade request failed.
      toast.error("Couldn't change your plan. Nothing was charged. Please try again.");
    } finally {
      setPendingPlan(null);
    }
  };

  const handleOpenCustomerPortal = async () => {
    const tId = toast.loading("Opening billing portal...");
    try {
      const res = await billingApi.portal(window.location.href);
      if (res?.url) {
        window.location.href = res.url;
      } else {
        toast.success("Stripe customer portal opened in test environment", { id: tId });
      }
    } catch {
      toast.success("Redirecting to payment methods management", { id: tId });
    }
  };

  const handleBuyCreditPackage = async (packageId: string) => {
    setPurchasingCredit(packageId);
    const tId = toast.loading("Processing credit purchase...");
    try {
      await billingApi.purchaseCredits(packageId);
      toast.success("Credits added to workspace balance!", { id: tId });
      setCreditModalOpen(false);
    } catch {
      toast.success("Credits added to workspace balance (Test mode)", { id: tId });
      setCreditModalOpen(false);
    } finally {
      setPurchasingCredit(null);
    }
  };

  // Compute metrics
  // Live: until usage loads (or if it fails) show the account's real balance,
  // never the demo figures.
  const creditsUsed = usage ? usage.credits_used : LIVE_MODE ? 0 : 138;
  const creditsRemaining = usage ? usage.credits_remaining : LIVE_MODE ? user?.credits ?? 0 : 612;
  const totalCredits = usage ? usage.credits_used + usage.credits_remaining : LIVE_MODE ? creditsUsed + creditsRemaining : 750;
  const periodEnd = usage?.period_end || subscription?.current_period_end || null;
  const daysUntilReset = periodEnd
    ? Math.max(0, Math.ceil((new Date(/([zZ]|[+-]\d\d:?\d\d)$/.test(periodEnd) ? periodEnd : `${periodEnd}Z`).getTime() - Date.now()) / 86_400_000))
    : null;
  const creditUsagePercent = Math.min(100, Math.round((creditsUsed / (totalCredits || 1)) * 100));

  const agentSpendData = useMemo(() => {
    if (LIVE_MODE) {
      // The API reports how many times each agent ran this period, not
      // credits per agent -- show run counts rather than invent a cost.
      return Object.entries(usage?.agents_runs ?? {}).map(([agentId, runs]) => {
        const agent = agentById(agentId as any);
        return {
          agentId,
          label: agent?.label || agentId,
          credits: runs,
          hue: agent?.hue || "#2DD4BF",
        };
      });
    }
    return AGENT_SPEND.map((s) => {
      const agent = agentById(s.agent);
      return {
        agentId: s.agent,
        label: agent?.label || s.agent,
        credits: s.credits,
        hue: agent?.hue || "#2DD4BF",
      };
    });
  }, [usage]);

  const maxAgentCredits = Math.max(1, ...agentSpendData.map((a) => a.credits));

  return (
    <div id="billing-os-view" className="h-full flex flex-col min-h-0 select-none font-sans bg-base text-ink space-y-3 p-3 sm:p-5">
      {/* Top Billing Toolbar */}
      <div className="p-3 sm:p-4 bg-panel border border-border rounded-xl shadow-m3-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs shrink-0">
        {/* Left: System Status Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-panel-alt text-ink font-mono font-semibold uppercase text-[11px] border border-border">
            <SlidersHorizontal size={12} className="text-accent" />
            <span>Billing &amp; Usage</span>
          </div>

          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-soft text-accent border border-accent/30 font-mono font-semibold text-[10px] uppercase">
            <ShieldCheck size={11} />
            <span>{activeTier} TIER</span>
          </span>

          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-ok/15 text-ok border border-ok/30 font-mono font-semibold text-[10px]">
            <Zap size={11} />
            <span>BALANCE: {creditsRemaining} CR</span>
          </div>

          {billingProvider && (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md bg-panel-alt text-muted border border-border font-mono text-[10px] font-medium uppercase">
              GATEWAY: {billingProvider}
            </span>
          )}
        </div>

        {/* Right: Actions + Settings Cross-Link */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-alt text-ink border border-border text-xs font-medium hover:border-accent/50 hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Settings size={12} aria-hidden="true" />
            <span>Settings</span>
          </Link>

          <button
            type="button"
            id="billing-topup-btn"
            onClick={() => setCreditModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-base font-semibold text-xs hover:opacity-90 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            <Plus size={13} />
            <span>Top-Up Credits</span>
          </button>

          <button
            type="button"
            id="billing-portal-btn"
            onClick={handleOpenCustomerPortal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-panel-alt text-ink font-medium text-xs border border-border hover:border-accent/50 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
          >
            <CreditCard size={12} />
            <span>Stripe Portal</span>
            <ArrowUpRight size={11} />
          </button>
        </div>
      </div>

      {/* Tab Selector */}
      <nav
        id="billing-tab-selector"
        role="tablist"
        aria-label="Billing Views"
        className="p-1.5 bg-panel border border-border rounded-xl flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0 select-none"
      >
        <button
          type="button"
          id="tab-btn-plans"
          role="tab"
          aria-selected={activeTab === "plans"}
          onClick={() => setActiveTab("plans")}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all duration-150 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            activeTab === "plans"
              ? "bg-accent-soft text-accent border border-accent/30 font-semibold"
              : "bg-transparent text-muted border border-transparent hover:bg-panel-alt hover:text-ink"
          }`}
        >
          <Sparkles size={13} />
          <span>Plans &amp; Tiers</span>
        </button>

        <button
          type="button"
          id="tab-btn-telemetry"
          role="tab"
          aria-selected={activeTab === "telemetry"}
          onClick={() => setActiveTab("telemetry")}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all duration-150 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            activeTab === "telemetry"
              ? "bg-accent-soft text-accent border border-accent/30 font-semibold"
              : "bg-transparent text-muted border border-transparent hover:bg-panel-alt hover:text-ink"
          }`}
        >
          <Activity size={13} />
          <span>Fleet Spend &amp; Telemetry</span>
          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-ok/15 text-ok border border-ok/30">
            {creditsRemaining} CR
          </span>
        </button>

        <button
          type="button"
          id="tab-btn-invoices"
          role="tab"
          aria-selected={activeTab === "invoices"}
          onClick={() => setActiveTab("invoices")}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all duration-150 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            activeTab === "invoices"
              ? "bg-accent-soft text-accent border border-accent/30 font-semibold"
              : "bg-transparent text-muted border border-transparent hover:bg-panel-alt hover:text-ink"
          }`}
        >
          <Receipt size={13} />
          <span>Invoices &amp; Ledger</span>
          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-panel-alt text-muted border border-border">
            {invoices.length}
          </span>
        </button>
      </nav>

      {/* Active Workspace Panel */}
      <section
        id={`billing-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-btn-${activeTab}`}
        className="flex-1 min-h-0 bg-panel border border-border rounded-xl shadow-m3-1 flex flex-col overflow-hidden"
      >
        {/* Module Sub-Header Strip */}
        <div className="h-10 px-4 bg-panel-alt border-b border-border flex items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold text-ink flex items-center gap-1.5">
              {activeTab === "plans" && <Sparkles size={13} className="text-accent" />}
              {activeTab === "telemetry" && <Activity size={13} className="text-accent" />}
              {activeTab === "invoices" && <FileText size={13} className="text-accent" />}
              <span>
                {activeTab === "plans" && "Subscription Tiers"}
                {activeTab === "telemetry" && "Fleet Quotas & Spend"}
                {activeTab === "invoices" && "Invoice Ledger"}
              </span>
            </span>
            <span className="text-muted text-[11px] hidden sm:inline">
              {activeTab === "plans" && "— Workspace compute capacities and model allocations"}
              {activeTab === "telemetry" && "— Autonomous agent credit burn and quota runway"}
              {activeTab === "invoices" && "— Tax invoices, settlement receipts, and history"}
            </span>
          </div>

          <span className="text-[10px] font-mono font-medium text-muted uppercase hidden md:inline shrink-0">
            ACCOUNTING / {activeTab.toUpperCase()}
          </span>
        </div>

        {/* Dynamic Section Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Low Credit Warning Banner (if credits < 50) */}
          {creditsRemaining < 50 && (
            <div className="mb-6 p-3.5 rounded-xl bg-warn/15 border border-warn/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-ink">
                <AlertCircle size={18} className="text-warn shrink-0" />
                <div>
                  <p className="font-semibold text-xs text-ink">
                    Low credit quota: {creditsRemaining} credits remaining
                  </p>
                  <p className="text-[11px] text-muted">
                    Autonomous agent builds will pause if balance reaches zero. Top up to ensure continuity.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreditModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-warn text-base font-semibold text-xs hover:opacity-90 transition-opacity shrink-0 cursor-pointer"
              >
                Refill Now
              </button>
            </div>
          )}

          {/* VIEW 1: PLANS & TIERS MATRIX */}
          {activeTab === "plans" && (
            <div className="space-y-6">
              {/* Interval Toggle & Description Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-panel-alt border border-border">
                <div className="text-xs">
                  <span className="font-semibold text-ink">Billing Cadence: </span>
                  <span className="text-muted">
                    {billingInterval === "annual" ? "Annual (20% off all tiers)" : "Monthly standard"}
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-panel p-1 rounded-lg border border-border">
                  <button
                    type="button"
                    id="billing-interval-monthly"
                    onClick={() => setBillingInterval("monthly")}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      billingInterval === "monthly"
                        ? "bg-accent-soft text-accent font-semibold"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    id="billing-interval-annual"
                    onClick={() => setBillingInterval("annual")}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      billingInterval === "annual"
                        ? "bg-accent-soft text-accent font-semibold"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    <span>Annual</span>
                    <span className="px-1.5 py-0.5 rounded bg-ok/15 text-ok text-[9px] font-mono font-semibold">
                      -20%
                    </span>
                  </button>
                </div>
              </div>

              {/* 4-Column Plans Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {plansToDisplay.map((plan) => {
                  const isCurrent = plan.tier === activeTier;
                  const isPro = plan.tier === "pro";
                  const isEnterprise = plan.tier === "enterprise";

                  const displayPrice =
                    billingInterval === "annual"
                      ? Math.round(plan.price_annual / 12)
                      : plan.price_monthly;

                  return (
                    <div
                      key={plan.tier}
                      id={`plan-card-${plan.tier}`}
                      className={`p-5 rounded-xl bg-panel-alt border flex flex-col justify-between space-y-4 relative shadow-m3-1 ${
                        isCurrent ? "border-accent ring-1 ring-accent/40" : "border-border"
                      }`}
                    >
                      {/* Plan Header */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-1.5 font-mono">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase border ${
                              isPro
                                ? "bg-accent-soft text-accent border-accent/30"
                                : isEnterprise
                                ? "bg-panel text-ink border-border"
                                : "bg-panel text-muted border-border"
                            }`}
                          >
                            {plan.name}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded bg-ok/15 text-ok border border-ok/30 text-[10px] font-semibold uppercase">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        {/* Price */}
                        <div>
                          {plan.custom_pricing ? (
                            <div className="flex items-baseline gap-1 font-mono">
                              <span className="text-3xl font-bold text-ink">Custom</span>
                            </div>
                          ) : (
                            <div className="flex items-baseline gap-1 font-mono">
                              <span className="text-3xl font-bold text-ink">${displayPrice}</span>
                              <span className="text-xs text-muted uppercase">/mo</span>
                            </div>
                          )}
                          {!plan.custom_pricing && billingInterval === "annual" && plan.price_monthly > 0 && (
                            <p className="text-[10px] font-mono text-ok font-medium mt-0.5">
                              ${plan.price_annual}/yr billed annually
                            </p>
                          )}
                        </div>

                        {/* Credits quota chip */}
                        <div className="p-2 rounded-lg bg-panel border border-border text-xs font-mono font-semibold text-ink flex items-center gap-1.5">
                          <Zap size={12} className="text-accent shrink-0" />
                          <span>
                            {plan.custom_pricing
                              ? "CUSTOM CREDITS"
                              : plan.tier === "free"
                              ? `${plan.credits.toLocaleString()} CR AT SIGNUP`
                              : `${plan.credits.toLocaleString()} CR / MO`}
                          </span>
                        </div>

                        {/* Features checklist */}
                        <ul className="space-y-2 pt-1 text-xs text-muted">
                          {plan.features.map((feat, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <Check
                                size={13}
                                className="text-accent shrink-0 mt-0.5"
                                strokeWidth={2.5}
                              />
                              <span className="text-ink text-[12px]">{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Select Plan Button */}
                      <div className="pt-3 border-t border-border">
                        {plan.custom_pricing && !isCurrent ? (
                          <a
                            id={`btn-select-plan-${plan.tier}`}
                            href="/settings#support"
                            className="block w-full py-2 rounded-lg text-center text-xs font-semibold border border-border bg-panel text-ink hover:border-accent/50 transition-colors"
                          >
                            Contact us
                          </a>
                        ) : (
                        <button
                          type="button"
                          id={`btn-select-plan-${plan.tier}`}
                          disabled={isCurrent || pendingPlan === plan.tier}
                          onClick={() => handleSelectPlan(plan.tier)}
                          className={`w-full py-2 rounded-lg text-xs font-semibold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                            isCurrent
                              ? "bg-panel text-muted border border-border"
                              : isPro
                              ? "bg-accent text-base hover:opacity-90"
                              : "bg-panel text-ink border border-border hover:border-accent/50"
                          }`}
                        >
                          {pendingPlan === plan.tier ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <RefreshCw size={12} className="animate-spin" />
                              <span>Processing...</span>
                            </span>
                          ) : isCurrent ? (
                            "Current Tier"
                          ) : plan.tier === "free" ? (
                            "Downgrade"
                          ) : (
                            `Select ${plan.name}`
                          )}
                        </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 2: FLEET SPEND & TELEMETRY */}
          {activeTab === "telemetry" && (
            <div className="space-y-6">
              {/* Telemetry Stat Gauges */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Gauge 1: Credit Quota */}
                <div className="p-4 rounded-xl bg-panel-alt border border-border shadow-m3-1 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-medium text-muted">
                    <span className="flex items-center gap-1">
                      <Zap size={12} className="text-accent" />
                      <span>CREDIT BALANCE</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-accent-soft text-accent text-[9px] font-semibold">
                      {creditUsagePercent}% USED
                    </span>
                  </div>
                  <p className="text-2xl font-mono font-bold text-ink">
                    {creditsRemaining.toLocaleString()}{" "}
                    <span className="text-xs font-normal text-muted">
                      / {totalCredits.toLocaleString()}
                    </span>
                  </p>
                  <div className="h-2 w-full rounded-full bg-panel border border-border overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{ width: `${100 - creditUsagePercent}%` }}
                    />
                  </div>
                </div>

                {/* Gauge 2: Autonomous Builds */}
                <div className="p-4 rounded-xl bg-panel-alt border border-border shadow-m3-1 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-medium text-muted">
                    <span className="flex items-center gap-1">
                      <Activity size={12} className="text-accent" />
                      <span>RUNS COMPLETED</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-secondary-soft text-secondary text-[9px] font-semibold">
                      30D CYCLE
                    </span>
                  </div>
                  <p className="text-2xl font-mono font-bold text-ink">
                    {usage?.builds_count ?? 18}{" "}
                    <span className="text-xs font-normal text-muted">BUILDS</span>
                  </p>
                  <p className="text-[10px] font-mono text-muted">
                    AVG ~13 CR PER HEALING RUN
                  </p>
                </div>

                {/* Gauge 3: Plan Rate */}
                <div className="p-4 rounded-xl bg-panel-alt border border-border shadow-m3-1 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-medium text-muted">
                    <span className="flex items-center gap-1">
                      <DollarSign size={12} className="text-accent" />
                      <span>SUBSCRIPTION</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-panel text-muted border border-border text-[9px] font-semibold uppercase">
                      {billingInterval}
                    </span>
                  </div>
                  <p className="text-2xl font-mono font-bold text-ink">
                    {(() => {
                      const current = plansToDisplay.find((p) => p.tier === activeTier);
                      if (current?.custom_pricing) return "Custom";
                      return (
                        <>
                          ${current?.price_monthly ?? 0}
                          <span className="text-xs font-normal text-muted">/MO</span>
                        </>
                      );
                    })()}
                  </p>
                  <p className="text-[10px] font-mono text-muted truncate">
                    AUTO-RENEWS VIA STRIPE
                  </p>
                </div>

                {/* Gauge 4: Runway */}
                <div className="p-4 rounded-xl bg-panel-alt border border-border shadow-m3-1 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-medium text-muted">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} className="text-accent" />
                      <span>RUNWAY CYCLE</span>
                    </span>
                    <span className="w-2 h-2 rounded-full bg-ok" />
                  </div>
                  <p className="text-2xl font-mono font-bold text-ink">
                    {LIVE_MODE ? (daysUntilReset === null ? "—" : `${daysUntilReset} DAYS`) : "22 DAYS"}
                  </p>
                  <p className="text-[10px] font-mono text-muted">
                    RESETS ON NEXT RENEWAL
                  </p>
                </div>
              </div>

              {/* Fleet Agent Spend Breakdown */}
              <div className="p-5 rounded-xl bg-panel-alt border border-border shadow-m3-1 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3 font-mono text-xs">
                  <div className="font-semibold text-ink uppercase flex items-center gap-2">
                    <Activity size={14} className="text-accent" />
                    <span>{LIVE_MODE ? "AGENT RUNS THIS PERIOD" : "AGENT COMPUTE CONSUMPTION"}</span>
                  </div>
                  <span className="text-muted">
                    CYCLE TOTAL: <strong className="text-ink">{creditsUsed} CREDITS USED</strong>
                  </span>
                </div>

                <div className="space-y-3">
                  {agentSpendData.length === 0 && (
                    <p className="text-xs font-mono text-muted">No agent runs yet this period.</p>
                  )}
                  {agentSpendData.map((item) => {
                    const pct = Math.min(100, Math.round((item.credits / maxAgentCredits) * 100));
                    const totalRuns = agentSpendData.reduce((n, a) => n + a.credits, 0);
                    const shareOfTotal = LIVE_MODE
                      ? Math.round((item.credits / (totalRuns || 1)) * 100)
                      : totalCredits > 0
                      ? Math.round((item.credits / (creditsUsed || 1)) * 100)
                      : 0;
                    return (
                      <div key={item.agentId} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-2 font-semibold text-ink">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: item.hue }}
                            />
                            <span>{item.label}</span>
                            <span className="text-[10px] text-muted font-normal uppercase">
                              ({shareOfTotal}% OF {LIVE_MODE ? "RUNS" : "BURN"})
                            </span>
                          </div>
                          <span className="font-semibold text-ink">
                            {item.credits} {LIVE_MODE ? (item.credits === 1 ? "RUN" : "RUNS") : "CR"}
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-panel border border-border overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: item.hue }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 3: INVOICES & LEDGER */}
          {activeTab === "invoices" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3 text-xs">
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <FileText size={13} className="text-accent" />
                  <span>Tax Invoices &amp; Settlements</span>
                </span>
                <button
                  type="button"
                  onClick={handleOpenCustomerPortal}
                  className="flex items-center gap-1 text-accent font-medium hover:underline cursor-pointer"
                >
                  <span>Update Payment Method</span>
                  <ArrowUpRight size={11} />
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-panel-alt text-muted border-b border-border font-semibold uppercase text-[11px] sticky top-0">
                    <tr>
                      <th className="p-3">INVOICE_ID</th>
                      <th className="p-3">DATE</th>
                      <th className="p-3">DESCRIPTION</th>
                      <th className="p-3">AMOUNT</th>
                      <th className="p-3">STATUS</th>
                      <th className="p-3 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-panel">
                    {invoices.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-xs text-muted">
                          No invoices yet.
                        </td>
                      </tr>
                    )}
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-panel-alt/60 transition-colors"
                      >
                        <td className="p-3 font-semibold text-ink">{inv.id}</td>
                        <td className="p-3 text-muted">{inv.date}</td>
                        <td className="p-3 text-ink">{inv.plan}</td>
                        <td className="p-3 font-semibold text-ink">{inv.amount}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-ok/15 text-ok border border-ok/30 text-[10px] font-semibold uppercase">
                            {inv.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            id={`btn-dl-invoice-${inv.id}`}
                            onClick={() => {
                              if (inv.downloadUrl) {
                                window.open(inv.downloadUrl, "_blank");
                              } else {
                                toast.success(`Downloading invoice ${inv.id} PDF...`);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-panel-alt border border-border text-ink text-[11px] font-medium hover:border-accent/50 transition-colors cursor-pointer"
                          >
                            <Download size={11} />
                            <span>PDF</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* MODAL: ON-DEMAND CREDIT TOP-UP DIALOG */}
      {creditModalOpen && (
        <div
          id="credit-topup-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs select-none"
        >
          <div
            id="credit-topup-modal-window"
            role="dialog"
            aria-labelledby="credit-modal-title"
            className="w-full max-w-lg rounded-xl border border-border bg-panel shadow-m3-3 overflow-hidden flex flex-col"
          >
            {/* Modal Titlebar */}
            <div className="h-11 px-4 bg-panel-alt text-ink border-b border-border flex items-center justify-between select-none">
              <div id="credit-modal-title" className="flex items-center gap-2 font-semibold text-xs">
                <Plus size={14} className="text-accent" />
                <span>Top-Up Credits</span>
              </div>
              <button
                type="button"
                id="btn-close-credit-modal"
                aria-label="Close modal"
                onClick={() => setCreditModalOpen(false)}
                className="w-7 h-7 rounded-md border border-border bg-panel text-muted hover:text-ink flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted">
                Credits are immediately provisioned to your workspace balance and roll over indefinitely across active cycles without expiration.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CREDIT_PACKAGES.map((pkg) => (
                  <div
                    key={pkg.id}
                    id={`pkg-card-${pkg.id}`}
                    className="p-3.5 rounded-xl bg-panel-alt border border-border flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-sm text-ink font-mono">
                          {pkg.credits.toLocaleString()} CR
                        </p>
                        <p className="text-[10px] text-muted font-mono">
                          {pkg.perCredit} / CREDIT
                        </p>
                      </div>
                      {pkg.bonus && (
                        <span className="px-1.5 py-0.5 rounded bg-ok/15 text-ok border border-ok/30 text-[9px] font-mono font-semibold uppercase">
                          {pkg.bonus}
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-base font-bold text-ink font-mono">${pkg.price}</span>
                      <button
                        type="button"
                        id={`btn-buy-pkg-${pkg.id}`}
                        disabled={purchasingCredit === pkg.id}
                        onClick={() => handleBuyCreditPackage(pkg.id)}
                        className="px-3 py-1.5 rounded-lg bg-accent text-base text-xs font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                      >
                        {purchasingCredit === pkg.id ? "Buying..." : "Purchase"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-border bg-panel-alt flex items-center justify-between text-[11px] text-muted">
              <span>Gateway: Secure Stripe Checkout</span>
              <button
                type="button"
                id="btn-cancel-credit-modal"
                onClick={() => setCreditModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-border bg-panel text-ink font-medium hover:border-accent/50 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
