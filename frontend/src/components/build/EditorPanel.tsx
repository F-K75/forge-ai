import { useMemo } from "react";
import Editor from "@monaco-editor/react";
import { FileCode2 } from "lucide-react";
import { useBuildStore } from "../../store/buildStore";

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

export function EditorPanel() {
  const files = useBuildStore((s) => s.files);
  const openFile = useBuildStore((s) => s.openFile);
  const setOpenFile = useBuildStore((s) => s.setOpenFile);
  const streamBuffer = useBuildStore((s) => s.streamBuffer);

  const paths = useMemo(() => Object.keys(files).sort(), [files]);

  // While tokens stream in, show them live; once a file lands, show the file.
  const content = openFile != null ? files[openFile] ?? "" : streamBuffer;

  return (
    <section className="flex-1 min-w-0 flex bg-base border-r border-border" aria-label="Code editor">
      <nav className="w-52 shrink-0 overflow-y-auto border-r border-border-soft py-2" aria-label="Files">
        {paths.length === 0 ? (
          <p className="px-3 py-2 text-xs text-faint">Files appear here as agents write code.</p>
        ) : (
          <ul>
            {paths.map((path) => (
              <li key={path}>
                <button
                  onClick={() => setOpenFile(path)}
                  className={[
                    "w-full flex items-center gap-2 pl-3 pr-3 py-1.5 border-l-2 text-left text-xs font-mono truncate transition-colors",
                    path === openFile
                      ? "border-ink text-ink"
                      : "border-transparent text-muted hover:text-ink",
                  ].join(" ")}
                  title={path}
                >
                  <FileCode2 size={12} className="shrink-0 text-faint" aria-hidden="true" />
                  <span className="truncate">{path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="flex-1 min-w-0">
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
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-faint">No file selected</p>
          </div>
        )}
      </div>
    </section>
  );
}
