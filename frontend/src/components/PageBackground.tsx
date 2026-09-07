import { type ReactNode } from "react";

interface PageBackgroundProps {
  children?: ReactNode;
  /** Show the Hermes-style viewport frame border */
  frame?: boolean;
  /** Show the atmosphere radial gradients */
  atmosphere?: boolean;
  /** Show the decorative glow blob */
  glow?: boolean;
  /** Glow blob position override */
  glowPosition?: string;
}

/**
 * Shared background layer for all public-facing pages.
 * Keeps atmosphere, glow, and frame in sync as users navigate.
 */
export default function PageBackground({
  children,
  frame = true,
  atmosphere = true,
  glow = true,
  glowPosition = "-top-40 -left-40",
}: PageBackgroundProps) {
  return (
    <>
      {frame && <div className="viewport-frame" aria-hidden="true" />}
      {atmosphere && (
        <div
          className="fixed inset-0 z-0 pointer-events-none"
          aria-hidden="true"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-surface-container/40 via-transparent to-surface-container/20" />
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full opacity-[0.07]"
            style={{
              background:
                "radial-gradient(ellipse, rgb(var(--primary)) 0%, transparent 70%)",
            }}
          />
        </div>
      )}
      {glow && (
        <div
          className={`glow-blob glow-blob-accent ${glowPosition} fixed z-0 pointer-events-none`}
          aria-hidden="true"
        />
      )}
      {children}
    </>
  );
}
