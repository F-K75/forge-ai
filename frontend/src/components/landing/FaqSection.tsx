import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Reveal, TwoTone } from "./Reveal";
import { FAQS } from "./landingContent";

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();

  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 px-5 pb-28 sm:px-8 sm:pb-36">
      <Reveal>
        <TwoTone id="faq-title" lead="Questions," rest="answered." />
      </Reveal>
      <Reveal delay={0.05} className="mx-auto mt-12 max-w-[760px]">
        <ul className="divide-y divide-border rounded-2xl border border-border bg-panel/60">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            const btnId = `${base}-q${i}`;
            const panelId = `${base}-a${i}`;
            return (
              <li key={item.q}>
                <h3>
                  <button
                    id={btnId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-6 px-5 py-5 text-left text-[16px] font-medium tracking-[-0.01em] text-ink transition-colors hover:bg-ink/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent sm:px-6"
                  >
                    {item.q}
                    <Plus
                      className={`h-4 w-4 shrink-0 text-muted transition-transform duration-med motion-reduce:transition-none ${isOpen ? "rotate-45" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  hidden={!isOpen}
                  className="px-5 pb-6 text-[15px] leading-[1.6] text-muted sm:px-6"
                >
                  {item.a}
                </div>
              </li>
            );
          })}
        </ul>
      </Reveal>
    </section>
  );
}
