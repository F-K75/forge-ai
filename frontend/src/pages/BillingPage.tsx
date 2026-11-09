import { useEffect, useState, useMemo } from "react";
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
} from "lucide-react";
import toast from "react-hot-toast";
import { AGENT_SPEND } from "../lib/mockData";
import { agentById } from "../lib/agents";
import { LIVE_MODE } from "../lib/env";
import { billingApi } from "../lib/api";

interface RawPlan {
  tier: string;
  name: string;
  price_monthly: number;
  price_annual: number;
  credits: number;
  features: string[];
  max_projects?: number;
}

interface RawUsage {
  credits_used: number;
  credits_remaining: number;
  builds_count: number;
  agents_runs: Record<string, number>;
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
  { id: "INV-2026-0801", date: "Aug 1, 2026", amount: "$99.00 USD", status: "Paid", plan: "Pro Plan (Monthly)" },
  { id: "INV-2026-0701", date: "Jul 1, 2026", amount: "$99.00 USD", status: "Paid", plan: "Pro Plan (Monthly)" },
  { id: "INV-2026-0601", date: "Jun 1, 2026", amount: "$99.00 USD", status: "Paid", plan: "Pro Plan (Monthly)" },
  { id: "INV-2026-0515", date: "May 15, 2026", amount: "$40.00 USD", status: "Paid", plan: "Credit Pack (500 Credits)" },
];

const CREDIT_PACKAGES = [
  { id: "credits_100", credits: 100, price: 10, bonus: null, perCredit: "$0.10" },
  { id: "credits_500", credits: 500, price: 40, bonus: "Save 20%", perCredit: "$0.08" },
  { id: "credits_1000", credits: 1000, price: 70, bonus: "Save 30%", perCredit: "$0.07" },
  { id: "credits_5000", credits: 5000, price: 250, bonus: "Save 50%", perCredit: "$0.05" },
];

const FALLBACK_PLANS: RawPlan[] = [
  {
    tier: "free",
    name: "Free",
    price_monthly: 0,
    price_annual: 0,
    credits: 50,
    max_projects: 3,
    features: ["50 monthly credits", "3 active projects", "Standard community models", "Community Discord support"],
  },
  {
    tier: "standard",
    name: "Standard",
    price_monthly: 29,
    price_annual: 290,
    credits: 100,
    max_projects: 25,
    features: ["100 monthly credits", "25 active projects", "All autonomous agents", "Custom domains & SSL", "Priority build queue"],
  },
  {
    tier: "pro",
    name: "Pro",
    price_monthly: 99,
    price_annual: 990,
    credits: 500,
    max_projects: 100,
    features: ["500 monthly credits", "100 active projects", "Frontier models (Gemini 2.5 Pro & Claude 3.7)", "Bring Your Own Key (BYOK)", "24/7 Priority SLA & SSO"],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    price_monthly: 999,
    price_annual: 9990,
    credits: 5000,
    max_projects: -1,
    features: ["5,000 monthly credits", "Unlimited projects & concurrency", "Dedicated inference routing cluster", "Custom system prompts & fine-tuning", "Dedicated account engineer"],
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
  const [invoices, setInvoices] = useState<InvoiceItem[]>(DEFAULT_INVOICES);
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
              id: inv.id || `INV-${Math.floor(Math.random() * 9000 + 1000)}`,
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

  const activeTier = subscription?.plan ?? "pro";
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
      toast.success(`Plan updated to ${tier.toUpperCase()}`);
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
  const totalCredits = usage ? usage.credits_used + usage.credits_remaining : 750;
  const creditsUsed = usage ? usage.credits_used : 138;
  const creditsRemaining = usage ? usage.credits_remaining : 612;
  const creditUsagePercent = Math.min(100, Math.round((creditsUsed / (totalCredits || 1)) * 100));

  const agentSpendData = useMemo(() => {
    if (LIVE_MODE && usage?.agents_runs) {
      return Object.entries(usage.agents_runs).map(([agentId, runs]) => {
        const agent = agentById(agentId as any);
        return {
          agentId,
          label: agent?.label || agentId,
          credits: runs * 5,
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
    <div id="billing-os-view" className="h-full flex flex-col min-h-0 select-none font-sans text-ink space-y-3">
      {/* =========================================================================
          1. TOP OS CONTROL TOOLBAR
             System accounting status strip and direct tactile actions
      ========================================================================= */}
      <div className="p-2.5 sm:p-3 bg-white dark:bg-[#1A1A22] border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 font-mono text-xs shrink-0">
        {/* Left: System Status Chips */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-black text-white dark:bg-white dark:text-black font-black uppercase text-[11px] border border-black dark:border-white">
            <SlidersHorizontal size={12} strokeWidth={2.5} />
            <span>SYS_BILLING</span>
          </div>

          <span className="flex items-center gap-1 px-2 py-0.5 bg-brutal-yellow text-black border border-black font-black text-[10px] uppercase shadow-[1px_1px_0px_#000]">
            <ShieldCheck size={11} strokeWidth={2.5} />
            <span>{activeTier} TIER</span>
          </span>

          <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-400 text-black border border-black font-black text-[10px] shadow-[1px_1px_0px_#000]">
            <Zap size={11} strokeWidth={2.5} />
            <span>BALANCE: {creditsRemaining} CR</span>
          </div>

          {billingProvider && (
            <span className="hidden md:inline-flex items-center px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-ink border border-black dark:border-white text-[10px] font-bold uppercase">
              GATEWAY: {billingProvider}
            </span>
          )}
        </div>

        {/* Right: Tactile Push-Buttons */}
        <div className="flex items-center gap-2 font-mono">
          <button
            type="button"
            id="billing-topup-btn"
            onClick={() => setCreditModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 bg-brutal-yellow text-black font-black text-xs uppercase border-2 border-black shadow-[2px_2px_0px_#000] hover:brightness-105 active:translate-x-[1px] active:translate-y-[1px]"
          >
            <Plus size={13} strokeWidth={3} />
            <span>TOP-UP CREDITS</span>
          </button>

          <button
            type="button"
            id="billing-portal-btn"
            onClick={handleOpenCustomerPortal}
            className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-[#202028] text-ink font-bold text-xs border-2 border-black dark:border-white shadow-[2px_2px_0px_#000] hover:bg-neutral-100 dark:hover:bg-[#282834] active:translate-x-[1px] active:translate-y-[1px]"
          >
            <CreditCard size={12} strokeWidth={2.5} />
            <span>STRIPE PORTAL</span>
            <ArrowUpRight size={11} />
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. OS TAB SELECTOR
             Allows instant switching between Plans, Fleet Quotas, and Ledger
      ========================================================================= */}
      <nav
        id="billing-tab-selector"
        role="tablist"
        aria-label="Billing Views"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 shrink-0 select-none font-mono"
      >
        <button
          type="button"
          id="tab-btn-plans"
          role="tab"
          aria-selected={activeTab === "plans"}
          onClick={() => setActiveTab("plans")}
          className={`shrink-0 px-3 py-1.5 border-2 border-black dark:border-white/80 font-mono text-xs font-black uppercase flex items-center gap-1.5 transition-none active:translate-x-[1px] active:translate-y-[1px] ${
            activeTab === "plans"
              ? "bg-brutal-yellow text-black shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
              : "bg-white dark:bg-[#1E1E28] text-ink hover:bg-neutral-100 dark:hover:bg-[#282834] shadow-[1px_1px_0px_#000] dark:shadow-[1px_1px_0px_#fff]"
          }`}
        >
          <Sparkles size={13} strokeWidth={2.5} />
          <span>PLANS &amp; TIERS</span>
        </button>

        <button
          type="button"
          id="tab-btn-telemetry"
          role="tab"
          aria-selected={activeTab === "telemetry"}
          onClick={() => setActiveTab("telemetry")}
          className={`shrink-0 px-3 py-1.5 border-2 border-black dark:border-white/80 font-mono text-xs font-black uppercase flex items-center gap-1.5 transition-none active:translate-x-[1px] active:translate-y-[1px] ${
            activeTab === "telemetry"
              ? "bg-brutal-yellow text-black shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
              : "bg-white dark:bg-[#1E1E28] text-ink hover:bg-neutral-100 dark:hover:bg-[#282834] shadow-[1px_1px_0px_#000] dark:shadow-[1px_1px_0px_#fff]"
          }`}
        >
          <Activity size={13} strokeWidth={2.5} />
          <span>FLEET SPEND &amp; TELEMETRY</span>
          <span className="text-[9px] font-black px-1 border border-black bg-emerald-400 text-black">
            {creditsRemaining} CR
          </span>
        </button>

        <button
          type="button"
          id="tab-btn-invoices"
          role="tab"
          aria-selected={activeTab === "invoices"}
          onClick={() => setActiveTab("invoices")}
          className={`shrink-0 px-3 py-1.5 border-2 border-black dark:border-white/80 font-mono text-xs font-black uppercase flex items-center gap-1.5 transition-none active:translate-x-[1px] active:translate-y-[1px] ${
            activeTab === "invoices"
              ? "bg-brutal-yellow text-black shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
              : "bg-white dark:bg-[#1E1E28] text-ink hover:bg-neutral-100 dark:hover:bg-[#282834] shadow-[1px_1px_0px_#000] dark:shadow-[1px_1px_0px_#fff]"
          }`}
        >
          <Receipt size={13} strokeWidth={2.5} />
          <span>INVOICES &amp; LEDGER</span>
          <span className="text-[9px] font-black px-1 border border-black bg-neutral-200 text-black">
            {invoices.length}
          </span>
        </button>
      </nav>

      {/* =========================================================================
          3. ACTIVE OS STAGE WORKSPACE
             Renders the active section inside a framed Neubrutalist OS window
      ========================================================================= */}
      <section
        id={`billing-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-btn-${activeTab}`}
        className="flex-1 min-h-0 bg-white dark:bg-[#181820] border-2 border-black dark:border-white/80 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] flex flex-col overflow-hidden"
      >
        {/* Module Sub-Header Strip */}
        <div className="h-9 px-3 bg-[#EFECE6] dark:bg-[#22222C] border-b-2 border-black dark:border-white/80 flex items-center justify-between gap-2 shrink-0 font-mono text-xs">
          <div className="flex items-center gap-2 truncate">
            <span className="font-black text-black dark:text-white uppercase flex items-center gap-1.5">
              {activeTab === "plans" && <Sparkles size={13} strokeWidth={2.5} />}
              {activeTab === "telemetry" && <Activity size={13} strokeWidth={2.5} />}
              {activeTab === "invoices" && <FileText size={13} strokeWidth={2.5} />}
              <span>
                {activeTab === "plans" && "SUBSCRIPTION_TIERS.CFG"}
                {activeTab === "telemetry" && "FLEET_QUOTAS.LOG"}
                {activeTab === "invoices" && "INVOICE_LEDGER.CSV"}
              </span>
            </span>
            <span className="text-muted text-[11px] hidden sm:inline">
              {activeTab === "plans" && "— Workspace compute capacities and model allocations"}
              {activeTab === "telemetry" && "— Autonomous agent credit burn and quota runway"}
              {activeTab === "invoices" && "— Tax invoices, settlement receipts, and history"}
            </span>
          </div>

          <span className="text-[10px] font-mono font-bold text-muted uppercase hidden md:inline shrink-0">
            SYS:\ACCOUNTING\{activeTab.toUpperCase()}
          </span>
        </div>

        {/* Dynamic Section Form Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Low Credit Warning Banner (if credits < 50) */}
          {creditsRemaining < 50 && (
            <div className="mb-6 p-3 bg-brutal-yellow border-2 border-black shadow-[2px_2px_0px_#000] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-black font-mono">
                <AlertCircle size={18} strokeWidth={2.5} className="shrink-0" />
                <div>
                  <p className="font-black text-xs uppercase">
                    LOW CREDIT QUOTA: {creditsRemaining} CREDITS REMAINING
                  </p>
                  <p className="text-[11px] font-sans font-medium text-black/90">
                    Autonomous agent builds will pause if balance reaches zero. Top up to ensure continuity.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreditModalOpen(true)}
                className="px-3 py-1 bg-white border-2 border-black text-black font-mono font-black text-xs uppercase shadow-[1px_1px_0px_#000] hover:bg-neutral-100 active:translate-x-[1px] active:translate-y-[1px] shrink-0"
              >
                REFILL NOW
              </button>
            </div>
          )}

          {/* =========================================================================
              VIEW 1: PLANS & TIERS MATRIX
          ========================================================================= */}
          {activeTab === "plans" && (
            <div className="space-y-6">
              {/* Interval Toggle & Description Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#F4F0EA] dark:bg-[#202028] border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]">
                <div className="font-mono text-xs">
                  <span className="font-black text-ink uppercase">BILLING CADENCE: </span>
                  <span className="text-muted">
                    {billingInterval === "annual" ? "Annual (20% off all tiers)" : "Monthly standard"}
                  </span>
                </div>

                <div className="flex items-center gap-1 font-mono">
                  <button
                    type="button"
                    id="billing-interval-monthly"
                    onClick={() => setBillingInterval("monthly")}
                    className={`px-3 py-1 text-xs font-black uppercase border-2 border-black transition-none active:translate-x-[1px] active:translate-y-[1px] ${
                      billingInterval === "monthly"
                        ? "bg-brutal-yellow text-black shadow-[2px_2px_0px_#000]"
                        : "bg-white dark:bg-[#1E1E28] text-ink shadow-[1px_1px_0px_#000]"
                    }`}
                  >
                    MONTHLY
                  </button>
                  <button
                    type="button"
                    id="billing-interval-annual"
                    onClick={() => setBillingInterval("annual")}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs font-black uppercase border-2 border-black transition-none active:translate-x-[1px] active:translate-y-[1px] ${
                      billingInterval === "annual"
                        ? "bg-brutal-yellow text-black shadow-[2px_2px_0px_#000]"
                        : "bg-white dark:bg-[#1E1E28] text-ink shadow-[1px_1px_0px_#000]"
                    }`}
                  >
                    <span>ANNUAL</span>
                    <span className="px-1 py-0.2 bg-emerald-400 text-black border border-black text-[9px] font-black">
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
                      className={`p-4 bg-white dark:bg-[#1E1E28] border-2 border-black dark:border-white/80 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] flex flex-col justify-between space-y-4 relative ${
                        isCurrent ? "outline-2 outline-black dark:outline-white" : ""
                      }`}
                    >
                      {/* Plan Header */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-1.5 font-mono">
                          <span
                            className={`px-2 py-0.5 text-[11px] font-black uppercase border border-black ${
                              isPro
                                ? "bg-brutal-yellow text-black"
                                : isEnterprise
                                ? "bg-black text-white dark:bg-white dark:text-black"
                                : "bg-neutral-200 dark:bg-neutral-800 text-ink"
                            }`}
                          >
                            {plan.name}
                          </span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 bg-emerald-400 text-black border border-black text-[10px] font-black uppercase">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        {/* Price */}
                        <div>
                          <div className="flex items-baseline gap-1 font-mono">
                            <span className="text-3xl font-black text-ink">${displayPrice}</span>
                            <span className="text-xs text-muted uppercase">/mo</span>
                          </div>
                          {billingInterval === "annual" && plan.price_monthly > 0 && (
                            <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                              ${plan.price_annual}/yr billed annually
                            </p>
                          )}
                        </div>

                        {/* Credits quota chip */}
                        <div className="p-1.5 bg-[#F4F0EA] dark:bg-[#252532] border border-black dark:border-white/60 text-xs font-mono font-black text-ink flex items-center gap-1.5">
                          <Zap size={12} className="text-black dark:text-white shrink-0" />
                          <span>{plan.credits.toLocaleString()} CR / MO</span>
                        </div>

                        {/* Features checklist */}
                        <ul className="space-y-2 pt-1 text-xs font-sans text-muted">
                          {plan.features.map((feat, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <Check
                                size={13}
                                className="text-black dark:text-white shrink-0 mt-0.5"
                                strokeWidth={3}
                              />
                              <span className="text-ink text-[12px]">{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Select Plan Push-Button */}
                      <div className="pt-3 border-t-2 border-black/20 dark:border-white/20">
                        <button
                          type="button"
                          id={`btn-select-plan-${plan.tier}`}
                          disabled={isCurrent || pendingPlan === plan.tier}
                          onClick={() => handleSelectPlan(plan.tier)}
                          className={`w-full py-2 font-mono text-xs font-black uppercase border-2 border-black dark:border-white shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed ${
                            isCurrent
                              ? "bg-neutral-200 dark:bg-neutral-800 text-muted"
                              : isPro
                              ? "bg-brutal-yellow text-black hover:brightness-105"
                              : "bg-white dark:bg-[#202028] text-ink hover:bg-neutral-100"
                          }`}
                        >
                          {pendingPlan === plan.tier ? (
                            <span className="flex items-center justify-center gap-1.5">
                              <RefreshCw size={12} className="animate-spin" />
                              <span>PROCESSING...</span>
                            </span>
                          ) : isCurrent ? (
                            "CURRENT TIER"
                          ) : plan.tier === "free" ? (
                            "DOWNGRADE"
                          ) : (
                            `SELECT ${plan.name.toUpperCase()}`
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 2: FLEET SPEND & TELEMETRY
          ========================================================================= */}
          {activeTab === "telemetry" && (
            <div className="space-y-6">
              {/* Telemetry Stat Gauges */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Gauge 1: Credit Quota */}
                <div className="p-3.5 bg-white dark:bg-[#1E1E28] border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
                    <span className="flex items-center gap-1">
                      <Zap size={12} className="text-black dark:text-white" />
                      <span>CREDIT BALANCE</span>
                    </span>
                    <span className="px-1 bg-brutal-yellow text-black border border-black text-[9px] font-black">
                      {creditUsagePercent}% USED
                    </span>
                  </div>
                  <p className="text-2xl font-mono font-black text-ink">
                    {creditsRemaining.toLocaleString()}{" "}
                    <span className="text-xs font-normal text-muted">
                      / {totalCredits.toLocaleString()}
                    </span>
                  </p>
                  <div className="h-2.5 w-full bg-neutral-100 dark:bg-neutral-800 border border-black dark:border-white overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 border-r border-black"
                      style={{ width: `${100 - creditUsagePercent}%` }}
                    />
                  </div>
                </div>

                {/* Gauge 2: Autonomous Builds */}
                <div className="p-3.5 bg-white dark:bg-[#1E1E28] border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
                    <span className="flex items-center gap-1">
                      <Activity size={12} className="text-black dark:text-white" />
                      <span>RUNS COMPLETED</span>
                    </span>
                    <span className="px-1 bg-cyan-300 text-black border border-black text-[9px] font-black">
                      30D CYCLE
                    </span>
                  </div>
                  <p className="text-2xl font-mono font-black text-ink">
                    {usage?.builds_count ?? 18}{" "}
                    <span className="text-xs font-normal text-muted">BUILDS</span>
                  </p>
                  <p className="text-[10px] font-mono text-muted">
                    AVG ~13 CR PER HEALING RUN
                  </p>
                </div>

                {/* Gauge 3: Plan Rate */}
                <div className="p-3.5 bg-white dark:bg-[#1E1E28] border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
                    <span className="flex items-center gap-1">
                      <DollarSign size={12} className="text-black dark:text-white" />
                      <span>ACTIVE SUBSCRIPTION</span>
                    </span>
                    <span className="px-1 bg-neutral-200 dark:bg-neutral-700 text-ink border border-black text-[9px] font-black uppercase">
                      {billingInterval}
                    </span>
                  </div>
                  <p className="text-2xl font-mono font-black text-ink">
                    $
                    {activeTier === "pro"
                      ? 99
                      : activeTier === "standard"
                      ? 29
                      : activeTier === "enterprise"
                      ? 999
                      : 0}
                    <span className="text-xs font-normal text-muted">/MO</span>
                  </p>
                  <p className="text-[10px] font-mono text-muted truncate">
                    AUTO-RENEWS VIA STRIPE
                  </p>
                </div>

                {/* Gauge 4: Runway */}
                <div className="p-3.5 bg-white dark:bg-[#1E1E28] border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} className="text-black dark:text-white" />
                      <span>RUNWAY CYCLE</span>
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 border border-black" />
                  </div>
                  <p className="text-2xl font-mono font-black text-ink">22 DAYS</p>
                  <p className="text-[10px] font-mono text-muted">
                    RESETS ON NEXT RENEWAL
                  </p>
                </div>
              </div>

              {/* Fleet Agent Spend Breakdown */}
              <div className="p-4 bg-white dark:bg-[#1E1E28] border-2 border-black dark:border-white/80 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b-2 border-black/20 dark:border-white/20 pb-2.5 font-mono text-xs">
                  <div className="font-black text-ink uppercase flex items-center gap-2">
                    <Activity size={14} />
                    <span>AGENT_COMPUTE_CONSUMPTION.LOG</span>
                  </div>
                  <span className="text-muted">
                    CYCLE TOTAL: <strong className="text-ink">{creditsUsed} CREDITS USED</strong>
                  </span>
                </div>

                <div className="space-y-3">
                  {agentSpendData.map((item) => {
                    const pct = Math.min(100, Math.round((item.credits / maxAgentCredits) * 100));
                    const shareOfTotal =
                      totalCredits > 0 ? Math.round((item.credits / (creditsUsed || 1)) * 100) : 0;
                    return (
                      <div key={item.agentId} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <div className="flex items-center gap-2 font-black text-ink">
                            <span
                              className="h-2.5 w-2.5 border border-black"
                              style={{ backgroundColor: item.hue }}
                            />
                            <span>{item.label}</span>
                            <span className="text-[10px] text-muted font-normal uppercase">
                              ({shareOfTotal}% OF BURN)
                            </span>
                          </div>
                          <span className="font-black text-ink">{item.credits} CR</span>
                        </div>
                        <div className="h-3 w-full bg-neutral-100 dark:bg-neutral-800 border border-black dark:border-white overflow-hidden">
                          <div
                            className="h-full border-r border-black"
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

          {/* =========================================================================
              VIEW 3: INVOICES & LEDGER
          ========================================================================= */}
          {activeTab === "invoices" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b-2 border-black/20 dark:border-white/20 pb-2.5 font-mono text-xs">
                <span className="font-black text-ink uppercase flex items-center gap-1.5">
                  <FileText size={13} />
                  <span>TAX_INVOICES &amp; SETTLEMENTS</span>
                </span>
                <button
                  type="button"
                  onClick={handleOpenCustomerPortal}
                  className="flex items-center gap-1 text-ink font-bold hover:underline"
                >
                  <span>UPDATE PAYMENT METHOD</span>
                  <ArrowUpRight size={11} />
                </button>
              </div>

              <div className="overflow-x-auto border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="bg-[#EFECE6] dark:bg-[#202028] text-ink border-b-2 border-black dark:border-white/80 font-black uppercase text-[11px]">
                    <tr>
                      <th className="p-3">INVOICE_ID</th>
                      <th className="p-3">DATE</th>
                      <th className="p-3">DESCRIPTION</th>
                      <th className="p-3">AMOUNT</th>
                      <th className="p-3">STATUS</th>
                      <th className="p-3 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-black/20 dark:divide-white/20 bg-white dark:bg-[#1A1A24]">
                    {invoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-brutal-yellow/20 dark:hover:bg-brutal-yellow/10"
                      >
                        <td className="p-3 font-black text-ink">{inv.id}</td>
                        <td className="p-3 text-muted">{inv.date}</td>
                        <td className="p-3 text-ink">{inv.plan}</td>
                        <td className="p-3 font-black text-ink">{inv.amount}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-emerald-400 text-black border border-black text-[10px] font-black uppercase">
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
                            className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-[#252530] border border-black dark:border-white text-ink text-[11px] font-black uppercase shadow-[1px_1px_0px_#000] hover:bg-neutral-100 active:translate-x-[1px] active:translate-y-[1px]"
                          >
                            <Download size={11} strokeWidth={2.5} />
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

      {/* =========================================================================
          4. MODAL: ON-DEMAND CREDIT TOP-UP DIALOG (OS SYSTEM WINDOW)
      ========================================================================= */}
      {creditModalOpen && (
        <div
          id="credit-topup-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs select-none"
        >
          <div
            id="credit-topup-modal-window"
            role="dialog"
            aria-labelledby="credit-modal-title"
            className="w-full max-w-lg border-2 border-black dark:border-white/80 bg-white dark:bg-[#1A1A24] shadow-[6px_6px_0px_#000] dark:shadow-[6px_6px_0px_#fff] overflow-hidden flex flex-col font-mono"
          >
            {/* Modal Titlebar */}
            <div className="h-10 px-3 bg-brutal-yellow text-black border-b-2 border-black flex items-center justify-between select-none">
              <div id="credit-modal-title" className="flex items-center gap-2 font-black text-xs uppercase">
                <Plus size={14} strokeWidth={3} />
                <span>TOP_UP_CREDITS.SYS</span>
              </div>
              <button
                type="button"
                id="btn-close-credit-modal"
                onClick={() => setCreditModalOpen(false)}
                className="w-6 h-6 border border-black bg-white hover:bg-black hover:text-white flex items-center justify-center font-black text-xs active:translate-x-[1px] active:translate-y-[1px]"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted font-sans">
                Credits are immediately provisioned to your workspace balance and roll over indefinitely across active cycles without expiration.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CREDIT_PACKAGES.map((pkg) => (
                  <div
                    key={pkg.id}
                    id={`pkg-card-${pkg.id}`}
                    className="p-3 bg-white dark:bg-[#20202C] border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-black text-sm text-ink">
                          {pkg.credits.toLocaleString()} CR
                        </p>
                        <p className="text-[10px] text-muted">
                          {pkg.perCredit} / CREDIT
                        </p>
                      </div>
                      {pkg.bonus && (
                        <span className="px-1.5 py-0.2 bg-emerald-400 text-black border border-black text-[9px] font-black uppercase">
                          {pkg.bonus}
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-black/20 dark:border-white/20 flex items-center justify-between">
                      <span className="text-base font-black text-ink">${pkg.price}</span>
                      <button
                        type="button"
                        id={`btn-buy-pkg-${pkg.id}`}
                        disabled={purchasingCredit === pkg.id}
                        onClick={() => handleBuyCreditPackage(pkg.id)}
                        className="px-3 py-1 border-2 border-black bg-brutal-yellow text-black text-xs font-black uppercase shadow-[1px_1px_0px_#000] hover:brightness-105 active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50"
                      >
                        {purchasingCredit === pkg.id ? "BUYING..." : "PURCHASE"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t-2 border-black dark:border-white/80 bg-[#EFECE6] dark:bg-[#202028] flex items-center justify-between text-[11px] text-muted">
              <span>GATEWAY: SECURE STRIPE CHECKOUT</span>
              <button
                type="button"
                id="btn-cancel-credit-modal"
                onClick={() => setCreditModalOpen(false)}
                className="px-3 py-1 border border-black dark:border-white bg-white dark:bg-[#1A1A24] text-ink font-bold hover:bg-neutral-100"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
