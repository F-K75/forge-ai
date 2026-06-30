import { useState } from "react";
import { Key, Github, Bell, Sliders } from "lucide-react";
import { DEFAULT_SETTINGS } from "../lib/mockData";
import { Row } from "../components/Row";
import { Toggle } from "../components/Toggle";

type Settings = typeof DEFAULT_SETTINGS;

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setSettings(prev => ({ ...prev, [key]: val }));
  }

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
              <Toggle
                on={settings.byok}
                onChange={v => set("byok", v)}
                label="Bring your own key"
              />
            </Row>
            {settings.byok && (
              <Row label="Current key" description={settings.maskedKey}>
                <button
                  onClick={() => {/* replace key — no-op until backend */}}
                  className="text-xs text-accent hover:text-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded transition-colors motion-reduce:transition-none"
                >
                  Replace
                </button>
              </Row>
            )}
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
                settings.github.connected
                  ? `Connected to ${settings.github.repo}`
                  : "Not connected"
              }
            >
              <span
                className={`text-xs font-medium ${
                  settings.github.connected ? "text-ok" : "text-muted"
                }`}
              >
                {settings.github.connected ? "Connected" : "Connect"}
              </span>
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
                on={settings.notifyOnBuild}
                onChange={v => set("notifyOnBuild", v)}
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
                on={settings.autoDeploy}
                onChange={v => set("autoDeploy", v)}
                label="Auto-deploy"
              />
            </Row>
            <Row
              label="Debug iterations"
              description="Maximum times an agent reruns on failure"
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => set("debugIterations", Math.max(1, settings.debugIterations - 1))}
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
                  {settings.debugIterations}
                </span>
                <button
                  onClick={() => set("debugIterations", Math.min(5, settings.debugIterations + 1))}
                  aria-label="Increase debug iterations"
                  className="w-7 h-7 rounded-md bg-panel-alt border border-border text-ink text-sm flex items-center justify-center hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors motion-reduce:transition-none"
                >
                  +
                </button>
              </div>
            </Row>
          </div>
        </section>

      </div>
    </div>
  );
}
