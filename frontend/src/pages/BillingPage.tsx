import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import toast from "react-hot-toast";
import { motion, useReducedMotion } from "motion/react";
import { motionVariants } from "../lib/animations";
import { presets } from "../lib/animationPresets";
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
  price_annual: number;
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
  const reduceMotion = useReducedMotion();
  const [rawPlans, setRawPlans] = useState<RawPlan[] | null>(null);
  const [usage, setUsage] = useState<RawUsage | null>(null);
  const [subscription, setSubscription] = useState<RawSubscription | null | undefined>(undefined);
  const [pending, setPending] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "annual">("monthly");

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
          interval: billingInterval,
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
    <motion.div
      className="px-4 py-5 md:px-8 md:py-6 max-w-4xl mx-auto"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <header className="mb-8">
        <p className="text-sm text-muted">
          {LIVE_MODE
            ? subscription?.current_period_end
              ? `Renews ${new Date(subscription.current_period_end).toLocaleDateString()} · ${activeTier} plan`
              : `${activeTier} plan`
            : "Renews Aug 1, 2026 · Pro plan"}
        </p>
      </header>

      {/* Usage stats */}
      <section aria-label="Usage this month" className="mb-12 pb-12 border-b border-border">
        <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-4">
          Usage this month
        </h2>
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border border-border"
          variants={reduceMotion ? undefined : motionVariants.staggerContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
        >
          {LIVE_MODE ? (
            usage ? (
              <>
                <motion.div className="bg-base p-4" variants={motionVariants.staggerItem}>
                  <p className="text-xs text-faint mb-1">Credits used</p>
                  <p className="text-2xl font-medium text-ink">
                    {usage.credits_used} / {usage.credits_used + usage.credits_remaining}
                  </p>
                </motion.div>
                <motion.div className="bg-base p-4" variants={motionVariants.staggerItem}>
                  <p className="text-xs text-faint mb-1">Credits remaining</p>
                  <p className="text-2xl font-medium text-ink">{usage.credits_remaining}</p>
                </motion.div>
                <motion.div className="bg-base p-4" variants={motionVariants.staggerItem}>
                  <p className="text-xs text-faint mb-1">Builds this month</p>
                  <p className="text-2xl font-medium text-ink">{usage.builds_count}</p>
                </motion.div>
              </>
            ) : (
              <p className="text-sm text-faint">Loading…</p>
            )
          ) : (
            USAGE_STATS.map(stat => (
              <motion.div key={stat.label} className="bg-base p-4" variants={motionVariants.staggerItem}>
                <p className="text-xs text-faint mb-1">{stat.label}</p>
                <p className={`text-2xl font-medium ${TONE_CLASS[stat.tone]}`}>{stat.value}</p>
                <p className="text-xs text-faint mt-1">{stat.sub}</p>
              </motion.div>
            ))
          )}
        </motion.div>
      </section>

      {/* Credits/Builds by agent */}
      <section aria-label={LIVE_MODE ? "Builds by agent" : "Credits by agent"} className="mb-12 pb-12 border-b border-border">
        <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-4">
          {LIVE_MODE ? "Builds by agent" : "Credits by agent"}
        </h2>
        <motion.div
          className="space-y-3"
          variants={reduceMotion ? undefined : motionVariants.staggerContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
        >
          {LIVE_MODE
            ? usage &&
              Object.entries(usage.agents_runs).map(([agentId, runs]) => {
                const agent = agentById(agentId as any);
                if (!agent) return null;
                const pct = (runs / maxRuns) * 100;
                return (
                  <motion.div key={agentId} className="flex items-center gap-3" variants={motionVariants.staggerItem}>
                    <span className="text-xs text-muted w-24 shrink-0">{agent.label}</span>
                    <div
                      className="flex-1 h-px bg-border overflow-hidden"
                      role="progressbar"
                      aria-valuenow={runs}
                      aria-valuemin={0}
                      aria-valuemax={maxRuns}
                      aria-label={`${agent.label}: ${runs} builds`}
                    >
                      <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-xs text-faint w-8 text-right">{runs}</span>
                  </motion.div>
                );
              })
            : AGENT_SPEND.map(({ agent: agentId, credits }) => {
                const agent = agentById(agentId);
                if (!agent) return null;
                const pct = (credits / maxSpend) * 100;
                return (
                  <motion.div key={agentId} className="flex items-center gap-3" variants={motionVariants.staggerItem}>
                    <span className="text-xs text-muted w-24 shrink-0">{agent.label}</span>
                    <div
                      className="flex-1 h-px bg-border overflow-hidden"
                      role="progressbar"
                      aria-valuenow={credits}
                      aria-valuemin={0}
                      aria-valuemax={maxSpend}
                      aria-label={`${agent.label}: ${credits} credits`}
                    >
                      <div className="h-full bg-ink" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-xs text-faint w-8 text-right">{credits}</span>
                  </motion.div>
                );
              })}
        </motion.div>
      </section>

      {/* Plans */}
      <section aria-label="Plans">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xs font-medium text-faint uppercase tracking-wide">Plans</h2>
          {LIVE_MODE && (
            <div role="radiogroup" aria-label="Billing interval" className="flex items-center gap-4 text-xs">
              <button
                type="button"
                role="radio"
                aria-checked={billingInterval === "monthly"}
                onClick={() => setBillingInterval("monthly")}
                className={[
                  "pb-1 border-b transition-colors motion-reduce:transition-none",
                  billingInterval === "monthly" ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
                ].join(" ")}
              >
                Monthly
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={billingInterval === "annual"}
                onClick={() => setBillingInterval("annual")}
                className={[
                  "pb-1 border-b transition-colors motion-reduce:transition-none",
                  billingInterval === "annual" ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
                ].join(" ")}
              >
                Annual
              </button>
            </div>
          )}
        </div>
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border border border-border"
          variants={reduceMotion ? undefined : motionVariants.staggerContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
        >
          {LIVE_MODE
            ? rawPlans?.map(plan => (
                <RawPlanCard
                  key={plan.tier}
                  plan={plan}
                  interval={billingInterval}
                  active={plan.tier === activeTier}
                  pending={pending === plan.tier}
                  onSelect={() => handleSelectPlan(plan.tier)}
                />
              ))
            : PLANS.map(plan => <PlanCard key={plan.name} plan={plan} />)}
        </motion.div>
      </section>
    </motion.div>
  );
}

function RawPlanCard({
  plan,
  interval,
  active,
  pending,
  onSelect,
}: {
  plan: RawPlan;
  interval: "monthly" | "annual";
  active: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  const displayPrice = interval === "annual" ? Math.round(plan.price_annual / 12) : plan.price_monthly;
  return (
    <motion.div className="relative bg-base p-6 flex flex-col gap-4" {...presets.card} variants={motionVariants.staggerItem}>
      {active && <div className="absolute top-0 left-0 right-0 h-px bg-ink" aria-hidden="true" />}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-faint">{plan.credits} credits</p>
          <p className="font-display text-3xl font-medium tracking-tight text-ink mt-1">
            ${displayPrice}
            <span className="text-sm font-normal text-muted">/mo</span>
          </p>
          {interval === "annual" && plan.price_monthly > 0 && (
            <p className="text-[11px] text-muted mt-0.5">
              ${plan.price_annual}/yr — save ${plan.price_monthly * 12 - plan.price_annual}
            </p>
          )}
          <p className="text-sm font-medium text-ink mt-1.5">{plan.name}</p>
        </div>
        {active && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border text-muted shrink-0">
            Active
          </span>
        )}
      </div>

      <ul className="space-y-2 flex-1" aria-label={`${plan.name} plan features`}>
        {plan.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-xs text-muted">
            <Check size={11} className="text-faint shrink-0" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>

      <motion.button
        disabled={active || pending}
        onClick={onSelect}
        {...presets.button}
        className={[
          "w-full h-10 rounded-md text-sm font-medium border",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40",
          "transition-colors motion-reduce:transition-none disabled:opacity-60",
          active ? "border-border text-muted cursor-default" : "border-ink text-ink hover:bg-ink hover:text-base",
        ].join(" ")}
        aria-disabled={active || pending}
      >
        {active ? "Current plan" : pending ? "Redirecting…" : plan.tier === "free" ? "Downgrade" : `Choose ${plan.name}`}
      </motion.button>
    </motion.div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <motion.div className="relative bg-base p-6 flex flex-col gap-4" {...presets.card} variants={motionVariants.staggerItem}>
      {plan.active && <div className="absolute top-0 left-0 right-0 h-px bg-ink" aria-hidden="true" />}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-faint">{plan.credits}</p>
          <p className="font-display text-3xl font-medium tracking-tight text-ink mt-1">
            {plan.price}
            <span className="text-sm font-normal text-muted">/mo</span>
          </p>
          <p className="text-sm font-medium text-ink mt-1.5">{plan.name}</p>
        </div>
        {plan.active && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border text-muted shrink-0">
            Active
          </span>
        )}
      </div>

      <ul className="space-y-2 flex-1" aria-label={`${plan.name} plan features`}>
        {plan.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-xs text-muted">
            <Check size={11} className="text-faint shrink-0" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>

      <motion.button
        disabled={plan.active}
        onClick={() => {/* subscription action — no-op until backend (demo mode) */}}
        {...presets.button}
        className={[
          "w-full h-10 rounded-md text-sm font-medium border",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40",
          "transition-colors motion-reduce:transition-none",
          plan.active
            ? "border-border text-muted cursor-default"
            : "border-ink text-ink hover:bg-ink hover:text-base",
        ].join(" ")}
        aria-disabled={plan.active}
      >
        {plan.cta}
      </motion.button>
    </motion.div>
  );
}
