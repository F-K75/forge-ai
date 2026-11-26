import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "../ui";
import { PillLink } from "./PillLink";
import { Reveal, TwoTone } from "./Reveal";
import { PLANS } from "./landingContent";
import { GRAIN, atmosphere, type Hue } from "./atmosphere";

type Period = "monthly" | "yearly";
const HUES: Hue[] = ["olive", "rust", "teal"];

export function PricingSection() {
  const [period, setPeriod] = useState<Period>("monthly");

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 px-5 pb-28 sm:px-8 sm:pb-36">
      <Reveal>
        <TwoTone id="pricing-title" lead="Simple, credit-based pricing." rest="Start free, scale when it ships." />
      </Reveal>

      <Reveal delay={0.05} className="mt-10 flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-pill border border-border-soft bg-ink/[0.06] p-1">
          {(["monthly", "yearly"] as const).map((p) => {
            const on = period === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPeriod(p)}
                className={`rounded-pill px-4 py-1.5 text-[14px] font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  on ? "bg-ink text-base" : "text-ink/80 hover:text-ink"
                }`}
              >
                {p === "monthly" ? "Monthly" : "Yearly"}
                {p === "yearly" && <span className={`ml-1.5 text-[12px] ${on ? "text-base/70" : "text-muted"}`}>2 months free</span>}
              </button>
            );
          })}
        </div>
      </Reveal>

      <ul className="mx-auto mt-10 grid max-w-[1120px] gap-4 md:grid-cols-3">
        {PLANS.map((plan, i) => {
          const price = period === "monthly" ? plan.monthly : plan.yearly;
          return (
            <li key={plan.tier}>
              <Reveal
                delay={i * 0.06}
                className={`flex h-full flex-col rounded-2xl border bg-panel p-5 sm:p-6 ${plan.featured ? "border-ink/25" : "border-border"}`}
              >
                <div className="flex items-center justify-between">
                  <Badge variant="accent" size="lg">
                    {plan.name}
                  </Badge>
                  {plan.featured && <span className="text-[12px] text-muted">Most capable</span>}
                </div>
                <p className="mt-6 flex items-baseline gap-2" aria-live="polite">
                  <span className="font-mono text-[52px] leading-none tracking-[-0.04em] tabular-nums text-ink" data-testid={`price-${plan.tier}`}>
                    ${price}
                  </span>
                  <span className="text-[14px] text-muted">/ {period === "monthly" ? "month" : "year"}</span>
                </p>
                <p className="mt-3 min-h-[44px] text-[14.5px] leading-[1.5] text-muted">{plan.blurb}</p>

                <div className="relative mt-5 flex-1 overflow-hidden rounded-xl border border-border-soft">
                  <div className="absolute inset-0" aria-hidden="true" style={{ background: atmosphere(HUES[i], "50% 120%", plan.featured ? 0.95 : 0.6) }} />
                  <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay" aria-hidden="true" style={{ backgroundImage: GRAIN }} />
                  <ul className="relative space-y-2.5 p-4 pb-16" aria-label={`${plan.name} plan features`}>
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[14.5px] text-ink">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink/80" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <PillLink
                  to="/signup"
                  variant={plan.featured ? "primary" : "secondary"}
                  size="md"
                  className="mt-5 w-full"
                >
                  {plan.monthly === 0 ? "Start for free" : `Choose ${plan.name}`}
                </PillLink>
              </Reveal>
            </li>
          );
        })}
      </ul>

      <p className="mx-auto mt-8 max-w-xl text-balance text-center text-[13px] text-muted">
        Prices in USD. No credit card required to start. Credit packs available any time, and
        Enterprise plans with custom credit volume on request.
      </p>
    </section>
  );
}
