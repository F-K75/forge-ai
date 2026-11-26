import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * A router link styled like the `Button` primitive's pill variants.
 * `Button` renders a <button>, and nesting a link inside a button is invalid,
 * so navigation CTAs on the landing page use this instead.
 */
type Variant = "primary" | "secondary";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "border border-transparent bg-ink text-base hover:bg-ink/90 active:scale-[0.98]",
  secondary:
    "border border-glass-border bg-glass text-ink backdrop-blur-[5px] hover:bg-ink/10 active:scale-[0.98]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

interface PillLinkProps {
  to: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function PillLink({ to, variant = "primary", size = "md", className, children }: PillLinkProps) {
  return (
    <Link
      to={to}
      className={twMerge(
        clsx(
          "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill font-medium transition-all duration-fast ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base",
          VARIANTS[variant],
          SIZES[size],
          className,
        ),
      )}
    >
      {children}
    </Link>
  );
}
