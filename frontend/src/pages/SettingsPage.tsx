import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Key, Github, Bell, Sliders, Monitor, ShieldCheck, LifeBuoy, Palette, Lock, Download, Trash2 } from "lucide-react";
import { ThemeSegmented } from "../components/ThemeToggle";
import { QRCodeSVG } from "qrcode.react";
import toast from "react-hot-toast";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { motionVariants } from "../lib/animations";
import { presets } from "../lib/animationPresets";
import { DEFAULT_SETTINGS } from "../lib/mockData";
import { Row } from "../components/Row";
import { Toggle } from "../components/Toggle";
import { ClipboardCopyButton } from "../components/ui/ClipboardCopyButton";
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
  const { user, fetchMe, logout } = useAuthStore();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

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
      toast.error("Couldn't save that setting.");
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
      toast.error("Couldn't connect GitHub.");
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
      toast.error("Couldn't disconnect GitHub.");
    } finally {
      setSavingGithub(false);
    }
  };

  // Bring-your-own-key (Pro+): paste a key to use instead of Forge credits --
  // either a real Anthropic key, or any OpenAI-compatible endpoint (Groq,
  // OpenRouter, local Ollama, etc.), which needs a base URL + model too.
  // Gated server-side too (PUT /auth/me) -- this UI hiding the input for
  // non-Pro users is a courtesy, not the real enforcement.
  const [byokProvider, setByokProvider] = useState<"anthropic" | "openai_compatible">("anthropic");
  const [byokKeyInput, setByokKeyInput] = useState("");
  const [byokBaseUrlInput, setByokBaseUrlInput] = useState("");
  const [byokModelInput, setByokModelInput] = useState("");
  const [showByokInput, setShowByokInput] = useState(false);
  const [savingByok, setSavingByok] = useState(false);

  const handleConnectByok = async () => {
    if (!byokKeyInput.trim()) return;
    if (byokProvider === "openai_compatible" && (!byokBaseUrlInput.trim() || !byokModelInput.trim())) return;
    setSavingByok(true);
    try {
      if (LIVE_MODE) {
        await authApi.updateProfile({
          llm_provider: byokProvider,
          llm_api_key: byokKeyInput.trim(),
          ...(byokProvider === "openai_compatible"
            ? { llm_base_url: byokBaseUrlInput.trim(), llm_model: byokModelInput.trim() }
            : {}),
        });
        await fetchMe();
      } else {
        set("byok", true);
      }
      setByokKeyInput("");
      setByokBaseUrlInput("");
      setByokModelInput("");
      setShowByokInput(false);
      toast.success("Key connected");
    } catch {
      toast.error("Couldn't connect that key.");
    } finally {
      setSavingByok(false);
    }
  };

  const handleDisconnectByok = async () => {
    setSavingByok(true);
    try {
      if (LIVE_MODE) {
        await authApi.updateProfile({ llm_api_key: "" });
        await fetchMe();
      } else {
        set("byok", false);
      }
      toast.success("Key disconnected");
    } catch {
      toast.error("Couldn't disconnect that key.");
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
      toast.error("Couldn't start MFA setup.");
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
      toast.error("That code didn't match. Please try again.");
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
      toast.error("That password doesn't look right.");
    } finally {
      setMfaBusy(false);
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
      toast.error("Couldn't submit your ticket.");
    } finally {
      setSupportSubmitting(false);
    }
  };

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const handleChangePassword = async () => {
    setPasswordError("");
    if (!currentPassword.trim() || !newPassword.trim()) {
      setPasswordError("Please fill in all password fields.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    setPasswordSubmitting(true);
    try {
      await authApi.changePassword({ current_password: currentPassword, new_password: newPassword });
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: any) {
      setPasswordError(err?.response?.data?.detail || "Unable to change password");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  // Data export & account deletion
  const [exportingData, setExportingData] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleExportData = async () => {
    setExportingData(true);
    try {
      const blob = await authApi.gdpr.export();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `forge-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Data export downloaded");
    } catch {
      toast.error("Couldn't export your data.");
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      toast.error("Type DELETE to confirm");
      return;
    }
    setDeleting(true);
    try {
      await authApi.gdpr.delete(true);
      toast.success("Account deleted");
      await logout();
      navigate("/login", { replace: true });
    } catch {
      toast.error("Couldn't delete your account.");
      setDeleting(false);
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
      toast.error("Couldn't load active sessions.");
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
      toast.error("Couldn't revoke that session.");
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
      toast.error("Couldn't sign out other devices.");
    } finally {
      setRevokingAll(false);
    }
  };

  return (
    <motion.div
      className="px-4 py-5 md:px-8 md:py-6"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="mx-auto max-w-2xl space-y-8"
        variants={reduceMotion ? undefined : motionVariants.staggerContainer}
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
      >
        <motion.div variants={motionVariants.staggerItem}>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted">Manage your account, preferences, and integrations.</p>
        </motion.div>

        {/* Appearance */}
        <motion.section aria-labelledby="section-appearance" variants={motionVariants.staggerItem}>
          <div className="mb-3 flex items-center gap-2">
            <Palette size={14} className="text-muted" aria-hidden="true" />
            <h2 id="section-appearance" className="text-base font-semibold text-ink">
              Appearance
            </h2>
          </div>
          <div className="bb-card space-y-3">
            <p className="text-caption text-muted">
              Choose a theme.
            </p>
            <ThemeSegmented />
          </div>
        </motion.section>

        {/* API key */}
        <motion.section aria-labelledby="section-api-key" variants={motionVariants.staggerItem}>
          <div className="flex items-center gap-2 mb-3">
            <Key size={13} className="text-muted" aria-hidden="true" />
            <h2 id="section-api-key" className="text-sm font-medium text-ink">API key</h2>
          </div>
          <div className="border border-border rounded-lg">
            <Row
              label="Bring your own key"
              description={
                !canUseByok
                  ? "Available on Pro."
                  : byokConnected
                  ? !LIVE_MODE
                    ? settings.maskedKey
                    : user?.llm_provider === "openai_compatible"
                    ? `Connected — using ${user.llm_model} instead of credits`
                    : "Active"
                  : showByokInput
                  ? "Choose a provider and paste your API key."
                  : "Use your own key to skip build credits."
              }
            >
              {!canUseByok ? (
                <a
                  href="/billing"
                  className="text-xs text-ink hover:opacity-70 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-opacity motion-reduce:transition-none"
                >
                  Upgrade
                </a>
              ) : byokConnected ? (
                <button
                  onClick={handleDisconnectByok}
                  disabled={savingByok}
                  className="text-xs text-error hover:text-error/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-colors motion-reduce:transition-none disabled:opacity-50"
                >
                  {savingByok ? "…" : "Disconnect"}
                </button>
              ) : showByokInput ? (
                <button
                  onClick={() => setShowByokInput(false)}
                  className="text-xs text-muted hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-colors motion-reduce:transition-none"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={() => setShowByokInput(true)}
                  className="text-xs text-muted hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-colors motion-reduce:transition-none"
                >
                  Connect
                </button>
              )}
            </Row>

            {canUseByok && !byokConnected && showByokInput && (
              <motion.div
                className="px-4 py-4 border-t border-border-soft space-y-3"
                initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <div className="flex gap-2" role="radiogroup" aria-label="Provider">
                  {(["anthropic", "openai_compatible"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={byokProvider === p}
                      onClick={() => setByokProvider(p)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                          e.preventDefault();
                          const next = p === "anthropic" ? "openai_compatible" : "anthropic";
                          setByokProvider(next);
                        }
                      }}
                      className={[
                        "h-8 px-3 rounded-md text-xs font-medium border transition-colors motion-reduce:transition-none",
                        byokProvider === p ? "border-ink text-ink" : "border-border text-muted hover:text-ink",
                      ].join(" ")}
                    >
                      {p === "anthropic" ? "Anthropic" : "OpenAI-compatible"}
                    </button>
                  ))}
                </div>

                <input
                  type="password"
                  value={byokKeyInput}
                  onChange={e => setByokKeyInput(e.target.value)}
                  placeholder={byokProvider === "anthropic" ? "sk-ant-…" : "API key"}
                  aria-label="API key"
                  className="w-full h-9 px-2.5 rounded-md bg-transparent border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
                />

                {byokProvider === "openai_compatible" && (
                  <>
                    <input
                      type="text"
                      value={byokBaseUrlInput}
                      onChange={e => setByokBaseUrlInput(e.target.value)}
                      placeholder="Base URL — e.g. https://api.groq.com/openai/v1"
                      aria-label="Base URL"
                      className="w-full h-9 px-2.5 rounded-md bg-transparent border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
                    />
                    <input
                      type="text"
                      value={byokModelInput}
                      onChange={e => setByokModelInput(e.target.value)}
                      placeholder="Model — e.g. llama-3.3-70b-versatile"
                      aria-label="Model"
                      className="w-full h-9 px-2.5 rounded-md bg-transparent border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
                    />
                  </>
                )}

                <motion.button
                  onClick={handleConnectByok}
                  disabled={
                    savingByok ||
                    !byokKeyInput.trim() ||
                    (byokProvider === "openai_compatible" && (!byokBaseUrlInput.trim() || !byokModelInput.trim()))
                  }
                  {...presets.button}
                  className="h-8 px-3 rounded-md bg-ink text-base text-xs font-medium hover:bg-ink/90 active:scale-[0.98] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 disabled:opacity-50"
                >
                  {savingByok ? "Saving" : "Save"}
                </motion.button>
              </motion.div>
            )}
          </div>
        </motion.section>

        {/* Connections */}
        <motion.section aria-labelledby="section-connections" variants={motionVariants.staggerItem}>
          <div className="flex items-center gap-2 mb-3">
            <Github size={13} className="text-muted" aria-hidden="true" />
            <h2 id="section-connections" className="text-sm font-medium text-ink">Integrations</h2>
          </div>
          <div className="border border-border rounded-lg">
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
                  ? "Paste a personal access token."
                  : "Not connected"
              }
            >
              {!LIVE_MODE ? (
                <span className={`text-xs font-medium ${githubConnected ? "text-ink" : "text-muted"}`}>
                  {githubConnected ? "Connected" : "Connect"}
                </span>
              ) : githubConnected ? (
                <button
                  onClick={handleDisconnectGithub}
                  disabled={savingGithub}
                  className="text-xs text-error hover:text-error/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-colors motion-reduce:transition-none disabled:opacity-50"
                >
                   {savingGithub ? "Saving" : "Disconnect"}
                </button>
              ) : showGithubInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={githubTokenInput}
                    onChange={e => setGithubTokenInput(e.target.value)}
                    placeholder="ghp_…"
                    aria-label="GitHub personal access token"
                    className="h-8 px-2.5 w-40 rounded-md bg-transparent border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
                  />
                  <button
                    onClick={handleConnectGithub}
                    disabled={savingGithub || !githubTokenInput.trim()}
                    className="text-xs text-ink hover:opacity-70 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-opacity motion-reduce:transition-none disabled:opacity-50"
                  >
                    {savingGithub ? "Saving" : "Save"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowGithubInput(true)}
                  className="text-xs text-muted hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-colors motion-reduce:transition-none"
                >
                  Connect
                </button>
              )}
            </Row>
          </div>
        </motion.section>

        {/* Notifications */}
        <motion.section aria-labelledby="section-notifications" variants={motionVariants.staggerItem}>
          <div className="flex items-center gap-2 mb-3">
            <Bell size={13} className="text-muted" aria-hidden="true" />
            <h2 id="section-notifications" className="text-sm font-medium text-ink">Notifications</h2>
          </div>
          <div className="border border-border rounded-lg">
            <Row
              label="Builds complete"
              description="Email me when builds finish."
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
        </motion.section>

        {/* Defaults */}
        <motion.section aria-labelledby="section-defaults" variants={motionVariants.staggerItem}>
          <div className="flex items-center gap-2 mb-3">
            <Sliders size={13} className="text-muted" aria-hidden="true" />
            <h2 id="section-defaults" className="text-sm font-medium text-ink">Defaults</h2>
          </div>
          <div className="border border-border rounded-lg">
            <Row
              label="Auto-deploy"
              description="Deploy automatically when QA passes."
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
              description="Max retries before giving up."
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const next = Math.max(1, debugIterations - 1);
                    if (LIVE_MODE) saveDebugIterations(next);
                    else set("debugIterations", next);
                  }}
                  aria-label="Decrease debug iterations"
                  className="w-7 h-7 rounded-md bg-transparent border border-border text-ink text-sm flex items-center justify-center hover:border-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none"
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
                  className="w-7 h-7 rounded-md bg-transparent border border-border text-ink text-sm flex items-center justify-center hover:border-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none"
                >
                  +
                </button>
              </div>
            </Row>
          </div>
        </motion.section>

        {/* Two-factor authentication */}
        {LIVE_MODE && (
          <motion.section aria-labelledby="section-security" variants={motionVariants.staggerItem}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={13} className="text-muted" aria-hidden="true" />
              <h2 id="section-security" className="text-sm font-medium text-ink">Security</h2>
            </div>
            <div className="border border-border rounded-lg">
              <Row
                label="Two-factor authentication"
              description={
                mfaEnabled
                  ? "Enabled"
                  : "Require a code at sign-in."
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
                         aria-label="Confirm password to disable two-factor authentication"
                        className="h-8 px-2.5 w-32 rounded-md bg-transparent border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
                      />
                      <button
                        onClick={handleDisableMfa}
                        disabled={mfaBusy || !disablePassword.trim()}
                        className="text-xs text-error hover:text-error/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-colors disabled:opacity-50"
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
                  <span className="text-xs text-muted">In progress</span>
                )}
              </Row>

              <AnimatePresence>
                {mfaStep === "qr" && (
                  <motion.div
                    key="mfa-qr"
                    className="px-4 py-4 border-t border-border space-y-4"
                    initial={reduceMotion ? false : { opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                  >
                    <p className="text-xs text-muted leading-relaxed">
                      Scan the QR code, then enter the 6-digit code.
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
                        className="h-8 px-2.5 w-28 rounded-md bg-transparent border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition tracking-widest"
                      />
                      <motion.button
                        onClick={handleVerifyMfaSetup}
                        disabled={mfaBusy || !mfaSetupCode.trim()}
                        {...presets.button}
                        className="text-xs text-ink hover:opacity-70 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-opacity disabled:opacity-50"
                      >
                        {mfaBusy ? "Verifying…" : "Verify & enable"}
                      </motion.button>
                      <button
                        onClick={() => { setMfaStep("idle"); setMfaSecret(""); setMfaOtpauthUri(""); }}
                        className="text-xs text-muted hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {mfaStep === "backup-codes" && (
                <motion.div
                  className="px-4 py-4 border-t border-border space-y-3"
                  initial={reduceMotion ? false : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  <p className="text-xs text-ink font-medium">Save these backup codes</p>
                  <p className="text-xs text-muted leading-relaxed">
                    Each code works once. Save these before you leave this page.
                  </p>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs border border-border rounded-md p-3">
                    {backupCodes.map(code => (
                      <span key={code}>{code}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <ClipboardCopyButton
                      text={backupCodes.join("\n")}
                      successMessage="Backup codes copied"
                      className="inline-flex items-center gap-1 text-xs text-ink hover:opacity-70 transition-opacity"
                    />
                    <button
                      onClick={handleDoneWithBackupCodes}
                      className="text-xs text-muted hover:text-ink"
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.section>
        )}

        {/* Active sessions */}
        {LIVE_MODE && (
          <motion.section aria-labelledby="section-sessions" variants={motionVariants.staggerItem}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Monitor size={13} className="text-muted" aria-hidden="true" />
                <h2 id="section-sessions" className="text-sm font-medium text-ink">Active sessions</h2>
              </div>
              {sessions.some(s => !s.is_current) && (
                <button
                  onClick={handleRevokeAll}
                  disabled={revokingAll}
                  className="text-xs text-error hover:text-error/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-colors motion-reduce:transition-none disabled:opacity-50"
                >
                  {revokingAll ? "Logging out" : "Log out everywhere else"}
                </button>
              )}
            </div>
            <div className="border border-border rounded-lg">
              {sessionsLoading ? (
                <div className="px-4 py-3 text-xs text-muted">Loading</div>
              ) : sessions.length === 0 ? (
                <div className="px-4 py-3 text-xs text-muted">No active sessions yet</div>
              ) : (
                sessions.map(session => (
                  <Row
                    key={session.id}
                    label={
                      <span className="flex items-center gap-2">
                        {describeUserAgent(session.user_agent)}
                        {session.is_current && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full text-faint border border-border">
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
                        className="text-xs text-error hover:text-error/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded transition-colors motion-reduce:transition-none disabled:opacity-50"
                      >
                         {revokingId === session.id ? "Revoking" : "Revoke"}
                      </button>
                    )}
                  </Row>
                ))
              )}
            </div>
          </motion.section>
        )}

        {/* Support */}
        <motion.section aria-labelledby="section-support" variants={motionVariants.staggerItem}>
          <div className="flex items-center gap-2 mb-3">
            <LifeBuoy size={13} className="text-muted" aria-hidden="true" />
            <h2 id="section-support" className="text-sm font-medium text-ink">Support</h2>
          </div>
          <div className="border border-border rounded-lg p-5 space-y-4">
            <div>
                <label htmlFor="support-subject" className="block text-xs uppercase tracking-[0.14em] text-muted mb-2">Subject</label>
                <input
                  id="support-subject"
                  type="text"
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  placeholder="Short summary"
                 maxLength={200}
                 className="w-full h-10 bg-transparent border border-border rounded-md px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
               />
            </div>
            <div>
               <label htmlFor="support-description" className="block text-xs uppercase tracking-[0.14em] text-muted mb-2">Details</label>
              <textarea
                id="support-description"
                value={supportDescription}
                onChange={(e) => setSupportDescription(e.target.value)}
                 placeholder="What happened, and what did you expect?"
                rows={4}
                maxLength={5000}
                className="w-full resize-none bg-transparent border border-border rounded-md px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
              />
            </div>
            <motion.button
              onClick={handleSubmitSupportTicket}
              disabled={supportSubmitting || !supportSubject.trim() || !supportDescription.trim()}
              {...presets.button}
              className="h-10 px-4 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 active:scale-[0.98] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 disabled:opacity-50"
            >
              {supportSubmitting ? "Submitting" : "Submit"}
            </motion.button>
          </div>
        </motion.section>

        {/* Password */}
        {LIVE_MODE && (
          <motion.section aria-labelledby="section-password" variants={motionVariants.staggerItem}>
            <div className="flex items-center gap-2 mb-3">
              <Lock size={13} className="text-muted" aria-hidden="true" />
              <h2 id="section-password" className="text-sm font-medium text-ink">Password</h2>
            </div>
            <div className="border border-border rounded-lg p-5 space-y-3">
              <div>
                <label htmlFor="current-password" className="block text-xs uppercase tracking-[0.14em] text-muted mb-2">Current password</label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full h-10 bg-transparent border border-border rounded-md px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
                />
              </div>
              <div>
                <label htmlFor="new-password" className="block text-xs uppercase tracking-[0.14em] text-muted mb-2">New password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full h-10 bg-transparent border border-border rounded-md px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
                />
              </div>
              <div>
                <label htmlFor="confirm-new-password" className="block text-xs uppercase tracking-[0.14em] text-muted mb-2">Confirm new password</label>
                <input
                  id="confirm-new-password"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full h-10 bg-transparent border border-border rounded-md px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
                />
              </div>
              {passwordError && (
                <p id="password-change-error" role="alert" aria-live="polite" className="text-xs text-error">{passwordError}</p>
              )}
              <motion.button
                onClick={handleChangePassword}
                disabled={passwordSubmitting || !currentPassword.trim() || !newPassword.trim()}
                {...presets.button}
                className="h-10 px-4 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 active:scale-[0.98] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 disabled:opacity-50"
              >
                {passwordSubmitting ? "Updating…" : "Update password"}
              </motion.button>
            </div>
          </motion.section>
        )}

        {/* Data & Privacy */}
        {LIVE_MODE && (
          <motion.section aria-labelledby="section-privacy" variants={motionVariants.staggerItem}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={13} className="text-muted" aria-hidden="true" />
              <h2 id="section-privacy" className="text-sm font-medium text-ink">Data & privacy</h2>
            </div>
            <div className="border border-border rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-ink">Export your data</p>
                  <p className="text-xs text-muted mt-0.5">Download a copy of all your Forge data (JSON).</p>
                </div>
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={exportingData}
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border text-xs font-medium text-ink hover:bg-panel-alt transition-colors motion-reduce:transition-none disabled:opacity-50"
                >
                  <Download size={13} aria-hidden="true" />
                  {exportingData ? "Exporting…" : "Export"}
                </button>
              </div>
              <div className="border-t border-border-soft pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-error font-medium">Delete account</p>
                    <p className="text-xs text-muted mt-0.5">Permanently delete your account and all data. This cannot be undone.</p>
                  </div>
                  {!showDeleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-error/40 text-xs font-medium text-error hover:bg-error/10 transition-colors motion-reduce:transition-none"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      Delete
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder='Type "DELETE" to confirm'
                        className="h-9 w-48 rounded-md border border-error/40 bg-transparent px-3 text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleDeleteAccount}
                          disabled={deleting || deleteConfirmText !== "DELETE"}
                          className="h-9 px-3 rounded-md bg-error text-white text-xs font-medium hover:bg-error/90 transition-colors motion-reduce:transition-none disabled:opacity-50"
                        >
                          {deleting ? "Deleting…" : "Confirm delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(""); }}
                          className="h-9 px-3 rounded-md border border-border text-xs font-medium text-muted hover:text-ink transition-colors motion-reduce:transition-none"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.section>
        )}

      </motion.div>
    </motion.div>
  );
}
