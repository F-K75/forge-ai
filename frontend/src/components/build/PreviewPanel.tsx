import { useEffect, useMemo, useState } from "react";
import { Monitor, Loader2, ShieldCheck, RefreshCw, FileCode } from "lucide-react";
import { useBuildStore } from "../../store/buildStore";
import { resolveRelative } from "../../lib/previewPaths";
import { findReactEntry, buildReactPreviewHtml } from "../../lib/previewRuntime";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, entryPath, htmlEntry, reactEntry, reloadKey]);

  return (
    <aside className="w-72 shrink-0 hidden lg:flex flex-col bg-base border-l border-border" aria-label="Preview">
      <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">Preview</h2>
        {status === "complete" && previewDoc && (
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            aria-label="Reload preview"
            className="text-faint hover:text-ink transition"
          >
            <RefreshCw size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {status === "complete" && previewDoc ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <iframe
            key={reloadKey}
            title="App preview"
            srcDoc={previewDoc}
            sandbox="allow-scripts allow-forms"
            className="flex-1 min-h-0 w-full bg-white"
          />
          <div className="px-3 py-2 border-t border-border-soft flex items-center justify-between text-[10px] text-faint">
            <span className="truncate">{entryPath}</span>
            {typeof qaScore === "number" && <span className="shrink-0">QA {qaScore}/100</span>}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          {status === "running" || status === "debugging" ? (
            <>
              <Loader2 size={20} className="text-ink animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <p className="text-xs text-muted">Agents are building your app…</p>
            </>
          ) : status === "complete" ? (
            <>
              <div className="w-10 h-10 border border-border flex items-center justify-center">
                <ShieldCheck size={18} className="text-ink" aria-hidden="true" />
              </div>
              {typeof qaScore === "number" && (
                <p className="text-sm text-ink font-medium">QA score {qaScore}/100</p>
              )}
              {Array.isArray(validation?.missing_features) && validation.missing_features.length > 0 && (
                <ul className="text-xs text-warn space-y-1">
                  {validation.missing_features.slice(0, 4).map((f) => (
                    <li key={f}>missing: {f}</li>
                  ))}
                </ul>
              )}
              <FileCode size={16} className="text-faint" aria-hidden="true" />
              <p className="text-xs text-faint">
                No browsable entry point in this build — sync to GitHub or deploy from the project page to run it.
              </p>
            </>
          ) : (
            <>
              <Monitor size={20} className="text-faint" aria-hidden="true" />
              <p className="text-xs text-faint">The preview appears once a build completes.</p>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
