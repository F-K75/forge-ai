import { useState, useEffect } from "react";
import { Moon, Sun, Contrast, Code2, Monitor, Eye, Volume2, Check } from "lucide-react";
import { toast } from "react-hot-toast";
import { applyTheme, getStoredTheme, type ThemeMode } from "../../lib/theme";
import { authApi } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { useAuthStore } from "../../store/authStore";
import type { AppearancePreferences } from "./types";

const THEME_OPTIONS: { id: ThemeMode; name: string; desc: string; icon: typeof Moon }[] = [
  {
    id: "dark",
    name: "Dark Studio",
    desc: "Midnight charcoal workspace tuned for low eye fatigue during long sessions.",
    icon: Moon,
  },
  {
    id: "light",
    name: "Clean Light",
    desc: "Crisp, daylight-readable theme with elevated panels and soft gray borders.",
    icon: Sun,
  },
  {
    id: "high-contrast",
    name: "High Contrast",
    desc: "Strict pure black canvas with enhanced border contrast and vivid focus rings.",
    icon: Contrast,
  },
];

const CODE_FONTS = [
  { value: "JetBrains Mono, monospace", label: "JetBrains Mono" },
  { value: "SF Mono, Menlo, monospace", label: "SF Mono / Menlo" },
  { value: "Fira Code, monospace", label: "Fira Code (Ligatures)" },
  { value: "Cascadia Code, monospace", label: "Cascadia Code" },
  { value: "ui-monospace, monospace", label: "System Monospace" },
];

export function AppearanceTab() {
  const { user } = useAuthStore();
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  const storedPrefs: Partial<AppearancePreferences> =
    (user?.preferences?.appearance as Partial<AppearancePreferences>) || {};

  const [prefs, setPrefs] = useState<AppearancePreferences>({
    theme: theme,
    uiDensity: storedPrefs.uiDensity || "comfortable",
    editorFont: storedPrefs.editorFont || "JetBrains Mono, monospace",
    editorFontSize: storedPrefs.editorFontSize || 13,
    tabSize: storedPrefs.tabSize || 2,
    lineNumbers: storedPrefs.lineNumbers ?? true,
    minimap: storedPrefs.minimap ?? false,
    wordWrap: storedPrefs.wordWrap ?? true,
    reduceMotion: storedPrefs.reduceMotion ?? false,
    highContrastBorders: storedPrefs.highContrastBorders ?? false,
    audioCues: storedPrefs.audioCues ?? true,
  });

  const [saving, setSaving] = useState(false);

  const handleThemeSelect = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    setPrefs((p) => ({ ...p, theme: newTheme }));
  };

  useEffect(() => {
    // Apply reduce motion class to document if toggled
    if (prefs.reduceMotion) {
      document.documentElement.classList.add("reduce-motion");
    } else {
      document.documentElement.classList.remove("reduce-motion");
    }
  }, [prefs.reduceMotion]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (LIVE_MODE) {
        await authApi.updateProfile({
          preferences: {
            appearance: prefs,
          },
        });
      }
      localStorage.setItem("forge_appearance_prefs", JSON.stringify(prefs));
      toast.success("Appearance & Editor preferences updated");
    } catch {
      toast.error("Failed to sync preferences to cloud");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="settings-appearance-panel" className="space-y-8">
      {/* Visual Theme Selection */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-m3-1 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Monitor size={15} className="text-accent" />
            Color Theme
          </h2>
          <p className="text-xs text-muted mt-1">
            Choose your preferred workspace aesthetic. Automatically adjusts editor highlights and graph nodes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="radiogroup" aria-label="Color Theme Selection">
          {THEME_OPTIONS.map((item) => {
            const Icon = item.icon;
            const active = theme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => handleThemeSelect(item.id)}
                className={`text-left p-4 rounded-xl border transition-all duration-150 relative flex flex-col justify-between h-36 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? "bg-accent-soft border-accent text-ink"
                    : "bg-panel-alt border-border text-ink hover:border-accent/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`h-8 w-8 rounded-lg border flex items-center justify-center ${
                        active ? "bg-accent text-on-ink border-accent" : "bg-panel border-border text-muted"
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <div>
                      <span className="text-xs font-semibold block text-ink">{item.name}</span>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-muted">{item.id}</span>
                    </div>
                  </div>
                  {active && (
                    <span className="h-5 w-5 rounded-md bg-accent text-on-ink flex items-center justify-center">
                      <Check size={12} strokeWidth={3} />
                    </span>
                  )}
                </div>

                <p className="text-[11px] leading-relaxed line-clamp-2 mt-2 text-muted">{item.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Code Editor Customization */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-m3-1 space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Code2 size={15} className="text-accent" />
            Code Editor Preferences
          </h2>
          <p className="text-xs text-muted mt-1">
            Configure typography, indentation, and visual aids for the Monaco code editor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="space-y-1.5">
            <label htmlFor="editor-font-select" className="text-xs font-medium text-ink block">
              Font Family
            </label>
            <select
              id="editor-font-select"
              value={prefs.editorFont}
              onChange={(e) => setPrefs((p) => ({ ...p, editorFont: e.target.value }))}
              className="w-full text-xs font-mono bg-panel-alt border border-border rounded-lg px-3 py-2 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
            >
              {CODE_FONTS.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="editor-size-select" className="text-xs font-medium text-ink block">
              Font Size
            </label>
            <select
              id="editor-size-select"
              value={prefs.editorFontSize}
              onChange={(e) => setPrefs((p) => ({ ...p, editorFontSize: Number(e.target.value) }))}
              className="w-full text-xs font-mono bg-panel-alt border border-border rounded-lg px-3 py-2 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
            >
              {[11, 12, 13, 14, 15, 16].map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="editor-tab-select" className="text-xs font-medium text-ink block">
              Tab Indentation
            </label>
            <select
              id="editor-tab-select"
              value={prefs.tabSize}
              onChange={(e) => setPrefs((p) => ({ ...p, tabSize: Number(e.target.value) }))}
              className="w-full text-xs font-mono bg-panel-alt border border-border rounded-lg px-3 py-2 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
            >
              <option value={2}>2 Spaces</option>
              <option value={4}>4 Spaces</option>
            </select>
          </div>
        </div>

        {/* Editor Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <label className="flex items-center gap-3 p-3 rounded-lg border border-border bg-panel-alt cursor-pointer hover:border-accent/40 transition-colors">
            <input
              type="checkbox"
              checked={prefs.lineNumbers}
              onChange={(e) => setPrefs((p) => ({ ...p, lineNumbers: e.target.checked }))}
              className="rounded accent-accent focus:ring-0"
            />
            <span className="text-xs font-medium text-ink">Show Line Numbers</span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-border bg-panel-alt cursor-pointer hover:border-accent/40 transition-colors">
            <input
              type="checkbox"
              checked={prefs.minimap}
              onChange={(e) => setPrefs((p) => ({ ...p, minimap: e.target.checked }))}
              className="rounded accent-accent focus:ring-0"
            />
            <span className="text-xs font-medium text-ink">Editor Minimap</span>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-border bg-panel-alt cursor-pointer hover:border-accent/40 transition-colors">
            <input
              type="checkbox"
              checked={prefs.wordWrap}
              onChange={(e) => setPrefs((p) => ({ ...p, wordWrap: e.target.checked }))}
              className="rounded accent-accent focus:ring-0"
            />
            <span className="text-xs font-medium text-ink">Soft Word Wrap</span>
          </label>
        </div>

        {/* Live Typography Preview Box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-muted">
            <span>Live Typography Preview</span>
            <span>{prefs.editorFontSize}px • {prefs.editorFont.split(",")[0]}</span>
          </div>
          <div
            className="rounded-lg bg-base text-ink border border-border p-4 font-mono overflow-x-auto select-none"
            style={{
              fontFamily: prefs.editorFont,
              fontSize: `${prefs.editorFontSize}px`,
              lineHeight: "1.6",
            }}
          >
            <div className="text-muted">// Autonomous agent task execution</div>
            <div>
              <span className="text-accent font-semibold">async function</span>{" "}
              <span className="text-ok font-semibold">forgeBuild</span>(
              <span className="text-secondary">spec</span>: AgentPrompt):{" "}
              <span className="text-accent font-semibold">Promise</span>&lt;BuildResult&gt; {"{"}
            </div>
            <div className="pl-4">
              <span className="text-accent font-semibold">const</span> session ={" "}
              <span className="text-accent font-semibold">await</span> fleet.deployAgent(
              <span className="text-ok">"architect"</span>);
            </div>
            <div className="pl-4">
              <span className="text-accent font-semibold">return</span> session.execute(spec);
            </div>
            <div>{"}"}</div>
          </div>
        </div>
      </section>

      {/* Interface & Accessibility */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-m3-1 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Eye size={15} className="text-accent" />
            Accessibility & Motion
          </h2>
          <p className="text-xs text-muted mt-1">
            Fine-tune layout density, animation transitions, and audio cues.
          </p>
        </div>

        <div className="divide-y divide-border">
          <div className="py-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-ink block">UI Density</span>
              <span className="text-[11px] text-muted">Compact mode shrinks table rows and toolbar padding.</span>
            </div>
            <div className="flex items-center gap-1 bg-panel-alt p-1 rounded-lg border border-border text-xs">
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, uiDensity: "comfortable" }))}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  prefs.uiDensity === "comfortable" ? "bg-accent-soft text-accent font-semibold" : "text-muted hover:text-ink"
                }`}
              >
                Comfortable
              </button>
              <button
                type="button"
                onClick={() => setPrefs((p) => ({ ...p, uiDensity: "compact" }))}
                className={`px-3 py-1 rounded-md font-medium transition-all ${
                  prefs.uiDensity === "compact" ? "bg-accent-soft text-accent font-semibold" : "text-muted hover:text-ink"
                }`}
              >
                Compact
              </button>
            </div>
          </div>

          <div className="py-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-ink block">Reduce Motion & Animations</span>
              <span className="text-[11px] text-muted">Minimizes spring transitions and canvas particles.</span>
            </div>
            <input
              type="checkbox"
              id="pref-reduce-motion"
              checked={prefs.reduceMotion}
              onChange={(e) => setPrefs((p) => ({ ...p, reduceMotion: e.target.checked }))}
              className="h-4 w-4 rounded accent-accent focus:ring-0 cursor-pointer"
            />
          </div>

          <div className="py-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-ink flex items-center gap-1.5">
                <Volume2 size={13} className="text-muted" />
                Audio Feedback & Alerts
              </span>
              <span className="text-[11px] text-muted">Plays gentle audio notifications when agent builds finish or fail.</span>
            </div>
            <input
              type="checkbox"
              id="pref-audio-cues"
              checked={prefs.audioCues}
              onChange={(e) => setPrefs((p) => ({ ...p, audioCues: e.target.checked }))}
              className="h-4 w-4 rounded accent-accent focus:ring-0 cursor-pointer"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-border flex items-center justify-end">
          <button
            id="appearance-save-btn"
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent text-on-ink font-semibold text-xs px-5 py-2.5 hover:opacity-90 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Updating..." : "Save Appearance Settings"}
          </button>
        </div>
      </section>
    </div>
  );
}
