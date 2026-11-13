import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { buildReactPreviewHtml, findReactEntry } from "../../../lib/previewRuntime";

interface Props {
  files: Record<string, string>;
  hasBuild: boolean;
  buildInProgress: boolean;
}

type PreviewState =
  | { kind: "none"; reason: string }
  | { kind: "loading" }
  | { kind: "ready"; html: string; source: string }
  | { kind: "error"; message: string };

const HTML_ENTRIES = ["index.html", "public/index.html", "src/index.html"];

/**
 * Live Preview for live mode: runs the build's own generated files in a
 * sandboxed iframe. React projects are transpiled client-side via
 * lib/previewRuntime; a plain index.html is shown as-is. Anything else
 * (e.g. a backend-only API) gets an honest "nothing to preview" message.
 */
export function LivePreviewSurface({ files, hasBuild, buildInProgress }: Props) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);

  const reactEntry = useMemo(() => findReactEntry(files), [files]);
  const htmlEntry = useMemo(() => HTML_ENTRIES.find((p) => files[p] !== undefined) ?? null, [files]);
  const fileCount = Object.keys(files).length;

  useEffect(() => {
    let cancelled = false;
    if (fileCount === 0) {
      setState({
        kind: "none",
        reason: !hasBuild
          ? "Run a build from the command deck below — if it generates a web front end, it will render here."
          : buildInProgress
          ? "The build hasn't produced any files yet."
          : "This build didn't produce any files.",
      });
      return;
    }
    if (reactEntry) {
      setState({ kind: "loading" });
      buildReactPreviewHtml(files, reactEntry)
        .then((html) => {
          if (!cancelled) setState({ kind: "ready", html, source: reactEntry });
        })
        .catch((err: unknown) => {
          if (!cancelled) setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        });
    } else if (htmlEntry) {
      setState({ kind: "ready", html: files[htmlEntry], source: htmlEntry });
    } else {
      setState({
        kind: "none",
        reason:
          "This build has no browser entry point (no src/main.tsx, src/index.tsx or index.html), so there's nothing to render — it may be a backend or API project. Its files are in Code Studio.",
      });
    }
    return () => {
      cancelled = true;
    };
  }, [files, fileCount, reactEntry, htmlEntry, hasBuild, buildInProgress, nonce]);

  if (state.kind === "loading") {
    return (
      <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-3 font-mono text-xs text-neutral-500">
        <Loader2 size={18} className="animate-spin" />
        <span>Preparing preview…</span>
      </div>
    );
  }

  if (state.kind === "none" || state.kind === "error") {
    return (
      <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-2 p-8 text-center font-mono">
        <p className="text-sm font-black uppercase text-neutral-900 dark:text-white">
          {state.kind === "error" ? "Preview failed" : "Nothing to preview"}
        </p>
        <p className="max-w-md text-xs text-neutral-500 break-words">
          {state.kind === "error" ? state.message : state.reason}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[480px] flex flex-col">
      <div className="h-9 px-3 flex items-center justify-between gap-2 border-b-2 border-black dark:border-white/80 font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
        <span className="truncate">
          Rendering <span className="font-bold text-neutral-900 dark:text-white">{state.source}</span> from the latest
          build · best-effort in-browser preview
          {buildInProgress && " · build still running"}
        </span>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="inline-flex items-center gap-1 px-2 py-0.5 border border-black dark:border-white/50 font-bold"
        >
          <RefreshCw size={11} /> Reload
        </button>
      </div>
      {/* allow-scripts without allow-same-origin: generated code runs in an
          opaque origin and can't touch this app's cookies or storage. */}
      <iframe
        key={nonce}
        title="Build preview"
        sandbox="allow-scripts allow-forms allow-modals"
        srcDoc={state.html}
        className="flex-1 w-full bg-white"
      />
    </div>
  );
}
