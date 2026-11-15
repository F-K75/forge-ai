import { ExternalLink, Code2, X } from "lucide-react";

interface ForgeMomentCardProps {
  title?: string;
  filesChangedCount?: number;
  testsPassedCount?: number;
  onOpenPreview: () => void;
  onInspectCode?: () => void;
  onDismiss?: () => void;
}

export function ForgeMomentCard({
 title = "Authentication & Billing",
  filesChangedCount = 12,
  testsPassedCount = 42,
  onOpenPreview,
  onInspectCode,
  onDismiss,
}: ForgeMomentCardProps) {
  return (
 <div className="relative w-full max-w-sm mx-auto bg-white dark:bg-[#181822] border border-border p-5 text-center shadow-m3 select-none font-mono text-ink">
      {onDismiss && (
        <button
 type="button"
          onClick={onDismiss}
 className="absolute top-2.5 right-2.5 w-6 h-6 border border-black dark:border-white/60 bg-white dark:bg-[#252530] text-ink hover:bg-accent text-[#09090B] hover:text-black flex items-center justify-center transition-none shadow-m3 active:translate-x-[1px] active:translate-y-[1px]"
 aria-label="Dismiss completion card"
        >
          <X size={12} strokeWidth={3} />
        </button>
      )}

      {/* System Status Label */}
 <div className="flex items-center justify-center gap-1.5 mb-2">
 <span className="px-2 py-0.5 bg-emerald-400 text-black border border-black font-mono text-[10px] font-black uppercase shadow-m3">
          SYNTHESIS_COMPLETE
        </span>
      </div>

      {/* Artifact Title */}
 <h3 className="text-base sm:text-lg font-black text-ink uppercase tracking-tight mb-3">
        {title}
      </h3>

      {/* System Stats Checklist */}
 <div className="space-y-1 text-xs font-mono mb-4 border-y-2 border-black dark:border-white/80 py-3">
 <div className="flex items-center justify-center gap-2">
 <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
 <span className="font-bold">{filesChangedCount} files synthesized</span>
        </div>
 <div className="flex items-center justify-center gap-2">
 <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
 <span className="font-bold">{testsPassedCount} Vitest assertions passed</span>
        </div>
 <div className="flex items-center justify-center gap-2">
 <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
 <span className="font-black text-ink">Edge Runtime Preview Ready</span>
        </div>
      </div>

      {/* Action Buttons */}
 <div className="space-y-2">
        <button
 type="button"
          onClick={onOpenPreview}
 className="w-full py-2 px-4 bg-accent text-[#09090B] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-black border border-border font-mono font-black text-xs uppercase transition-none active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center gap-1.5 shadow-m3 cursor-pointer"
        >
          <span>OPEN PREVIEW</span>
          <ExternalLink size={12} strokeWidth={2.5} />
        </button>

        {onInspectCode && (
          <button
 type="button"
            onClick={onInspectCode}
 className="w-full py-2 px-4 bg-white dark:bg-[#252530] text-ink hover:bg-neutral-100 border border-border font-mono font-black text-xs uppercase transition-none active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center gap-1.5 shadow-m3 cursor-pointer"
          >
            <Code2 size={12} strokeWidth={2.5} />
            <span>INSPECT CHANGES</span>
          </button>
        )}
      </div>
    </div>
  );
}
