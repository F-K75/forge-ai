import React, { useEffect, useState } from "react";
import { X, Copy, Check, Code2, Download } from "lucide-react";
import toast from "react-hot-toast";

interface AgentPayloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  agentName: string;
  payload: any;
}

export function AgentPayloadModal({
  isOpen,
  onClose,
  title,
  agentName,
  payload,
}: AgentPayloadModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const jsonString =
    typeof payload === "string" ? payload : JSON.stringify(payload || {}, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    toast.success("Payload copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agentName.toLowerCase().replace(/\s+/g, "_")}_payload.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Payload downloaded");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-payload-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-border bg-panel shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft bg-ink/10">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 rounded-lg bg-agent-integration/10 text-agent-integration items-center justify-center">
              <Code2 size={16} />
            </span>
            <div>
              <h3 id="agent-payload-modal-title" className="font-semibold text-sm text-ink">{title}</h3>
              <p className="text-xs text-muted font-mono">Agent: {agentName}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-pill border border-border hover:bg-ink/5 text-ink transition-colors cursor-pointer"
            >
              {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-pill border border-border hover:bg-ink/5 text-ink transition-colors cursor-pointer"
            >
              <Download size={13} />
              <span>Download</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-faint hover:text-ink rounded-lg hover:bg-ink/5 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Code Viewer */}
        <div className="flex-1 p-4 overflow-y-auto bg-panel-alt text-ink font-mono text-xs leading-relaxed">
          <pre className="whitespace-pre-wrap select-text">{jsonString}</pre>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-2.5 border-t border-border-soft bg-ink/10 flex items-center justify-between text-xs text-muted">
          <span>Format: application/json</span>
          <span>Schema validated by AI Gateway</span>
        </div>
      </div>
    </div>
  );
}
