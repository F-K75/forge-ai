import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Seconds to wait before appearing; use for gentle staggers. */
  delay?: number;
}

/**
 * Fades and lifts content in once as it scrolls into view. Under
 * prefers-reduced-motion it renders a plain element with no animation.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Two-tone section heading: the first phrase in ink, the continuation muted. */
export function TwoTone({
  id,
  lead,
  rest,
  className = "",
}: {
  id?: string;
  lead: string;
  rest: string;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={`mx-auto max-w-3xl text-balance text-center text-[34px] font-medium leading-[1.06] tracking-[-0.03em] text-ink sm:text-display md:text-[52px] ${className}`}
    >
      {lead}
      <br className="hidden sm:block" /> <span className="text-muted">{rest}</span>
    </h2>
  );
}
