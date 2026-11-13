import { useState } from "react";
import { Cpu, Key, Globe, Sparkles, CheckCircle2, XCircle, Eye, EyeOff, AlertCircle, RefreshCw, Sliders } from "lucide-react";
import { toast } from "react-hot-toast";
import { authApi } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { useAuthStore } from "../../store/authStore";
import type { ModelPreferences } from "./types";

const POPULAR_MODELS = {
  anthropic: [
    { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet (Recommended)" },
    { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (Fast)" },
  ],
  openai_compatible: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq / Fast)" },
    { value: "deepseek-chat", label: "DeepSeek V3" },
    { value: "gpt-4o", label: "GPT-4o (OpenAI)" },
    { value: "qwen-2.5-coder-32b", label: "Qwen 2.5 Coder" },
  ],
};

export function ModelsTab() {
  const { user, fetchMe } = useAuthStore();
  const isProOrEnterprise = user?.plan === "pro" || user?.plan === "enterprise";

  const userPrefs = (user?.preferences as Record<string, any>) || {};
  const modelPrefs: Partial<ModelPreferences> = (userPrefs.modelConfig as Partial<ModelPreferences>) || {};

  const [provider, setProvider] = useState<"forge" | "anthropic" | "openai_compatible">(
    (user?.llm_provider as any) || modelPrefs.provider || "forge"
  );
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState(user?.llm_base_url || modelPrefs.baseUrl || "https://api.anthropic.com/v1");
  const [model, setModel] = useState(user?.llm_model || modelPrefs.model || "claude-3-7-sonnet-20250219");
  const [temperature, setTemperature] = useState(modelPrefs.temperature ?? 0.2);
  const [maxTokens, setMaxTokens] = useState(modelPrefs.maxTokens ?? 4096);
  const [fallbackToCredits, setFallbackToCredits] = useState(modelPrefs.fallbackToCredits ?? true);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleProviderChange = (p: "forge" | "anthropic" | "openai_compatible") => {
    setProvider(p);
    setTestResult(null);
    if (p === "anthropic") {
      setBaseUrl("https://api.anthropic.com/v1");
      setModel("claude-3-7-sonnet-20250219");
    } else if (p === "openai_compatible") {
      setBaseUrl("https://api.groq.com/openai/v1");
      setModel("llama-3.3-70b-versatile");
    }
  };

  const handleTestConnection = async () => {
    if (provider === "forge") {
      setTestResult({ ok: true, message: "Forge Managed Cloud is connected and operational (24ms latency)." });
      return;
    }
    if (!apiKey && !user?.byok_connected) {
      toast.error("Please provide an API key to test connection.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      // Simulate or ping endpoint
      await new Promise((r) => setTimeout(r, 800));
      setTestResult({
        ok: true,
        message: `Successfully authenticated with ${provider === "anthropic" ? "Anthropic" : baseUrl}. Verified model: ${model}.`,
      });
      toast.success("Provider connection verified successfully!");
    } catch {
      setTestResult({
        ok: false,
        message: "Failed to connect. Please verify your API key, base URL, and model identifier.",
      });
      toast.error("Connection check failed.");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (provider !== "forge" && !isProOrEnterprise) {
        toast.error("Bring Your Own Key is available on Pro and Enterprise plans.");
        return;
      }

      if (LIVE_MODE) {
        if (provider === "forge") {
          // Clear BYOK
          await authApi.updateProfile({
            llm_provider: undefined,
            llm_api_key: "",
            llm_base_url: "",
            llm_model: "",
            preferences: {
              ...userPrefs,
              modelConfig: {
                provider: "forge",
                temperature,
                maxTokens,
                fallbackToCredits,
              },
            },
          });
        } else {
          await authApi.updateProfile({
            llm_provider: provider,
            llm_api_key: apiKey || undefined,
            llm_base_url: provider === "openai_compatible" ? baseUrl : undefined,
            llm_model: model,
            preferences: {
              ...userPrefs,
              modelConfig: {
                provider,
                temperature,
                maxTokens,
                fallbackToCredits,
              },
            },
          });
        }
        await fetchMe();
      } else {
        await new Promise((r) => setTimeout(r, 400));
      }
      toast.success("AI model configuration saved successfully");
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to update model settings";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="settings-models-panel" className="space-y-8">
      {/* Tier Gate Banner if Free */}
      {!isProOrEnterprise && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 flex items-start gap-3">
          <Sparkles size={18} className="text-accent shrink-0 mt-0.5" />
          <div className="text-xs">
            <strong className="text-ink font-semibold">Bring Your Own Key (BYOK) is a Pro feature</strong>
            <p className="text-muted mt-0.5">
              Connect your Anthropic Claude or OpenAI-compatible keys to build without using Forge platform credits.
            </p>
          </div>
        </div>
      )}

      {/* Provider Selection */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Cpu size={15} className="text-accent" />
            Inference Provider
          </h2>
          <p className="text-xs text-muted mt-1">
            Choose the neural network engine powering your autonomous developer and architect agents.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => handleProviderChange("forge")}
            className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between h-36 ${
              provider === "forge"
                ? "border-accent bg-accent/5 ring-1 ring-accent"
                : "border-border-soft bg-base/50 hover:border-border"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Forge Managed Cloud</span>
                <span className="text-[10px] bg-ok/10 text-ok border border-ok/20 px-1.5 py-0.5 rounded font-mono">
                  Default
                </span>
              </div>
              <p className="text-[11px] text-muted mt-2 leading-relaxed">
                Zero configuration required. Uses your Forge account credits with high-throughput tier-1 routing.
              </p>
            </div>
            <span className="text-[10px] font-mono text-faint">Uses Forge Credits</span>
          </button>

          <button
            type="button"
            onClick={() => handleProviderChange("anthropic")}
            className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between h-36 ${
              provider === "anthropic"
                ? "border-accent bg-accent/5 ring-1 ring-accent"
                : "border-border-soft bg-base/50 hover:border-border"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Anthropic Claude</span>
                <span className="text-[10px] bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded font-mono">
                  Direct BYOK
                </span>
              </div>
              <p className="text-[11px] text-muted mt-2 leading-relaxed">
                Direct integration with Claude 3.7 & 3.5 Sonnet via your Anthropic console key.
              </p>
            </div>
            <span className="text-[10px] font-mono text-faint">Billed to your Anthropic account</span>
          </button>

          <button
            type="button"
            onClick={() => handleProviderChange("openai_compatible")}
            className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between h-36 ${
              provider === "openai_compatible"
                ? "border-accent bg-accent/5 ring-1 ring-accent"
                : "border-border-soft bg-base/50 hover:border-border"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">OpenAI Compatible / Local</span>
                <span className="text-[10px] bg-ember/10 text-ember border border-ember/20 px-1.5 py-0.5 rounded font-mono">
                  Custom
                </span>
              </div>
              <p className="text-[11px] text-muted mt-2 leading-relaxed">
                Connect Groq, DeepSeek, OpenRouter, Azure OpenAI, or local vLLM / Ollama clusters.
              </p>
            </div>
            <span className="text-[10px] font-mono text-faint">Custom Base URL</span>
          </button>
        </div>

        {/* Credentials Form for BYOK */}
        {provider !== "forge" && (
          <form onSubmit={handleSave} className="space-y-5 pt-4 border-t border-border-soft">
            <div className="space-y-1.5">
              <label htmlFor="model-api-key-input" className="text-xs font-medium text-ink flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key size={13} className="text-accent" />
                  {provider === "anthropic" ? "Anthropic API Key" : "Provider API Key"}
                </span>
                {user?.byok_connected && (
                  <span className="text-[10px] text-ok flex items-center gap-1 font-mono">
                    <CheckCircle2 size={11} /> Key Configured (Encrypted)
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  id="model-api-key-input"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={user?.byok_connected ? "•••••••••••••••••••••••••••••••• (Leave blank to keep current key)" : "sk-ant-... or custom key"}
                  className="w-full text-xs font-mono bg-base border border-border rounded-lg pl-3 pr-10 py-2.5 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  title={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[11px] text-faint flex items-center gap-1">
                <AlertCircle size={11} />
                Keys are stored using AES-256 GCM authenticated encryption and never exposed to the browser.
              </p>
            </div>

            {provider === "openai_compatible" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="model-base-url-input" className="text-xs font-medium text-ink flex items-center gap-1.5">
                    <Globe size={13} className="text-muted" />
                    Base URL
                  </label>
                  <input
                    id="model-base-url-input"
                    type="url"
                    required
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.groq.com/openai/v1"
                    className="w-full text-xs font-mono bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="model-name-input" className="text-xs font-medium text-ink block">
                    Model Identifier
                  </label>
                  <input
                    id="model-name-input"
                    type="text"
                    required
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="llama-3.3-70b-versatile"
                    className="w-full text-xs font-mono bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
            )}

            {provider === "anthropic" && (
              <div className="space-y-1.5">
                <label htmlFor="anthropic-model-select" className="text-xs font-medium text-ink block">
                  Select Anthropic Model
                </label>
                <select
                  id="anthropic-model-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {POPULAR_MODELS.anthropic.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

{LIVE_MODE ? (
              // There's no backend endpoint that checks a user's own key, and
              // the old button always reported success after a delay. Be
              // honest about when the key is actually exercised.
              <p className="text-[11px] text-muted bg-base/40 p-3 rounded-lg border border-border-soft">
                Your key is used on your next build. If the provider rejects it, that build fails with
                the provider's error message.
              </p>
            ) : (
              <>
            {/* Test Connection Button & Status */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-base/40 p-3 rounded-lg border border-border-soft">
              <div className="text-xs">
                <span className="font-medium text-ink block">Connection Diagnostics</span>
                <span className="text-[11px] text-muted">Test authentication and latency before saving.</span>
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="bb-btn bb-btn-subtle text-xs px-3 py-1.5 flex items-center gap-1.5 self-start sm:self-auto"
              >
                {testing ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {testing ? "Testing Ping..." : "Test Connection"}
              </button>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                  testResult.ok ? "bg-ok/5 border-ok/30 text-ok" : "bg-error/5 border-error/30 text-error"
                }`}
              >
                {testResult.ok ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> : <XCircle size={16} className="shrink-0 mt-0.5" />}
                <p className="leading-relaxed">{testResult.message}</p>
              </div>
            )}
              </>
            )}
          </form>
        )}
      </section>

      {/* Model Generation & Inference Tuning */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Sliders size={15} className="text-accent" />
            Generation Parameters
          </h2>
          <p className="text-xs text-muted mt-1">
            Tune temperature and safety margins for autonomous code generation.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="param-temperature" className="font-medium text-ink">
                Temperature ({temperature})
              </label>
              <span className="text-faint font-mono">
                {temperature <= 0.2 ? "Deterministic / Strict Syntax" : temperature <= 0.6 ? "Balanced" : "Creative"}
              </span>
            </div>
            <input
              id="param-temperature"
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-accent cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="param-max-tokens" className="text-xs font-medium text-ink block">
                Max Response Tokens
              </label>
              <select
                id="param-max-tokens"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value={2048}>2,048 Tokens (Standard)</option>
                <option value={4096}>4,096 Tokens (Recommended)</option>
                <option value={8192}>8,192 Tokens (Large Codebases)</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border-soft bg-base/40">
              <div>
                <span className="text-xs font-medium text-ink block">Auto-fallback to Credits</span>
                <span className="text-[11px] text-muted">Prevent build stoppage on 429 rate limit</span>
              </div>
              <input
                type="checkbox"
                checked={fallbackToCredits}
                onChange={(e) => setFallbackToCredits(e.target.checked)}
                className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-border-soft flex items-center justify-end">
          <button
            id="models-save-btn"
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bb-btn bb-btn-primary text-xs px-4 py-2 font-medium"
          >
            {saving ? "Saving..." : "Save AI Model Configuration"}
          </button>
        </div>
      </section>
    </div>
  );
}
