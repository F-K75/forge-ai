import { useId } from "react";
import { Info } from "lucide-react";
import { BYOK_DISCLOSURE_BODY, BYOK_DISCLOSURE_TITLE } from "../../lib/byokDisclosure";

/**
 * The BYOK billing disclosure (plan §5.6). Callers decide whether to render
 * it (BYOK_DISCLOSURE_ENABLED); this only presents the approved-pending copy.
 */
export function ByokDisclosure({ className = "" }: { className?: string }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-testid="byok-disclosure"
      className={`flex items-start gap-2.5 rounded-lg border border-border bg-panel-alt p-3 text-xs leading-relaxed ${className}`}
    >
      <Info size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      <p className="text-muted">
        <strong id={titleId} className="font-semibold text-ink">
          {BYOK_DISCLOSURE_TITLE}
        </strong>{" "}
        {BYOK_DISCLOSURE_BODY}
      </p>
    </section>
  );
}
