import { Check, Sparkles, ExternalLink, Code2, X } from "lucide-react";
import { motion } from "motion/react";

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
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 15 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-sm mx-auto rounded-2xl bg-[#0D0F14] border border-white/[0.14] p-6 text-center shadow-2xl shadow-black/90 select-none overflow-hidden"
    >
      {/* Subtle ambient molten ember glow */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-32 h-32 bg-[#FF5722]/15 rounded-full blur-2xl pointer-events-none" />

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3 right-3 text-[#888B96] hover:text-[#F4F4F6] p-1 transition"
          aria-label="Dismiss completion card"
        >
          <X size={14} />
        </button>
      )}

      {/* System Status Label */}
      <div className="flex items-center justify-center gap-1.5 mb-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[#30D158]" />
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-[#A0A3AF]">
          BUILT
        </span>
      </div>

      {/* Artifact Title */}
      <h3 className="text-xl font-medium text-[#F4F4F6] tracking-tight font-sans mb-4">
        {title}
      </h3>

      {/* System Stats Checklist */}
      <div className="space-y-1.5 text-xs font-mono text-[#888B96] mb-6 border-y border-white/[0.06] py-3.5">
        <div className="flex items-center justify-center gap-2">
          <span className="text-[#30D158]">✓</span>
          <span>{filesChangedCount} files changed</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="text-[#30D158]">✓</span>
          <span>{testsPassedCount} tests passed</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="text-[#FF5722]">◉</span>
          <span className="text-[#F4F4F6]">Preview ready</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={onOpenPreview}
          className="w-full py-2.5 px-4 rounded-xl bg-[#F4F4F6] text-[#0A0B0E] font-medium text-xs hover:bg-white active:scale-98 transition flex items-center justify-center gap-2 shadow-sm"
        >
          <span>Open Preview</span>
          <ExternalLink size={13} />
        </button>

        {onInspectCode && (
          <button
            type="button"
            onClick={onInspectCode}
            className="w-full py-2 px-4 rounded-xl text-[#888B96] hover:text-[#F4F4F6] hover:bg-white/[0.04] font-mono text-xs transition flex items-center justify-center gap-2"
          >
            <Code2 size={13} />
            <span>Inspect Changes</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}
