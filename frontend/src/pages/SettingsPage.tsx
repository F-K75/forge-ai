import { useEffect, useRef, useState } from "react";
import { Key, Github, Bell, Sliders, Monitor, ShieldCheck, Copy, LifeBuoy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { DEFAULT_SETTINGS } from "../lib/mockData";
import { Row } from "../components/Row";
import { Toggle } from "../components/Toggle";
import { LIVE_MODE } from "../lib/env";
import { authApi, supportApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";

type Settings = typeof DEFAULT_SETTINGS;

type SessionInfo = {
  id: string;
  user_agent?: string | null;
  ip_address?: string | null;
  created_at: string;
  last_active_at: string;
  is_current: boolean;
};

// Very small heuristic to turn a raw User-Agent string into something
// readable -- no full UA-parser library, just the common cases.
function describeUserAgent(ua?: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
    ? "Chrome"
    : /Firefox\//.test(ua)
    ? "Firefox"
    : /Safari\//.test(ua)
    ? "Safari"
    : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
    ? "macOS"
    : /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Linux/.test(ua)
    ? "Linux"
    : "Unknown OS";
  return `${browser} on ${os}`;
}

function formatLastActive(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Active just now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Active ${days}d ago`;
}

export default function SettingsPage() {
  const { user, fetchMe } = useAuthStore();

  // Demo-mode-only local state (no backend to persist to).
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setSettings(prev => ({ ...prev, [key]: val }));
  }

  const preferences = (user?.preferences ?? {}) as Record<string, unknown>;
  const notifyOnBuild = LIVE_MODE ? Boolean(preferences.notifyOnBuild ?? true) : settings.notifyOnBuild;
  const autoDeploy = LIVE_MODE ? Boolean(preferences.autoDeploy ?? false) : settings.autoDeploy;
  const debugIterations = LIVE_MODE ? Number(preferences.debugIterations ?? 3) : settings.debugIterations;
  const githubConnected = LIVE_MODE ? Boolean(user?.github_connected) : settings.github.connected;
  const byokConnected = LIVE_MODE ? Boolean(user?.byok_connected) : settings.byok;
  const canUseByok = LIVE_MODE ? user?.plan === "pro" || user?.plan === "enterprise" : true;

  const savePreference = async (key: string, value: unknown) => {
    if (!LIVE_MODE) return;
    try {
      await authApi.updateProfile({ preferences: { [key]: value } });
      await fetchMe();
    } catch {
      toast.error("Failed to save setting");
    }
  };

  // Debounce the debug-iterations stepper so rapid clicks don't fire a
  // request per click.
  const debounceRef = useRef<number | null>(null);
  const saveDebugIterations = (value: number) => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => savePreference("debugIterations", value), 400);
  };
  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
  }, []);

  // GitHub connect (paste a personal access token — no OAuth flow exists).
  const [githubTokenInput, setGithubTokenInput] = useState("");
  const [showGithubInput, setShowGithubInput] = useState(false);
  const [savingGithub, setSavingGithub] = useState(false);

  const handleConnectGithub = async () => {
    if (!githubTokenInput.trim()) return;
    setSavingGithub(true);
    try {
      await authApi.updateProfile({ github_token: githubTokenInput.trim() });
      await fetchMe();
      setGithubTokenInput("");
      setShowGithubInput(false);
      toast.success("GitHub connected");
    } catch {
      toast.error("Failed to connect GitHub");
    } finally {
      setSavingGithub(false);
    }
  };

  const handleDisconnectGithub = async () => {
    setSavingGithub(true);
    try {
      await authApi.updateProfile({ github_token: "" });
      await fetchMe();
      toast.success("GitHub disconnected");
    } catch {
      toast.error("Failed to disconnect GitHub");
    } finally {
      setSavingGithub(false);
    }
  };

  // Bring-your-own-key (Pro+): paste an Anthropic key to use instead of
  // Forge credits. Gated server-side too (PUT /auth/me) -- this UI hiding
  // the input for non-Pro users is a courtesy, not the real enforcement.
  const [byokKeyInput, setByokKeyInput] = useState("");
  const [showByokInput, setShowByokInput] = useState(false);
  const [savingByok, setSavingByok] = useState(false);

  const handleConnectByok = async () => {
    if (!byokKeyInput.trim()) return;
    setSavingByok(true);
    try {
      if (LIVE_MODE) {
        await authApi.updateProfile({ anthropic_api_key: byokKeyInput.trim() });
        await fetchMe();
      } else {
        set("byok", true);
      }
      setByokKeyInput("");
      setShowByokInput(false);
      toast.success("Anthropic key connected");
    } catch {
      toast.error("Failed to connect key");
    } finally {
      setSavingByok(false);
    }
  };

  const handleDisconnectByok = async () => {
    setSavingByok(true);
    try {
      if (LIVE_MODE) {
        await authApi.updateProfile({ anthropic_api_key: "" });
        await fetchMe();
      } else {
        set("byok", false);
      }
      toast.success("Anthropic key disconnected");
    } catch {
      toast.error("Failed to disconnect key");
    } finally {
      setSavingByok(false);
    }
  };

  // Two-factor authentication (MFA / TOTP, SEC-007)
  const mfaEnabled = LIVE_MODE ? Boolean(user?.mfa_enabled) : false;
  const [mfaStep, setMfaStep] = useState<"idle" | "qr" | "backup-codes">("idle");
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaOtpauthUri, setMfaOtpauthUri] = useState("");
  const [mfaSetupCode, setMfaSetupCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showDisablePrompt, setShowDisablePrompt] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  const handleStartMfaSetup = async () => {
    setMfaBusy(true);
    try {
      const { secret, otpauth_uri } = await authApi.mfa.setup();
      setMfaSecret(secret);
      setMfaOtpauthUri(otpauth_uri);
      setMfaStep("qr");
    } catch {
      toast.error("Failed to start MFA setup");
    } finally {
      setMfaBusy(false);
    }
  };

  const handleVerifyMfaSetup = async () => {
    if (!mfaSetupCode.trim()) return;
    setMfaBusy(true);
    try {
      const { backup_codes } = await authApi.mfa.verifySetup(mfaSetupCode.trim());
      setBackupCodes(backup_codes);
      setMfaStep("backup-codes");
      setMfaSetupCode("");
      await fetchMe();
      toast.success("Two-factor authentication enabled");
    } catch {
      toast.error("Invalid code. Please try again.");
    } finally {
      setMfaBusy(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!disablePassword.trim()) return;
    setMfaBusy(true);
    try {
      await authApi.mfa.disable(disablePassword);
      await fetchMe();
      setShowDisablePrompt(false);
      setDisablePassword("");
      setMfaStep("idle");
      toast.success("Two-factor authentication disabled");
    } catch {
      toast.error("Incorrect password");
    } finally {
      setMfaBusy(false);
    }
  };

  const handleCopyBackupCodes = async () => {
    const text = backupCodes.join("\n");
    // navigator.clipboard is undefined outside a secure context (e.g. a
    // plain-HTTP deployment) -- these codes are shown exactly once, so a
    // silent failure here is worse than for a typical "copy" button.
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Backup codes copied");
      } catch {
        toast.error("Failed to copy");
      }
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand("copy");
      toast.success("Backup codes copied");
    } catch {
      toast.error("Failed to copy");
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleDoneWithBackupCodes = () => {
    setMfaStep("idle");
    setBackupCodes([]);
    setMfaSecret("");
    setMfaOtpauthUri("");
  };

  // Support
  const [supportSubject, setSupportSubject] = useState("");
  const [supportDescription, setSupportDescription] = useState("");
  const [supportSubmitting, setSupportSubmitting] = useState(false);

  const handleSubmitSupportTicket = async () => {
    if (!supportSubject.trim() || !supportDescription.trim()) return;
    setSupportSubmitting(true);
    try {
      await supportApi.create({ subject: supportSubject.trim(), description: supportDescription.trim() });
      toast.success("Support ticket submitted");
      setSupportSubject("");
      setSupportDescription("");
    } catch {
      toast.error("Failed to submit ticket");
    } finally {
      setSupportSubmitting(false);
    }
  };

  // Active sessions / devices
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const loadSessions = async () => {
    if (!LIVE_MODE) return;
    setSessionsLoading(true);
    try {
      const data = await authApi.sessions.list();
      setSessions(data);
    } catch {
      toast.error("Failed to load sessions");
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRevokeSession = async (id: string) => {
    setRevokingId(id);
    try {
      await authApi.sessions.revoke(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      toast.success("Session revoked");
    } catch {
      toast.error("Failed to revoke session");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      await authApi.sessions.revokeAll();
      setSessions(prev => prev.filter(s => s.is_current));
      toast.success("Logged out of all other devices");
    } catch {
      toast.error("Failed to log out other devices");
    } finally {
      setRevokingAll(false);
    }
  };

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-xl font-semibold text-ink mb-8">Settings</h1>

      <div className="max-w-2xl space-y-10">

        {/* API key */}
        <section aria-labelledby="section-api-key">
          <div className="flex items-center gap-2 mb-2">
            <Key size={13} className="text-muted" aria-hidden="true" />
            <h2 id="section-api-key" className="text-sm font-semibold text-ink">API key</h2>
          </div>
          <div className="rounded-xl border border-border bg-panel">
            <Row
              label="Bring your own key"
              description={
                !canUseByok
                  ? "Available on the Pro plan — skip credit costs on every build"
                  : byokConnected
                  ? !LIVE_MODE
                    ? settings.maskedKey
                    : "Connected — your builds use this key instead of credits"
                  : showByokInput
                  ? "Paste an Anthropic API key (sk-ant-…)"
                  : "Use your Anthropic API key instead of Forge credits"
              }
            >
              {!canUseByok ? (
                <a
                  href="/billing"
                  className="text-xs text-accent hover:text-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors motion-reduce:transition-none"
                >
                  Upgrade
                </a>
              ) : byokConnected ? (
                <button
                  onClick={handleDisconnectByok}
                  disabled={savingByok}
                  className="text-xs text-error hover:text-error/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors motion-reduce:transition-none disabled:opacity-50"
                >
                  {savingByok ? "…" : "Disconnect"}
                </button>
              ) : showByokInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={byokKeyInput}
                    onChange={e => setByokKeyInput(e.target.value)}
                    placeholder="sk-ant-…"
                    aria-label="Anthropic API key"
                    className="h-8 px-2.5 w-40 rounded-md bg-panel-alt border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <button
                    onClick={handleConnectByok}
                    disabled={savingByok || !byokKeyInput.trim()}
                    className="text-xs text-accent hover:text-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors motion-reduce:transition-none disabled:opacity-50"
                  >
                    {savingByok ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowByokInput(true)}
                  className="text-xs text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors motion-reduce:transition-none"
                >
                  Connect
                </button>
              )}
            </Row>
          </div>
        </section>

        {/* Connections */}
        <section aria-labelledby="section-connections">
          <div className="flex items-center gap-2 mb-2">
            <Github size={13} className="text-muted" aria-hidden="true" />
            <h2 id="section-connections" className="text-sm font-semibold text-ink">Connections</h2>
          </div>
          <div className="rounded-xl border border-border bg-panel">
            <Row
              label="GitHub"
              description={
                !LIVE_MODE
                  ? githubConnected
                    ? `Connected to ${settings.github.repo}`
                    : "Not connected"
                  : githubConnected
                  ? "Connected"
                  : showGithubInput
                  ? "Paste a personal access token with repo scope"
                  : "Not connected"
              }
            >
              {!LIVE_MODE ? (
                <span className={`text-xs font-medium ${githubConnected ? "text-ok" : "text-muted"}`}>
                  {githubConnected ? "Connected" : "Connect"}
                </span>
              ) : githubConnected ? (
                <button
                  onClick={handleDisconnectGithub}
                  disabled={savingGithub}
                  className="text-xs text-error hover:text-error/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors motion-reduce:transition-none disabled:opacity-50"
                >
                  {savingGithub ? "…" : "Disconnect"}
                </button>
              ) : showGithubInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={githubTokenInput}
                    onChange={e => setGithubTokenInput(e.target.value)}
                    placeholder="ghp_…"
                    aria-label="GitHub personal access token"
                    className="h-8 px-2.5 w-40 rounded-md bg-panel-alt border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <button
                    onClick={handleConnectGithub}
                    disabled={savingGithub || !githubTokenInput.trim()}
                    className="text-xs text-accent hover:text-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors motion-reduce:transition-none disabled:opacity-50"
                  >
                    {savingGithub ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowGithubInput(true)}
                  className="text-xs text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors motion-reduce:transition-none"
                >
                  Connect
                </button>
              )}
            </Row>
          </div>
        </section>

        {/* Notifications */}
        <section aria-labelledby="section-notifications">
          <div className="flex items-center gap-2 mb-2">
            <Bell size={13} className="text-muted" aria-hidden="true" />
            <h2 id="section-notifications" className="text-sm font-semibold text-ink">Notifications</h2>
          </div>
          <div className="rounded-xl border border-border bg-panel">
            <Row
              label="Build complete"
              description="Send an email when a build finishes"
            >
              <Toggle
                on={notifyOnBuild}
                onChange={v => {
                  if (LIVE_MODE) savePreference("notifyOnBuild", v);
                  else set("notifyOnBuild", v);
                }}
                label="Notify on build complete"
              />
            </Row>
          </div>
        </section>

        {/* Defaults */}
        <section aria-labelledby="section-defaults">
          <div className="flex items-center gap-2 mb-2">
            <Sliders size={13} className="text-muted" aria-hidden="true" />
            <h2 id="section-defaults" className="text-sm font-semibold text-ink">Defaults</h2>
          </div>
          <div className="rounded-xl border border-border bg-panel">
            <Row
              label="Auto-deploy"
              description="Push to a live container when QA score passes 85"
            >
              <Toggle
                on={autoDeploy}
                onChange={v => {
                  if (LIVE_MODE) savePreference("autoDeploy", v);
                  else set("autoDeploy", v);
                }}
                label="Auto-deploy"
              />
            </Row>
            <Row
              label="Debug iterations"
              description="Maximum times an agent reruns on failure"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = Math.max(1, debugIterations - 1);
                    if (LIVE_MODE) saveDebugIterations(next);
                    else set("debugIterations", next);
                  }}
                  aria-label="Decrease debug iterations"
                  className="w-7 h-7 rounded-md bg-panel-alt border border-border text-ink text-sm flex items-center justify-center hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors motion-reduce:transition-none"
                >
                  −
                </button>
                <span
                  className="font-mono text-sm text-ink w-4 text-center"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {debugIterations}
                </span>
                <button
                  onClick={() => {
                    const next = Math.min(5, debugIterations + 1);
                    if (LIVE_MODE) saveDebugIterations(next);
                    else set("debugIterations", next);
                  }}
                  aria-label="Increase debug iterations"
                  className="w-7 h-7 rounded-md bg-panel-alt border border-border text-ink text-sm flex items-center justify-center hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors motion-reduce:transition-none"
                >
                  +
                </button>
              </div>
            </Row>
          </div>
        </section>

        {/* Two-factor authentication */}
        {LIVE_MODE && (
          <section aria-labelledby="section-security">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={13} className="text-muted" aria-hidden="true" />
              <h2 id="section-security" className="text-sm font-semibold text-ink">Security</h2>
            </div>
            <div className="rounded-xl border border-border bg-panel">
              <Row
                label="Two-factor authentication"
                description={
                  mfaEnabled
                    ? "Enabled -- an authenticator code is required at sign in"
                    : "Require a code from an authenticator app when signing in"
                }
              >
                {mfaEnabled ? (
                  showDisablePrompt ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        value={disablePassword}
                        onChange={e => setDisablePassword(e.target.value)}
                        placeholder="Password"
                        aria-label="Confirm password to disable 2FA"
                        className="h-8 px-2.5 w-32 rounded-md bg-panel-alt border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      />
                      <button
                        onClick={handleDisableMfa}
                        disabled={mfaBusy || !disablePassword.trim()}
                        className="text-xs text-error hover:text-error/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors disabled:opacity-50"
                      >
                        {mfaBusy ? "…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => { setShowDisablePrompt(false); setDisablePassword(""); }}
                        className="text-xs text-muted hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Toggle on={true} onChange={() => setShowDisablePrompt(true)} label="Two-factor authentication" />
                  )
                ) : mfaStep === "idle" ? (
                  <Toggle on={false} onChange={handleStartMfaSetup} label="Two-factor authentication" disabled={mfaBusy} />
                ) : (
                  <span className="text-xs text-muted">In progress below</span>
                )}
              </Row>

              {mfaStep === "qr" && (
                <div className="px-4 py-4 border-t border-border space-y-4">
                  <p className="text-xs text-muted">
                    Scan this QR code with an authenticator app (e.g. Google Authenticator, 1Password), then enter the
                    6-digit code it generates.
                  </p>
                  <div className="bg-white p-3 rounded-md inline-block">
                    <QRCodeSVG value={mfaOtpauthUri} size={160} />
                  </div>
                  <p className="text-[11px] font-mono text-faint break-all">Secret: {mfaSecret}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={mfaSetupCode}
                      onChange={e => setMfaSetupCode(e.target.value)}
                      placeholder="123456"
                      aria-label="6-digit authentication code"
                      className="h-8 px-2.5 w-28 rounded-md bg-panel-alt border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent tracking-widest"
                    />
                    <button
                      onClick={handleVerifyMfaSetup}
                      disabled={mfaBusy || !mfaSetupCode.trim()}
                      className="text-xs text-accent hover:text-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors disabled:opacity-50"
                    >
                      {mfaBusy ? "Verifying…" : "Verify & enable"}
                    </button>
                    <button
                      onClick={() => { setMfaStep("idle"); setMfaSecret(""); setMfaOtpauthUri(""); }}
                      className="text-xs text-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {mfaStep === "backup-codes" && (
                <div className="px-4 py-4 border-t border-border space-y-3">
                  <p className="text-xs text-ink font-medium">Save your backup codes</p>
                  <p className="text-xs text-muted">
                    Each code can be used once to sign in if you lose access to your authenticator app. They will not
                    be shown again -- store them somewhere safe.
                  </p>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs bg-panel-alt border border-border rounded-md p-3">
                    {backupCodes.map(code => (
                      <span key={code}>{code}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleCopyBackupCodes}
                      className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80"
                    >
                      <Copy size={12} aria-hidden="true" /> Copy codes
                    </button>
                    <button
                      onClick={handleDoneWithBackupCodes}
                      className="text-xs text-muted hover:text-ink"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Active sessions */}
        {LIVE_MODE && (
          <section aria-labelledby="section-sessions">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Monitor size={13} className="text-muted" aria-hidden="true" />
                <h2 id="section-sessions" className="text-sm font-semibold text-ink">Active sessions</h2>
              </div>
              {sessions.some(s => !s.is_current) && (
                <button
                  onClick={handleRevokeAll}
                  disabled={revokingAll}
                  className="text-xs text-error hover:text-error/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors motion-reduce:transition-none disabled:opacity-50"
                >
                  {revokingAll ? "Logging out…" : "Log out of all other devices"}
                </button>
              )}
            </div>
            <div className="rounded-xl border border-border bg-panel">
              {sessionsLoading ? (
                <div className="px-4 py-3 text-xs text-muted">Loading…</div>
              ) : sessions.length === 0 ? (
                <div className="px-4 py-3 text-xs text-muted">No active sessions</div>
              ) : (
                sessions.map(session => (
                  <Row
                    key={session.id}
                    label={
                      <span className="flex items-center gap-2">
                        {describeUserAgent(session.user_agent)}
                        {session.is_current && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-panel-alt text-faint border border-border">
                            This device
                          </span>
                        )}
                      </span>
                    }
                    description={`${session.ip_address ?? "Unknown IP"} · ${formatLastActive(session.last_active_at)}`}
                  >
                    {!session.is_current && (
                      <button
                        onClick={() => handleRevokeSession(session.id)}
                        disabled={revokingId === session.id}
                        className="text-xs text-error hover:text-error/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors motion-reduce:transition-none disabled:opacity-50"
                      >
                        {revokingId === session.id ? "…" : "Revoke"}
                      </button>
                    )}
                  </Row>
                ))
              )}
            </div>
          </section>
        )}

        {/* Support */}
        <section aria-labelledby="section-support">
          <div className="flex items-center gap-2 mb-2">
            <LifeBuoy size={13} className="text-muted" aria-hidden="true" />
            <h2 id="section-support" className="text-sm font-semibold text-ink">Support</h2>
          </div>
          <div className="rounded-xl border border-border bg-panel p-4 space-y-3">
            <div>
              <label htmlFor="support-subject" className="block text-xs text-muted mb-1">Subject</label>
              <input
                id="support-subject"
                type="text"
                value={supportSubject}
                onChange={(e) => setSupportSubject(e.target.value)}
                placeholder="Briefly describe the issue"
                maxLength={200}
                className="w-full bg-panel-alt border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
            <div>
              <label htmlFor="support-description" className="block text-xs text-muted mb-1">Description</label>
              <textarea
                id="support-description"
                value={supportDescription}
                onChange={(e) => setSupportDescription(e.target.value)}
                placeholder="What happened, and what were you expecting?"
                rows={4}
                maxLength={5000}
                className="w-full resize-none bg-panel-alt border border-border rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
            <button
              onClick={handleSubmitSupportTicket}
              disabled={supportSubmitting || !supportSubject.trim() || !supportDescription.trim()}
              className="text-xs px-3 py-2 bg-accent hover:opacity-90 text-white rounded-lg transition-opacity motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
            >
              {supportSubmitting ? "Submitting…" : "Submit ticket"}
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
