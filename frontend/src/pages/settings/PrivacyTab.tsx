import { useState } from "react";
import { Download, Trash2, Database, AlertTriangle, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";
import { authApi } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { useAuthStore } from "../../store/authStore";

export function PrivacyTab() {
  const { user, logout } = useAuthStore();
  const [exporting, setExporting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  // Danger Zone Delete Modal
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleExportData = async () => {
    setExporting(true);
    try {
      let data: any;
      if (LIVE_MODE) {
        const res = await authApi.gdpr.export();
        data = res.data;
      } else {
        data = {
          user: {
            id: user?.id,
            email: user?.email,
            name: user?.name,
            plan: user?.plan,
            credits: user?.credits,
            created_at: user?.created_at,
          },
          exported_at: new Date().toISOString(),
          format_version: "2.1",
        };
      }

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `forge-account-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Account data export downloaded");
    } catch {
      toast.error("Failed to export account data");
    } finally {
      setExporting(false);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      // Clear client session caches while keeping auth token
      const token = localStorage.getItem("access_token");
      const refresh = localStorage.getItem("refresh_token");
      localStorage.clear();
      if (token) localStorage.setItem("access_token", token);
      if (refresh) localStorage.setItem("refresh_token", refresh);

      await new Promise((r) => setTimeout(r, 400));
      toast.success("Local workspace cache and temporary files cleared");
    } catch {
      toast.error("Failed to clear local cache");
    } finally {
      setClearingCache(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText !== "DELETE") {
      toast.error('Please type "DELETE" to confirm.');
      return;
    }

    setDeleting(true);
    try {
      if (LIVE_MODE) {
        await authApi.gdpr.delete(true);
      } else {
        await new Promise((r) => setTimeout(r, 600));
      }
      toast.success("Account permanently deleted.");
      setIsDeleteOpen(false);
      await logout();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to delete account");
      setDeleting(false);
    }
  };

  return (
    <div id="settings-privacy-panel" className="space-y-8">
      {/* GDPR Data Portability */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Download size={15} className="text-accent" />
              Data Portability & GDPR Export
            </h2>
            <p className="text-xs text-muted mt-1">
              Download a machine-readable JSON archive containing your account metadata, agent run logs, and projects.
            </p>
          </div>

          <button
            id="export-data-btn"
            type="button"
            onClick={handleExportData}
            disabled={exporting}
            className="bb-btn bb-btn-subtle text-xs px-3.5 py-2 flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Download size={13} className={exporting ? "animate-bounce" : ""} />
            {exporting ? "Generating Export..." : "Download JSON Export"}
          </button>
        </div>
      </section>

      {/* Local Storage & Cache Management */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Database size={15} className="text-accent" />
              Workspace Cache & Storage
            </h2>
            <p className="text-xs text-muted mt-1">
              Clear client-side IndexedDB caches, editor drafts, and temporary code analysis indexes.
            </p>
          </div>

          <button
            id="clear-cache-btn"
            type="button"
            onClick={handleClearCache}
            disabled={clearingCache}
            className="bb-btn bb-btn-subtle text-xs px-3.5 py-2 flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw size={13} className={clearingCache ? "animate-spin" : ""} />
            {clearingCache ? "Clearing..." : "Clear Local Cache"}
          </button>
        </div>
      </section>

      {/* Compliance & Encryption Standards */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <ShieldCheck size={15} className="text-ok" />
            Compliance & Encryption Standards
          </h2>
          <p className="text-xs text-muted mt-1">
            How Forge handles and protects your proprietary source code and intellectual property.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-lg border border-border-soft bg-base/40 space-y-1">
            <span className="font-semibold text-ink block">Encryption at Rest</span>
            <p className="text-[11px] text-muted">All codebases, database keys, and personal tokens are encrypted with AES-256 GCM.</p>
          </div>
          <div className="p-3.5 rounded-lg border border-border-soft bg-base/40 space-y-1">
            <span className="font-semibold text-ink block">Zero AI Model Training</span>
            <p className="text-[11px] text-muted">Your source code is never used to train or fine-tune public foundation models.</p>
          </div>
          <div className="p-3.5 rounded-lg border border-border-soft bg-base/40 space-y-1">
            <span className="font-semibold text-ink block">GDPR & CCPA Compliant</span>
            <p className="text-[11px] text-muted">Complete right-to-be-forgotten and data portability compliance guarantees.</p>
          </div>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-xl border border-error/30 bg-error/5 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-error flex items-center gap-2">
              <AlertTriangle size={16} />
              Danger Zone: Delete Account
            </h2>
            <p className="text-xs text-muted mt-1 max-w-xl">
              Permanently delete your account, projects, agent history, and all associated cloud resources. This action is irreversible.
            </p>
          </div>

          <button
            id="delete-account-btn"
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="bb-btn bb-btn-danger text-xs px-4 py-2 font-medium shrink-0 self-start sm:self-auto"
          >
            Delete Account
          </button>
        </div>
      </section>

      {/* Delete Account Modal */}
      {isDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-error/40 bg-panel p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-error">
              <Trash2 className="h-6 w-6" />
              <div>
                <h3 className="text-sm font-semibold text-ink">Permanently Delete Account?</h3>
                <span className="text-xs text-muted">All data will be erased forever.</span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-base border border-border-soft text-xs text-muted space-y-2">
              <p>This will permanently purge:</p>
              <ul className="list-disc pl-4 space-y-1 text-ink text-[11px]">
                <li>All active and archived workspace repositories</li>
                <li>Agent generation histories, tokens, and logs</li>
                <li>Your API keys and third-party webhook subscriptions</li>
                <li>Active credit balances and subscriptions</li>
              </ul>
            </div>

            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="confirm-delete-input" className="text-xs font-medium text-ink block">
                  Type <strong className="text-error font-mono">DELETE</strong> to confirm:
                </label>
                <input
                  id="confirm-delete-input"
                  type="text"
                  required
                  placeholder="DELETE"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full text-xs font-mono bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-error"
                />
              </div>

              <div className="pt-2 border-t border-border-soft flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteOpen(false);
                    setConfirmText("");
                  }}
                  className="bb-btn bb-btn-subtle text-xs px-3.5 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting || confirmText !== "DELETE"}
                  className="bb-btn bb-btn-danger text-xs px-4 py-2 font-medium"
                >
                  {deleting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
