import { useEffect, useRef, useState } from "react";
import { Key, Github, Bell, Sliders, Monitor } from "lucide-react";
import toast from "react-hot-toast";
import { DEFAULT_SETTINGS } from "../lib/mockData";
import { Row } from "../components/Row";
import { Toggle } from "../components/Toggle";
import { LIVE_MODE } from "../lib/env";
import { authApi } from "../lib/api";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              description="Use your Anthropic API key instead of Forge credits"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-panel-alt text-faint border border-border">
                  Coming soon
                </span>
                <Toggle on={false} onChange={() => {}} label="Bring your own key" disabled />
              </div>
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

      </div>
    </div>
  );
}
