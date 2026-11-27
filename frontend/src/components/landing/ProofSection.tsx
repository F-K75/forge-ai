import { ClipboardList, Hammer, Quote, Rocket } from "lucide-react";
import { Reveal } from "./Reveal";
import { STATS } from "./landingContent";
import { GRAIN, rgba } from "./atmosphere";

export function ProofSection() {
  return (
    <section aria-labelledby="facts-title" className="px-5 pb-28 sm:px-8 sm:pb-36">
      <h2 id="facts-title" className="sr-only">
        Forge in numbers
      </h2>
      <div className="mx-auto max-w-[1120px]">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.06} className="bg-base p-6 sm:p-8">
              <dt className="text-[14px] text-ink">{s.label}</dt>
              <dd className="mt-4 font-mono text-[44px] leading-none tracking-[-0.04em] tabular-nums text-ink sm:text-[56px]">
                {s.value}
              </dd>
              <dd className="mt-3 text-[13px] text-muted">{s.note}</dd>
            </Reveal>
          ))}
        </dl>

        <Reveal delay={0.1} className="mt-4">
          <figure className="relative overflow-hidden rounded-2xl border border-border bg-panel p-7 sm:p-12">
            <div
              className="absolute inset-0"
              aria-hidden="true"
              style={{ background: `radial-gradient(60% 120% at 100% 100%, ${rgba("rust", 0.55)} 0%, ${rgba("rust", 0)} 70%)` }}
            />
            <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <Quote className="h-6 w-6 text-accent" aria-hidden="true" />
                <blockquote className="mt-5 max-w-3xl text-balance text-[22px] font-medium leading-[1.3] tracking-[-0.02em] text-ink sm:text-[28px]">
                  “I describe the outcome on Monday. By Tuesday there's a plan I've approved, a branch
                  that passes its tests, and one decision waiting for me at the release gate.”
                </blockquote>
              </div>
              <figcaption className="text-[14px] text-muted md:max-w-[220px] md:text-right">
                <span className="block text-ink">The workflow Forge is built for</span>
                Illustrative example, not a customer quote.
              </figcaption>
            </div>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

const POINTS = [
  {
    icon: ClipboardList,
    title: "Plan",
    body: "A persistent Product Lead turns intent into goals, architecture and a task graph you sign off.",
  },
  {
    icon: Hammer,
    title: "Build",
    body: "Specialist agents work in parallel sandboxes with the skills, tools and models each task needs.",
  },
  {
    icon: Rocket,
    title: "Ship",
    body: "Checked changes can wait at an approval gate, and every decision is written to the audit log.",
  },
];

export function LifecycleBand() {
  return (
    <section aria-labelledby="lifecycle-title" className="px-3 pb-28 sm:px-5 sm:pb-36">
      <div className="relative mx-auto max-w-[1360px] overflow-hidden rounded-[28px] border border-border">
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            background: [
              `radial-gradient(50% 80% at 50% 110%, ${rgba("ember", 0.3)} 0%, ${rgba("rust", 0.7)} 30%, ${rgba("rust", 0)} 70%)`,
              `radial-gradient(60% 70% at 0% 0%, ${rgba("teal", 0.9)} 0%, ${rgba("teal", 0)} 70%)`,
              `radial-gradient(60% 70% at 100% 10%, ${rgba("olive", 0.8)} 0%, ${rgba("olive", 0)} 70%)`,
              `linear-gradient(180deg, ${rgba("teal", 0.4)}, ${rgba("base", 0.95)})`,
            ].join(", "),
          }}
        />
        <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay" aria-hidden="true" style={{ backgroundImage: GRAIN }} />
        <div className="absolute inset-0 bg-base/30" aria-hidden="true" />

        <div className="relative px-6 py-20 sm:px-12 sm:py-28">
          <Reveal>
            <h2
              id="lifecycle-title"
              className="mx-auto max-w-2xl text-balance text-center text-[34px] font-medium leading-[1.06] tracking-[-0.03em] text-ink sm:text-display md:text-[52px]"
            >
              One OS for the whole lifecycle.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-balance text-center text-[16px] text-ink/85">
              No more stitching tickets, chat threads, CI and deploy scripts together. Forge carries
              the work from idea to production.
            </p>
          </Reveal>
          <ul className="mx-auto mt-16 grid max-w-[1000px] gap-4 md:grid-cols-3">
            {POINTS.map(({ icon: Icon, title, body }, i) => (
              <li key={title}>
                <Reveal
                  delay={i * 0.08}
                  className="h-full rounded-xl border border-glass-border bg-base/40 p-6 backdrop-blur-md"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink/[0.08]">
                    <Icon className="h-[18px] w-[18px] text-ink" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-[19px] font-medium tracking-[-0.02em] text-ink">{title}</h3>
                  <p className="mt-2 text-[14.5px] leading-[1.55] text-ink/80">{body}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
