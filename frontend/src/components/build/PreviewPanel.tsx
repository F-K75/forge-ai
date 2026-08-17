import { useEffect, useMemo, useState } from "react";
import { Monitor, ShieldCheck, RefreshCw, FileCode, Gauge, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useBuildStore } from "../../store/buildStore";
import { resolveRelative } from "../../lib/previewPaths";
import { findReactEntry, buildReactPreviewHtml } from "../../lib/previewRuntime";
import { motionVariants } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";

const HTML_ENTRY_CANDIDATES = ["index.html", "public/index.html", "src/index.html"];

function findAsset(files: Record<string, string>, entryPath: string, ref: string): string | null {
  const cleaned = ref.split(/[?#]/)[0];
  const resolved = resolveRelative(entryPath, cleaned);
  if (files[resolved] !== undefined) return files[resolved];
  const basename = resolved.split("/").pop();
  const match = Object.keys(files).find((p) => p.endsWith(`/${basename}`) || p === basename);
  return match ? files[match] : null;
}

// Inlines same-project <link rel="stylesheet"> and same-project <script src>
// tags so the generated HTML renders standalone inside a sandboxed iframe —
// there is no server to fetch these assets from.
function buildStaticSrcDoc(files: Record<string, string>, entryPath: string): string {
  let html = files[entryPath];

  html = html.replace(
    /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (tag, href) => {
      const css = findAsset(files, entryPath, href);
      return css !== null ? `<style>\n${css}\n</style>` : tag;
    }
  );

  html = html.replace(
    /<script\s+([^>]*)src=["']([^"']+)["']([^>]*)><\/script>/gi,
    (tag, before, src, after) => {
      if (/type=["']module["']/i.test(before + after)) return tag; // can't safely inline ESM
      const js = findAsset(files, entryPath, src);
      return js !== null ? `<script>\n${js}\n</script>` : tag;
    }
  );

  return html;
}

function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-black/10 bg-[#fafafa] shadow-inner">
      <div className="flex items-center gap-1.5 border-b border-black/5 bg-black/[0.03] px-2 py-1.5 shrink-0">
        <span className="h-2 w-2 rounded-full bg-[#ec6a5e]" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-[#f4bf4f]" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-[#61c454]" aria-hidden="true" />
        <div className="ml-2 flex-1 truncate rounded-md bg-white/80 px-2 py-0.5 text-[10px] text-black/50 font-mono">
          {url}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function QAReport({ score, missing }: { score: number; missing: string[] }) {
  const dash = Math.max(0, Math.min(100, score));
  return (
    <div className="border-t border-border-soft p-3 text-xs shrink-0">
      <div className="flex items-center gap-2">
        <div className="relative grid h-10 w-10 place-items-center shrink-0">
          <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#22222E" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="#34D399"
              strokeWidth="3"
              strokeDasharray={`${dash} 100`}
              pathLength={100}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <Gauge size={14} className="text-ok" aria-hidden="true" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold leading-none text-ink">{score}</span>
            <span className="text-faint">/ 100</span>
            <span className="ml-1 text-[10px] uppercase tracking-wider text-ok">QA passed</span>
          </div>
          {missing.length > 0 && <p className="text-[11px] text-muted">{missing.length} item flagged.</p>}
        </div>
      </div>
      {missing.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-[11px] text-muted">
          {missing.slice(0, 4).map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-agent-pm" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PreviewPanel() {
  const status = useBuildStore((s) => s.status);
  const qaScore = useBuildStore((s) => s.qaScore);
  const validation = useBuildStore((s) => s.validation);
  const files = useBuildStore((s) => s.files);
  const [reloadKey, setReloadKey] = useState(0);

  const htmlEntry = useMemo(
    () => HTML_ENTRY_CANDIDATES.find((p) => files[p] !== undefined)
      ?? Object.keys(files).find((p) => p.toLowerCase().endsWith(".html")),
    [files]
  );
  const reactEntry = useMemo(() => (htmlEntry ? null : findReactEntry(files)), [files, htmlEntry]);
  const entryPath = htmlEntry ?? reactEntry ?? null;

  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  useEffect(() => {
    if (!entryPath) {
      setPreviewDoc(null);
      return;
    }
    let cancelled = false;
    if (htmlEntry) {
      try {
        setPreviewDoc(buildStaticSrcDoc(files, htmlEntry));
      } catch {
        setPreviewDoc(null);
      }
    } else {
      buildReactPreviewHtml(files, reactEntry!)
        .then((html) => { if (!cancelled) setPreviewDoc(html); })
        .catch(() => { if (!cancelled) setPreviewDoc(null); });
    }
    return () => { cancelled = true; };
    // reloadKey forces a fresh recompile/remount when the user clicks reload
  }, [files, entryPath, htmlEntry, reactEntry, reloadKey]);

  const missing = Array.isArray(validation?.missing_features) ? validation.missing_features : [];

  return (
    <motion.aside
      variants={motionVariants.slideInRight}
      initial="hidden"
      animate="visible"
      className="glass-strong rounded-xl hidden lg:flex flex-col min-h-0 overflow-hidden"
      aria-label="Preview"
    >
      <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[10px] font-medium uppercase tracking-wider text-faint">Preview</h2>
          {status === "complete" && previewDoc && (
            <span className="inline-flex items-center gap-1 bg-ok/15 px-1.5 py-0.5 text-[10px] text-ok">
              <span className="h-1 w-1 rounded-full bg-ok" aria-hidden="true" /> Live
            </span>
          )}
        </div>
        {status === "complete" && previewDoc && (
          <motion.button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            aria-label="Refresh preview"
            whileHover={presets.button.whileHover}
            whileTap={presets.button.whileTap}
            className="text-faint hover:text-ink transition"
          >
            <RefreshCw size={12} aria-hidden="true" />
          </motion.button>
        )}
      </div>

      <div className="min-h-0 flex-1 p-3">
        {status === "complete" && previewDoc ? (
          <motion.div
            key={reloadKey}
            variants={motionVariants.fadeUp}
            initial="hidden"
            animate="visible"
            className="h-full"
          >
            <BrowserFrame url={entryPath ?? ""}>
              <iframe
                title="App preview"
                srcDoc={previewDoc}
                sandbox="allow-scripts allow-forms"
                className="w-full h-full bg-white"
              />
            </BrowserFrame>
          </motion.div>
        ) : (
          <motion.div
            key={status}
            variants={motionVariants.scaleIn}
            initial="hidden"
            animate="visible"
            className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center"
          >
            {status === "running" || status === "debugging" ? (
              <>
                <div className="relative grid h-14 w-14 place-items-center">
                  <span className="absolute inset-0 rounded-full border-2 border-dashed border-ember/40 animate-spin motion-reduce:animate-none [animation-duration:6s]" />
                  <span className="absolute inset-2 rounded-full border border-ember/30" />
                  <Sparkles size={18} className="text-ember" aria-hidden="true" />
                </div>
                <p className="text-xs text-muted">Preparing your preview…</p>
              </>
            ) : status === "complete" ? (
              <>
                <div className="w-10 h-10 border border-border flex items-center justify-center">
                  <ShieldCheck size={18} className="text-ink" aria-hidden="true" />
                </div>
                {typeof qaScore === "number" && (
                  <p className="text-sm text-ink font-medium">QA score {qaScore}/100</p>
                )}
                {missing.length > 0 && (
                  <ul className="text-xs text-warn space-y-1">
                    {missing.slice(0, 4).map((f) => (
                      <li key={f}>missing: {f}</li>
                    ))}
                  </ul>
                )}
                <FileCode size={16} className="text-faint" aria-hidden="true" />
                <p className="text-xs text-faint">
                  No preview available. Connect a repository or deploy to view.
                </p>
              </>
            ) : (
              <>
                <Monitor size={20} className="text-faint" aria-hidden="true" />
                <p className="text-xs text-faint">Your preview will appear once ready.</p>
              </>
            )}
          </motion.div>
        )}
      </div>

      {status === "complete" && previewDoc && typeof qaScore === "number" && (
        <QAReport score={qaScore} missing={missing} />
      )}
    </motion.aside>
  );
}
