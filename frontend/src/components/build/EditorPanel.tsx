import { useMemo } from "react";
import Editor from "@monaco-editor/react";
import { FileCode2, Folder, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useBuildStore } from "../../store/buildStore";
import { motionVariants } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";

const SKELETON_LINE_WIDTHS = ["w-2/5", "w-3/5", "w-1/3", "w-4/5", "w-1/2", "w-2/3"];

function CodeLoadingState() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 px-6">
      <div className="relative grid h-12 w-12 place-items-center">
        <span className="absolute inset-0 rounded-full border-2 border-dashed border-ember/40 animate-spin motion-reduce:animate-none [animation-duration:6s]" aria-hidden="true" />
        <span className="absolute inset-2 rounded-full border border-ember/30" aria-hidden="true" />
        <Sparkles size={16} className="text-ember" aria-hidden="true" />
      </div>
      <p className="text-xs text-muted">Waiting for the first file…</p>
      <div className="w-full max-w-xs space-y-2" aria-hidden="true">
        {SKELETON_LINE_WIDTHS.map((w, i) => (
          <motion.div
            key={i}
            className={`h-2.5 rounded bg-panel-alt ${w}`}
            animate={{ opacity: [0.35, 0.8, 0.35] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }}
          />
        ))}
      </div>
    </div>
  );
}

function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "py":
      return "python";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "md":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    default:
      return "plaintext";
  }
}

interface FileGroup {
  dir: string;
  paths: string[];
}

function groupByDirectory(paths: string[]): FileGroup[] {
  const map = new Map<string, string[]>();
  for (const path of paths) {
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
    if (!map.has(dir)) map.set(dir, []);
    map.get(dir)!.push(path);
  }
  return Array.from(map.entries()).map(([dir, groupPaths]) => ({ dir, paths: groupPaths }));
}

export function EditorPanel() {
  const files = useBuildStore((s) => s.files);
  const openFile = useBuildStore((s) => s.openFile);
  const setOpenFile = useBuildStore((s) => s.setOpenFile);
  const streamBuffer = useBuildStore((s) => s.streamBuffer);
  const status = useBuildStore((s) => s.status);

  const paths = useMemo(() => Object.keys(files).sort(), [files]);
  const groups = useMemo(() => groupByDirectory(paths), [paths]);

  // While tokens stream in, show them live; once a file lands, show the file.
  const isStreaming = openFile == null && streamBuffer.length > 0;
  const content = openFile != null ? files[openFile] ?? "" : streamBuffer;
  const tabLabel = openFile ? openFile.split("/").pop() : isStreaming ? "Generating…" : null;

  return (
    <motion.section
      variants={motionVariants.fadeIn}
      initial="hidden"
      animate="visible"
      className="glass-strong rounded-xl grid grid-cols-[220px_minmax(0,1fr)] min-h-0 overflow-hidden"
      aria-label="Code editor"
    >
      <nav className="overflow-y-auto border-r border-border-soft py-2" aria-label="Files">
        <div className="flex items-center justify-between px-3 pb-2 pt-1 text-[10px] uppercase tracking-wider text-faint">
          <span>Explorer</span>
          <span>{paths.length} files</span>
        </div>
        {paths.length === 0 ? (
          <p className="px-3 py-2 text-xs text-faint flex items-center gap-1.5">
            {(status === "running" || status === "debugging") && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ember animate-tick" aria-hidden="true" />
            )}
            Files appear here as agents write code.
          </p>
        ) : (
          <motion.div variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {groups.map((group) => (
              <div key={group.dir} className="mb-1">
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-faint">
                  <Folder size={11} aria-hidden="true" />
                  <span className="truncate text-[11px]">{group.dir}</span>
                </div>
                <ul>
                  {group.paths.map((path) => (
                    <motion.li key={path} variants={motionVariants.staggerItem}>
                      <motion.button
                        onClick={() => setOpenFile(path)}
                        whileHover={presets.sidebarItem.whileHover}
                        whileTap={presets.sidebarItem.whileTap}
                        className={[
                          "w-full flex items-center gap-2 pl-6 pr-3 py-1.5 border-l-2 text-left text-xs font-mono truncate transition-colors",
                          path === openFile
                            ? "border-ember text-ink bg-ember/5"
                            : "border-transparent text-muted hover:text-ink",
                        ].join(" ")}
                        title={path}
                      >
                        <FileCode2 size={12} className="shrink-0 text-faint" aria-hidden="true" />
                        <span className="truncate">{path.split("/").pop()}</span>
                      </motion.button>
                    </motion.li>
                  ))}
                </ul>
              </div>
            ))}
          </motion.div>
        )}
      </nav>

      <div className="flex min-w-0 flex-col">
        {tabLabel && (
          <div className="flex items-center gap-1 border-b border-border-soft px-2 py-1.5 text-xs shrink-0">
            <div className="inline-flex items-center gap-2 rounded-md bg-panel/70 px-2.5 py-1 text-ink">
              <FileCode2 size={12} className="text-agent-developer" aria-hidden="true" />
              <span className="font-mono">{tabLabel}</span>
              {isStreaming && (
                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-ember/15 px-1.5 py-0.5 text-[10px] text-ember">
                  <span className="h-1 w-1 rounded-full bg-ember animate-tick" aria-hidden="true" /> writing
                </span>
              )}
            </div>
            {openFile && (
              <span className="ml-auto pr-1 font-mono text-[10px] text-faint hidden sm:inline">
                {languageFor(openFile)}
              </span>
            )}
          </div>
        )}
        <motion.div
          key={openFile ?? "stream"}
          variants={motionVariants.fadeUp}
          initial="hidden"
          animate="visible"
          className="flex-1 min-w-0"
        >
          {content || openFile ? (
            <Editor
              height="100%"
              theme="vs-dark"
              path={openFile ?? "stream"}
              language={openFile ? languageFor(openFile) : "plaintext"}
              value={content}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                wordWrap: "on",
              }}
            />
          ) : status === "running" || status === "debugging" ? (
            <CodeLoadingState />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-faint">No file selected</p>
            </div>
          )}
        </motion.div>
      </div>
    </motion.section>
  );
}
