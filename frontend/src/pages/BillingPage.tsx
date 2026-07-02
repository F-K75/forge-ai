import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import { USAGE_STATS, AGENT_SPEND, PLANS } from "../lib/mockData";
import type { UsageStat, Plan } from "../lib/mockData";
import { agentById } from "../lib/agents";
import { LIVE_MODE } from "../lib/env";
import { billingApi } from "../lib/api";

const TONE_CLASS: Record<UsageStat["tone"], string> = {
  accent: "text-accent",
  info:   "text-agent-developer",
  ok:     "text-ok",
};

interface RawPlan {
  tier: string;
  name: string;
  price_monthly: number;
  credits: number;
  features: string[];
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
}

export default function BillingPage() {
  const [rawPlans, setRawPlans] = useState<RawPlan[] | null>(null);
  const [usage, setUsage] = useState<RawUsage | null>(null);
  const [subscription, setSubscription] = useState<RawSubscription | null | undefined>(undefined);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!LIVE_MODE) return;
    billingApi.plans().then(setRawPlans).catch(() => toast.error("Failed to load plans"));
    billingApi.usage().then(setUsage).catch(() => toast.error("Failed to load usage"));
    billingApi.subscription().then(setSubscription).catch(() => setSubscription(null));
  }, []);

  const activeTier = subscription?.plan ?? "free";

  const handleSelectPlan = async (tier: string) => {
    setPending(tier);
    try {
      if (tier === "free") {
        await billingApi.downgrade(tier);
        toast.success("Downgrade scheduled for the end of your billing period");
      } else {
        const res = await billingApi.checkout({
          plan: tier,
          success_url: window.location.href,
          cancel_url: window.location.href,
        });
        window.location.href = res.url;
      }
    } catch {
      toast.error("Couldn't update your plan");
    } finally {
      setPending(null);
    }
  };

  const maxSpend = Math.max(...AGENT_SPEND.map(a => a.credits));
  const maxRuns = usage ? Math.max(1, ...Object.values(usage.agents_runs)) : 1;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <header>
        <h1 className="text-xl font-semibold text-ink">Billing</h1>
        <p className="text-sm text-muted mt-0.5">
          {LIVE_MODE
            ? subscription?.current_period_end
              ? `Renews ${new Date(subscription.current_period_end).toLocaleDateString()} · ${activeTier} plan`
              : `${activeTier} plan`
            : "Renews Aug 1, 2026 · Pro plan"}
        </p>
      </header>

      {/* Usage stats */}
      <section aria-label="Usage this month">
        <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-3">
          Usage this month
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {LIVE_MODE ? (
            usage ? (
              <>
                <div className="bg-panel border border-border rounded-xl p-4">
                  <p className="text-xs text-faint mb-1">Credits used</p>
                  <p className="text-2xl font-semibold text-accent">
                    {usage.credits_used} / {usage.credits_used + usage.credits_remaining}
                  </p>
                </div>
                <div className="bg-panel border border-border rounded-xl p-4">
                  <p className="text-xs text-faint mb-1">Credits remaining</p>
                  <p className="text-2xl font-semibold text-ok">{usage.credits_remaining}</p>
                </div>
                <div className="bg-panel border border-border rounded-xl p-4">
                  <p className="text-xs text-faint mb-1">Builds this month</p>
                  <p className="text-2xl font-semibold text-agent-developer">{usage.builds_count}</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-faint">Loading…</p>
            )
          ) : (
            USAGE_STATS.map(stat => (
              <div key={stat.label} className="bg-panel border border-border rounded-xl p-4">
                <p className="text-xs text-faint mb-1">{stat.label}</p>
                <p className={`text-2xl font-semibold ${TONE_CLASS[stat.tone]}`}>{stat.value}</p>
                <p className="text-xs text-faint mt-1">{stat.sub}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Credits/Builds by agent */}
      <section aria-label={LIVE_MODE ? "Builds by agent" : "Credits by agent"}>
        <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-3">
          {LIVE_MODE ? "Builds by agent" : "Credits by agent"}
        </h2>
        <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
          {LIVE_MODE
            ? usage &&
              Object.entries(usage.agents_runs).map(([agentId, runs]) => {
                const agent = agentById(agentId as any);
                if (!agent) return null;
                const pct = (runs / maxRuns) * 100;
                return (
                  <div key={agentId} className="flex items-center gap-3">
                    <span className="text-xs text-muted w-24 shrink-0">{agent.label}</span>
                    <div
                      className="flex-1 h-1.5 bg-panel-alt rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={runs}
                      aria-valuemin={0}
                      aria-valuemax={maxRuns}
                      aria-label={`${agent.label}: ${runs} builds`}
                    >
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: agent.hue }} />
                    </div>
                    <span className="font-mono text-xs text-faint w-8 text-right">{runs}</span>
                  </div>
                );
              })
            : AGENT_SPEND.map(({ agent: agentId, credits }) => {
                const agent = agentById(agentId);
                if (!agent) return null;
                const pct = (credits / maxSpend) * 100;
                return (
                  <div key={agentId} className="flex items-center gap-3">
                    <span className="text-xs text-muted w-24 shrink-0">{agent.label}</span>
                    <div
                      className="flex-1 h-1.5 bg-panel-alt rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={credits}
                      aria-valuemin={0}
                      aria-valuemax={maxSpend}
                      aria-label={`${agent.label}: ${credits} credits`}
                    >
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: agent.hue }} />
                    </div>
                    <span className="font-mono text-xs text-faint w-8 text-right">{credits}</span>
                  </div>
                );
              })}
        </div>
      </section>

      {/* Plans */}
      <section aria-label="Plans">
        <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-3">Plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {LIVE_MODE
            ? rawPlans?.map(plan => (
                <RawPlanCard
                  key={plan.tier}
                  plan={plan}
                  active={plan.tier === activeTier}
                  pending={pending === plan.tier}
                  onSelect={() => handleSelectPlan(plan.tier)}
                />
              ))
            : PLANS.map(plan => <PlanCard key={plan.name} plan={plan} />)}
        </div>
      </section>
    </div>
  );
}

function RawPlanCard({
  plan,
  active,
  pending,
  onSelect,
}: {
  plan: RawPlan;
  active: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={[
        "rounded-xl border p-5 flex flex-col gap-4",
        active ? "border-accent bg-gradient-to-b from-accent-soft to-panel" : "border-border bg-panel",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-faint">{plan.credits} credits</p>
          <p className="text-2xl font-bold text-ink mt-0.5">
            ${plan.price_monthly}
            <span className="text-sm font-normal text-muted">/mo</span>
          </p>
          <p className="text-sm font-semibold text-ink mt-0.5">{plan.name}</p>
        </div>
        {active && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/20 text-accent shrink-0">
            Active
          </span>
        )}
      </div>

      <ul className="space-y-2 flex-1" aria-label={`${plan.name} plan features`}>
        {plan.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-xs text-muted">
            <Check size={11} className="text-ok shrink-0" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>

      <button
        disabled={active || pending}
        onClick={onSelect}
        className={[
          "w-full py-2 rounded-lg text-sm font-medium",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          "transition-colors motion-reduce:transition-none disabled:opacity-60",
          active ? "bg-accent/10 text-accent cursor-default" : "bg-panel-alt border border-border text-ink hover:border-accent/50",
        ].join(" ")}
        aria-disabled={active || pending}
      >
        {active ? "Current plan" : pending ? "Redirecting…" : plan.tier === "free" ? "Downgrade" : `Choose ${plan.name}`}
      </button>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={[
        "rounded-xl border p-5 flex flex-col gap-4",
        plan.active
          ? "border-accent bg-gradient-to-b from-accent-soft to-panel"
          : "border-border bg-panel",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-faint">{plan.credits}</p>
          <p className="text-2xl font-bold text-ink mt-0.5">
            {plan.price}
            <span className="text-sm font-normal text-muted">/mo</span>
          </p>
          <p className="text-sm font-semibold text-ink mt-0.5">{plan.name}</p>
        </div>
        {plan.active && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/20 text-accent shrink-0">
            Active
          </span>
        )}
      </div>

      <ul className="space-y-2 flex-1" aria-label={`${plan.name} plan features`}>
        {plan.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-xs text-muted">
            <Check size={11} className="text-ok shrink-0" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>

      <button
        disabled={plan.active}
        onClick={() => {/* subscription action — no-op until backend (demo mode) */}}
        className={[
          "w-full py-2 rounded-lg text-sm font-medium",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          "transition-colors motion-reduce:transition-none",
          plan.active
            ? "bg-accent/10 text-accent cursor-default"
            : "bg-panel-alt border border-border text-ink hover:border-accent/50",
        ].join(" ")}
        aria-disabled={plan.active}
      >
        {plan.cta}
      </button>
    </div>
  );
}
