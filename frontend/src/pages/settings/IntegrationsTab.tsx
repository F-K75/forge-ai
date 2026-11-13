import { useState, useEffect, useCallback } from "react";
import { GitBranch, Webhook, Plus, Trash2, Shield, CheckCircle2, Globe, ExternalLink, Send } from "lucide-react";
import { toast } from "react-hot-toast";
import { authApi, webhooksApi, type WebhookItem } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { useAuthStore } from "../../store/authStore";
import { ClipboardCopyButton } from "../../components/ui/ClipboardCopyButton";

const WEBHOOK_EVENTS = [
  { id: "build.started", label: "Build Started" },
  { id: "build.completed", label: "Build Completed" },
  { id: "build.failed", label: "Build Failed" },
  { id: "deployment.success", label: "Deployment Succeeded" },
  { id: "deployment.failed", label: "Deployment Failed" },
  { id: "qa.score_updated", label: "QA Score Finalized" },
];

// Demo mode only (no backend). The secret is a visibly fake placeholder --
// real per-webhook secrets come from POST /webhooks/ and are shown once.
const DEMO_WEBHOOKS: WebhookItem[] = [
  {
    id: "wh_demo_1",
    url: "https://api.example.com/webhooks/forge-production",
    events: ["build.completed", "build.failed", "deployment.success"],
    active: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    last_triggered: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    secret: "whsec_demo_placeholder",
  },
];

export function IntegrationsTab() {
  const { user, fetchMe } = useAuthStore();
  const userPrefs = (user?.preferences as Record<string, any>) || {};

  // GitHub state
  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState(userPrefs.githubRepo || "frendia/forge-apps");
  const [autoPr, setAutoPr] = useState(userPrefs.autoPr ?? true);
  const [savingGithub, setSavingGithub] = useState(false);

  // Webhooks state
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loadingWebhooks, setLoadingWebhooks] = useState(true);
  const [isAddWebhookOpen, setIsAddWebhookOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "build.completed",
    "build.failed",
    "deployment.success",
  ]);
  const [addingWebhook, setAddingWebhook] = useState(false);
  // The signing secret POST /webhooks/ returns. The API never returns it
  // again (list responses omit it), so it is shown once, right after creation.
  const [revealedSecret, setRevealedSecret] = useState<{ url: string; secret: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const loadWebhooks = useCallback(async () => {
    setLoadingWebhooks(true);
    try {
      if (LIVE_MODE) {
        const data = await webhooksApi.list();
        setWebhooks(data || []);
      } else {
        const stored = localStorage.getItem("forge_demo_webhooks");
        if (stored) {
          setWebhooks(JSON.parse(stored));
        } else {
          setWebhooks(DEMO_WEBHOOKS);
        }
      }
    } catch {
      if (LIVE_MODE) {
        setWebhooks([]);
        toast.error("Failed to load webhooks");
      } else {
        setWebhooks(DEMO_WEBHOOKS);
      }
    } finally {
      setLoadingWebhooks(false);
    }
  }, []);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  const handleSaveGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGithub(true);
    try {
      if (LIVE_MODE) {
        await authApi.updateProfile({
          github_token: githubToken.trim() || undefined,
          preferences: {
            ...userPrefs,
            githubRepo: githubRepo.trim(),
            autoPr,
          },
        });
        await fetchMe();
      } else {
        await new Promise((r) => setTimeout(r, 400));
      }
      toast.success("GitHub integration settings updated");
      setGithubToken("");
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to update GitHub configuration";
      toast.error(msg);
    } finally {
      setSavingGithub(false);
    }
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.startsWith("https://")) {
      toast.error("Webhook endpoint must use a secure HTTPS URL.");
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error("Please subscribe to at least one event.");
      return;
    }

    setAddingWebhook(true);
    try {
      if (LIVE_MODE) {
        const created = await webhooksApi.create({
          url: webhookUrl.trim(),
          events: selectedEvents,
          active: true,
        });
        if (created?.secret) {
          setRevealedSecret({ url: created.url, secret: created.secret });
        }
      } else {
        const newHook: WebhookItem = {
          id: `wh_${Date.now()}`,
          url: webhookUrl.trim(),
          events: selectedEvents,
          active: true,
          created_at: new Date().toISOString(),
          last_triggered: null,
          secret: `whsec_${Math.random().toString(36).substring(2, 12)}`,
        };
        const updated = [newHook, ...webhooks];
        setWebhooks(updated);
        localStorage.setItem("forge_demo_webhooks", JSON.stringify(updated));
      }

      toast.success("Webhook endpoint registered successfully");
      setIsAddWebhookOpen(false);
      setWebhookUrl("");
      loadWebhooks();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to create webhook";
      toast.error(msg);
    } finally {
      setAddingWebhook(false);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      if (LIVE_MODE) {
        await webhooksApi.delete(id);
      } else {
        const updated = webhooks.filter((w) => w.id !== id);
        setWebhooks(updated);
        localStorage.setItem("forge_demo_webhooks", JSON.stringify(updated));
      }
      toast.success("Webhook endpoint removed");
      loadWebhooks();
    } catch {
      toast.error("Failed to delete webhook");
    }
  };

  const handleTestPing = async (id: string, url: string) => {
    setTestingId(id);
    try {
      await new Promise((r) => setTimeout(r, 650));
      toast.success(`Ping dispatched to ${url} (HTTP 200 OK)`);
    } catch {
      toast.error("Webhook test ping failed");
    } finally {
      setTestingId(null);
    }
  };

  const toggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    );
  };

  return (
    <div id="settings-integrations-panel" className="space-y-8">
      {/* GitHub Integration */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <GitBranch size={15} className="text-accent" />
              GitHub Repository Sync
            </h2>
            <p className="text-xs text-muted mt-1">
              Allow Forge agents to clone, commit, create pull requests, and push branches directly to GitHub.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {user?.github_connected ? (
              <span className="text-[11px] font-mono bg-ok/10 text-ok border border-ok/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <CheckCircle2 size={12} /> Connected
              </span>
            ) : (
              <span className="text-[11px] font-mono bg-base text-muted border border-border-soft px-2.5 py-1 rounded-full">
                Not Connected
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveGithub} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="github-token-input" className="text-xs font-medium text-ink flex items-center justify-between">
                <span>Personal Access Token (PAT)</span>
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-accent hover:underline flex items-center gap-0.5"
                >
                  Generate on GitHub <ExternalLink size={10} />
                </a>
              </label>
              <input
                id="github-token-input"
                type="password"
                placeholder={user?.github_connected ? "•••••••••••••••••••••••• (Leave blank to keep connected)" : "ghp_..."}
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                className="w-full text-xs font-mono bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <p className="text-[11px] text-faint">Requires `repo` scope to manage files and pull requests.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="github-repo-input" className="text-xs font-medium text-ink block">
                Target Repository
              </label>
              <input
                id="github-repo-input"
                type="text"
                placeholder="organization/repository-name"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                className="w-full text-xs font-mono bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-lg border border-border-soft bg-base/40">
            <div>
              <span className="text-xs font-medium text-ink block">Auto-create Pull Requests</span>
              <span className="text-[11px] text-muted">Automatically opens a pull request with an AI-generated architectural summary.</span>
            </div>
            <input
              type="checkbox"
              checked={autoPr}
              onChange={(e) => setAutoPr(e.target.checked)}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              id="github-save-btn"
              type="submit"
              disabled={savingGithub}
              className="bb-btn bb-btn-primary text-xs px-4 py-2 font-medium"
            >
              {savingGithub ? "Saving..." : "Save GitHub Configuration"}
            </button>
          </div>
        </form>
      </section>

      {/* Outgoing Webhooks */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Webhook size={15} className="text-accent" />
              Outgoing Webhook Endpoints
            </h2>
            <p className="text-xs text-muted mt-1">
              Deliver real-time JSON payloads to your servers or serverless functions when build & deploy events fire.
            </p>
          </div>

          <button
            id="add-webhook-btn"
            type="button"
            onClick={() => setIsAddWebhookOpen(true)}
            className="bb-btn bb-btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Plus size={14} />
            Add Webhook
          </button>
        </div>

        {revealedSecret && (
          <div
            role="alert"
            className="mb-4 p-4 rounded-xl border border-warn/40 bg-warn/5 space-y-2 text-xs"
          >
            <div className="flex items-center gap-1.5 font-semibold text-ink">
              <Shield size={13} />
              Copy your signing secret now — it won't be shown again.
            </div>
            <p className="text-muted">
              Use it to verify the X-Forge-Signature header on deliveries to{" "}
              <code className="font-mono">{revealedSecret.url}</code>.
            </p>
            <div className="flex items-center gap-2">
              <code data-testid="revealed-webhook-secret" className="flex-1 truncate font-mono text-ink">
                {revealedSecret.secret}
              </code>
              <ClipboardCopyButton
                text={revealedSecret.secret}
                successMessage="Secret copied"
                className="text-xs text-accent hover:underline flex items-center gap-1"
              />
              <button
                type="button"
                onClick={() => setRevealedSecret(null)}
                className="bb-btn bb-btn-subtle text-xs py-1 px-2.5 h-7"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {loadingWebhooks ? (
          <div className="p-8 text-center text-xs text-muted">Loading webhooks...</div>
        ) : webhooks.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-border-soft rounded-xl text-xs text-muted space-y-1">
            <Globe size={24} className="mx-auto text-muted/50 mb-2" />
            <p className="font-medium text-ink">No webhooks registered</p>
            <p className="text-[11px] text-faint">Add a webhook to integrate Forge with Slack, Discord, or custom pipelines.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((hook) => (
              <div
                key={hook.id}
                className="p-4 rounded-xl border border-border-soft bg-base/50 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="h-2 w-2 rounded-full bg-ok shrink-0" />
                    <code className="text-xs font-mono font-medium text-ink truncate">{hook.url}</code>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* No backend endpoint sends a test delivery yet, so the
                        ping (which only simulated "HTTP 200 OK") is demo-only. */}
                    {!LIVE_MODE && (
                    <button
                      type="button"
                      onClick={() => handleTestPing(hook.id, hook.url)}
                      disabled={testingId === hook.id}
                      className="bb-btn bb-btn-subtle text-xs py-1 px-2.5 h-7 flex items-center gap-1"
                      title="Send test ping"
                    >
                      <Send size={11} className={testingId === hook.id ? "animate-spin" : ""} />
                      {testingId === hook.id ? "Sending..." : "Test Ping"}
                    </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteWebhook(hook.id)}
                      className="p-1.5 text-muted hover:text-error hover:bg-error/10 rounded transition"
                      title="Delete webhook"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {hook.events.map((ev) => (
                    <span
                      key={ev}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-panel border border-border-soft text-muted"
                    >
                      {ev}
                    </span>
                  ))}
                </div>

                {hook.secret && (
                  <div className="pt-2 border-t border-border-soft/60 flex items-center justify-between text-[11px] text-faint font-mono">
                    <div className="flex items-center gap-1.5">
                      <Shield size={11} className="text-muted" />
                      <span>Signing Secret:</span>
                      <code className="text-muted">{hook.secret.substring(0, 10)}••••••••</code>
                    </div>
                    <ClipboardCopyButton
                      text={hook.secret}
                      successMessage="Secret copied"
                      className="text-xs text-accent hover:underline flex items-center gap-1"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Webhook Modal */}
      {isAddWebhookOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border border-border bg-panel p-6 shadow-2xl space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                <Webhook size={16} className="text-accent" />
                Register Webhook Endpoint
              </h3>
              <p className="text-xs text-muted mt-1">
                Payloads are signed via HMAC SHA-256 in the <code className="text-ink">X-Forge-Signature</code> header.
              </p>
            </div>

            <form onSubmit={handleAddWebhook} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="webhook-url-input" className="text-xs font-medium text-ink block">
                  Endpoint URL (HTTPS only)
                </label>
                <input
                  id="webhook-url-input"
                  type="url"
                  required
                  placeholder="https://api.yourdomain.com/webhooks/forge"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full text-xs font-mono bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-ink block">Subscribed Events</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <label
                      key={ev.id}
                      htmlFor={`webhook-ev-${ev.id}`}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                        selectedEvents.includes(ev.id)
                          ? "border-accent bg-accent/5"
                          : "border-border-soft bg-base/40 hover:bg-base"
                      }`}
                    >
                      <input
                        id={`webhook-ev-${ev.id}`}
                        type="checkbox"
                        checked={selectedEvents.includes(ev.id)}
                        onChange={() => toggleEvent(ev.id)}
                        className="rounded text-accent focus:ring-accent"
                      />
                      <span className="font-mono text-[11px] text-ink">{ev.id}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-border-soft flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddWebhookOpen(false)}
                  className="bb-btn bb-btn-subtle text-xs px-3.5 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingWebhook}
                  className="bb-btn bb-btn-primary text-xs px-4 py-2 font-medium"
                >
                  {addingWebhook ? "Registering..." : "Add Endpoint"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
