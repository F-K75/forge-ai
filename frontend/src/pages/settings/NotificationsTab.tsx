import { useEffect, useState } from "react";
import { Bell, Mail, Monitor, Volume2, ShieldAlert, CreditCard, Sparkles, Lightbulb } from "lucide-react";
import { toast } from "react-hot-toast";
import { authApi, emailPreferencesApi } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { useAuthStore } from "../../store/authStore";
import type { NotificationPreferences } from "./types";

/**
 * Onboarding tips and reminders (the server-side marketing-email opt-in, which
 * the unsubscribe link in those emails also writes). Saved immediately on
 * change, separately from the form below, and reverted if the save fails so
 * the checkbox never shows a state the server doesn't have.
 */
function ProductEmailsSection() {
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">(
    LIVE_MODE ? "loading" : "ready",
  );

  useEffect(() => {
    if (!LIVE_MODE) return;
    let cancelled = false;
    emailPreferencesApi
      .get()
      .then((prefs) => {
        if (cancelled) return;
        setEnabled(prefs.marketing_emails);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = async (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    if (!LIVE_MODE) {
      toast.success(next ? "Product emails turned on" : "Product emails turned off");
      return;
    }
    setStatus("saving");
    try {
      const saved = await emailPreferencesApi.update({ marketing_emails: next });
      setEnabled(saved.marketing_emails);
      toast.success(saved.marketing_emails ? "Product emails turned on" : "Product emails turned off");
    } catch {
      setEnabled(previous);
      toast.error("Couldn't save your email preference. Please try again.");
    } finally {
      setStatus("ready");
    }
  };

  return (
    <section
      id="settings-product-emails"
      className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-4"
    >
      {/* Not wrapped in <label>: the global styles uppercase label text. The
          checkbox is named by the heading via aria-labelledby instead. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="product-emails-heading" className="text-sm font-semibold text-ink flex items-center gap-2">
            <Lightbulb size={15} className="text-accent" />
            Product tips & reminders
          </h2>
          <p id="product-emails-description" className="text-xs text-muted mt-1">
            Occasional emails to help you get started, like a reminder to try your first build and
            tips for planning bigger projects. Account emails (password resets, billing, security)
            are always sent.
          </p>
          {status === "error" && (
            <p role="alert" className="text-[11px] text-warn mt-2">
              Couldn't load this setting. Refresh the page to try again.
            </p>
          )}
        </div>
        <input
          id="product-emails-toggle"
          type="checkbox"
          aria-labelledby="product-emails-heading"
          aria-describedby="product-emails-description"
          checked={enabled}
          disabled={status !== "ready"}
          onChange={(e) => handleChange(e.target.checked)}
          className="h-4 w-4 mt-1 shrink-0 rounded text-accent focus:ring-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      <p className="text-[11px] text-muted">Saved automatically.</p>
    </section>
  );
}

export function NotificationsTab() {
  const { user } = useAuthStore();
  const userPrefs = (user?.preferences as Record<string, any>) || {};
  const storedNotifs: Partial<NotificationPreferences> =
    (userPrefs.notifications as Partial<NotificationPreferences>) || {};

  const [prefs, setPrefs] = useState<NotificationPreferences>({
    emailBuildComplete: storedNotifs.emailBuildComplete ?? true,
    emailBuildFailed: storedNotifs.emailBuildFailed ?? true,
    emailDeploySuccess: storedNotifs.emailDeploySuccess ?? true,
    emailLowCredits: storedNotifs.emailLowCredits ?? true,
    emailSecurityAlerts: storedNotifs.emailSecurityAlerts ?? true,
    inAppToasts: storedNotifs.inAppToasts ?? true,
    audioAlerts: storedNotifs.audioAlerts ?? true,
    digestFrequency: storedNotifs.digestFrequency || "realtime",
  });

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (LIVE_MODE) {
        await authApi.updateProfile({
          preferences: {
            ...userPrefs,
            notifications: prefs,
          },
        });
      }
      toast.success("Notification preferences updated");
    } catch {
      toast.error("Failed to save notification settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="settings-notifications-panel" className="space-y-8">
      {/* Delivery Channels */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Bell size={15} className="text-accent" />
            Alert Channels
          </h2>
          <p className="text-xs text-muted mt-1">
            Configure how and where Forge contacts you for engineering events and workspace updates.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-border-soft bg-base/40 space-y-3">
            <div className="flex items-center gap-2 text-ink text-xs font-semibold">
              <Mail size={16} className="text-accent" />
              <span>Email Alerts</span>
            </div>
            <p className="text-[11px] text-muted">
              Delivered to <span className="text-ink font-mono">{user?.email || "your email"}</span>.
            </p>
            <span className="text-[10px] text-ok bg-ok/10 border border-ok/20 px-2 py-0.5 rounded font-mono inline-block">
              Primary Channel
            </span>
          </div>

          <div className="p-4 rounded-xl border border-border-soft bg-base/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-ink text-xs font-semibold">
                <Monitor size={16} className="text-accent" />
                <span>In-App Toasts</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.inAppToasts}
                onChange={(e) => setPrefs((p) => ({ ...p, inAppToasts: e.target.checked }))}
                className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-muted">
              Shows bottom-right toast notifications while working in the active tab.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border-soft bg-base/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-ink text-xs font-semibold">
                <Volume2 size={16} className="text-accent" />
                <span>Audio Cues</span>
              </div>
              <input
                type="checkbox"
                checked={prefs.audioAlerts}
                onChange={(e) => setPrefs((p) => ({ ...p, audioAlerts: e.target.checked }))}
                className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-muted">
              Subtle audio chimes when long-running autonomous workflows complete.
            </p>
          </div>
        </div>
      </section>

      {/* Event Matrix */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Sparkles size={15} className="text-accent" />
            Event Trigger Preferences
          </h2>
          <p className="text-xs text-muted mt-1">
            Select the specific engineering and account events that send notifications.
          </p>
        </div>

        <div className="divide-y divide-border-soft">
          <label htmlFor="notif-build-complete" className="py-3.5 flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-medium text-ink block">Build Succeeded & QA Verified</span>
              <span className="text-[11px] text-muted">Notify when the agent fleet finishes a build and passes all test suites.</span>
            </div>
            <input
              id="notif-build-complete"
              type="checkbox"
              checked={prefs.emailBuildComplete}
              onChange={(e) => setPrefs((p) => ({ ...p, emailBuildComplete: e.target.checked }))}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </label>

          <label htmlFor="notif-build-failed" className="py-3.5 flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-medium text-ink block">Build Failed / Error Needs Review</span>
              <span className="text-[11px] text-muted">Notify when an autonomous agent pauses for human intervention after exhausting retries.</span>
            </div>
            <input
              id="notif-build-failed"
              type="checkbox"
              checked={prefs.emailBuildFailed}
              onChange={(e) => setPrefs((p) => ({ ...p, emailBuildFailed: e.target.checked }))}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </label>

          <label htmlFor="notif-deploy-success" className="py-3.5 flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-medium text-ink block">Deployment Published</span>
              <span className="text-[11px] text-muted">Receive public URL link and build sha when an app is deployed live.</span>
            </div>
            <input
              id="notif-deploy-success"
              type="checkbox"
              checked={prefs.emailDeploySuccess}
              onChange={(e) => setPrefs((p) => ({ ...p, emailDeploySuccess: e.target.checked }))}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </label>

          <label htmlFor="notif-low-credits" className="py-3.5 flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-medium text-ink flex items-center gap-1.5">
                <CreditCard size={13} className="text-accent" />
                Credit Balance Warning
              </span>
              <span className="text-[11px] text-muted">Alert when account credits fall below 100 or when monthly renewal occurs.</span>
            </div>
            <input
              id="notif-low-credits"
              type="checkbox"
              checked={prefs.emailLowCredits}
              onChange={(e) => setPrefs((p) => ({ ...p, emailLowCredits: e.target.checked }))}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </label>

          <label htmlFor="notif-security-alerts" className="py-3.5 flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-medium text-ink flex items-center gap-1.5">
                <ShieldAlert size={13} className="text-warn" />
                Security & Account Alerts
              </span>
              <span className="text-[11px] text-muted">Immediate email when a new device signs in or credentials change.</span>
            </div>
            <input
              id="notif-security-alerts"
              type="checkbox"
              checked={prefs.emailSecurityAlerts}
              onChange={(e) => setPrefs((p) => ({ ...p, emailSecurityAlerts: e.target.checked }))}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </label>
        </div>

        {/* Digest Frequency */}
        <div className="pt-4 border-t border-border-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-ink block">Email Digest Cadence</span>
            <span className="text-[11px] text-muted">Consolidate routine build logs into scheduled summaries.</span>
          </div>

          <div className="flex items-center gap-1 bg-base p-1 rounded-lg border border-border-soft text-xs">
            {(
              [
                { id: "realtime", label: "Real-time" },
                { id: "daily", label: "Daily (9am)" },
                { id: "weekly", label: "Weekly" },
                { id: "off", label: "None" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, digestFrequency: opt.id }))}
                className={`px-3 py-1 rounded font-medium transition ${
                  prefs.digestFrequency === opt.id
                    ? "bg-panel text-ink shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-border-soft flex items-center justify-end">
          <button
            id="notifications-save-btn"
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bb-btn bb-btn-primary text-xs px-4 py-2 font-medium"
          >
            {saving ? "Saving..." : "Save Notification Settings"}
          </button>
        </div>
      </section>

      <ProductEmailsSection />
    </div>
  );
}
