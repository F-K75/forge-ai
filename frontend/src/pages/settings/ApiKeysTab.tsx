import { useState, useEffect, useCallback } from "react";
import { Key, Plus, Trash2, Shield, AlertTriangle, Check, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";
import { apiKeysApi, type ApiKeyItem } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { ClipboardCopyButton } from "../../components/ui/ClipboardCopyButton";

const AVAILABLE_SCOPES = [
  { id: "builds:create", label: "Builds: Create", desc: "Trigger new agent builds and workflows" },
  { id: "builds:read", label: "Builds: Read", desc: "Stream logs and fetch build artifacts" },
  { id: "deployments:manage", label: "Deployments", desc: "Deploy preview and production apps" },
  { id: "projects:all", label: "Projects: Full Access", desc: "Read and write project repositories" },
  { id: "agents:invoke", label: "Agents: Direct", desc: "Invoke individual agent capabilities" },
];

const DEMO_KEYS: ApiKeyItem[] = [
  {
    id: "key_demo_ci_1",
    name: "github-actions-production",
    key_prefix: "sk_forge",
    scopes: ["builds:create", "builds:read", "deployments:manage"],
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    last_used_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 76).toISOString(),
  },
  {
    id: "key_demo_cli_2",
    name: "macbook-cli-terminal",
    key_prefix: "sk_forge",
    scopes: ["projects:all", "builds:create"],
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString(),
    last_used_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    expires_at: null,
  },
];

export function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Creation modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["builds:create", "builds:read"]);
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(90);
  const [creating, setCreating] = useState(false);

  // One-time key display state
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  // Revoke state
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKeyItem | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      if (LIVE_MODE) {
        const data = await apiKeysApi.list();
        setKeys(data || []);
      } else {
        const stored = localStorage.getItem("forge_demo_api_keys");
        if (stored) {
          setKeys(JSON.parse(stored));
        } else {
          setKeys(DEMO_KEYS);
        }
      }
    } catch {
      if (LIVE_MODE) {
        setKeys([]);
        toast.error("Failed to load API keys");
      } else {
        setKeys(DEMO_KEYS);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) {
      toast.error("Please enter a key name.");
      return;
    }
    setCreating(true);
    try {
      let createdKeyObj: ApiKeyItem;
      if (LIVE_MODE) {
        createdKeyObj = await apiKeysApi.create({
          name: newKeyName.trim(),
          scopes: selectedScopes,
          expires_in_days: expiresInDays,
        });
      } else {
        const generatedSecret = `sk_forge_${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}`;
        createdKeyObj = {
          id: `key_${Date.now()}`,
          name: newKeyName.trim(),
          key_prefix: generatedSecret.substring(0, 10),
          scopes: selectedScopes,
          created_at: new Date().toISOString(),
          last_used_at: null,
          expires_at: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null,
          key: generatedSecret,
        };
        const updated = [createdKeyObj, ...keys];
        setKeys(updated);
        localStorage.setItem("forge_demo_api_keys", JSON.stringify(updated));
      }

      setRevealedKey(createdKeyObj.key || `${createdKeyObj.key_prefix}••••••••••••••••`);
      setIsCreateOpen(false);
      setNewKeyName("");
      setSelectedScopes(["builds:create", "builds:read"]);
      toast.success("API key generated successfully");
      loadKeys();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to create API key";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!keyToRevoke) return;
    setRevoking(true);
    try {
      if (LIVE_MODE) {
        await apiKeysApi.delete(keyToRevoke.id);
      } else {
        const updated = keys.filter((k) => k.id !== keyToRevoke.id);
        setKeys(updated);
        localStorage.setItem("forge_demo_api_keys", JSON.stringify(updated));
      }
      toast.success(`API key "${keyToRevoke.name}" has been revoked`);
      setKeyToRevoke(null);
      loadKeys();
    } catch {
      toast.error("Failed to revoke API key");
    } finally {
      setRevoking(false);
    }
  };

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  return (
    <div id="settings-api-keys-panel" className="space-y-8">
      {/* Informational Banner */}
      <div className="rounded-xl border border-border bg-panel p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Key size={15} className="text-accent" />
              Platform Developer API Keys
            </h2>
            <p className="text-xs text-muted mt-1">
              Authenticate Forge CLI, GitHub Actions, and custom CI pipelines to invoke autonomous builds.
            </p>
          </div>

          <button
            id="create-api-key-btn"
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="bb-btn bb-btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Plus size={14} />
            Generate New Key
          </button>
        </div>

        {/* CLI Hint */}
        <div className="mt-4 p-3 rounded-lg bg-base/60 border border-border-soft flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="text-muted flex items-center gap-2">
            <span className="text-accent font-semibold">$</span>
            <span>export FORGE_API_KEY=&quot;sk_forge_...&quot; && forge build</span>
          </div>
          <ClipboardCopyButton
            text='export FORGE_API_KEY="sk_forge_..."'
            successMessage="CLI command copied"
            className="bb-btn bb-btn-subtle text-xs py-1 px-2.5 h-6 self-start sm:self-auto"
          />
        </div>
      </div>

      {/* Keys List */}
      <section className="rounded-xl border border-border bg-panel overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border-soft flex items-center justify-between">
          <div className="text-xs font-semibold text-ink">
            Active Keys ({keys.length})
          </div>
          <button
            type="button"
            onClick={loadKeys}
            disabled={loading}
            className="text-xs text-muted hover:text-ink flex items-center gap-1"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-muted">Loading API keys...</div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Shield size={32} className="mx-auto text-muted/50" />
            <p className="text-xs text-muted font-medium">No API keys created yet</p>
            <p className="text-[11px] text-faint max-w-sm mx-auto">
              Generate a key to connect your terminal or CI environment directly to Forge AI.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-soft bg-base/40 text-muted font-medium">
                  <th className="py-3 px-4">Key Name</th>
                  <th className="py-3 px-4">Key Prefix</th>
                  <th className="py-3 px-4">Scopes</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4">Last Used</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-base/30 transition">
                    <td className="py-3.5 px-4 font-medium text-ink">
                      <div className="flex items-center gap-2">
                        <Key size={13} className="text-accent shrink-0" />
                        <span>{k.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-faint">
                      <code>{k.key_prefix}••••••••</code>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-base border border-border-soft text-muted"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-muted font-mono text-[11px]">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-muted font-mono text-[11px]">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setKeyToRevoke(k)}
                        className="p-1.5 text-muted hover:text-error hover:bg-error/10 rounded transition"
                        title="Revoke Key"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Key Modal Dialog */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border border-border bg-panel p-6 shadow-2xl space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                <Key size={16} className="text-accent" />
                Generate New API Key
              </h3>
              <p className="text-xs text-muted mt-1">
                Configure descriptive identifier, access scopes, and expiration bounds.
              </p>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="new-key-name-input" className="text-xs font-medium text-ink block">
                  Key Name / Description
                </label>
                <input
                  id="new-key-name-input"
                  type="text"
                  required
                  placeholder="e.g. github-ci-runner or macbook-cli"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-ink block">Permissions / Scopes</span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {AVAILABLE_SCOPES.map((sc) => (
                    <label
                      key={sc.id}
                      htmlFor={`scope-${sc.id}`}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                        selectedScopes.includes(sc.id)
                          ? "border-accent bg-accent/5"
                          : "border-border-soft bg-base/40 hover:bg-base"
                      }`}
                    >
                      <input
                        id={`scope-${sc.id}`}
                        type="checkbox"
                        checked={selectedScopes.includes(sc.id)}
                        onChange={() => toggleScope(sc.id)}
                        className="mt-0.5 rounded text-accent focus:ring-accent"
                      />
                      <div>
                        <span className="font-semibold text-ink block">{sc.label}</span>
                        <span className="text-[11px] text-muted">{sc.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new-key-expiry" className="text-xs font-medium text-ink block">
                  Expiration
                </label>
                <select
                  id="new-key-expiry"
                  value={expiresInDays ?? "never"}
                  onChange={(e) => setExpiresInDays(e.target.value === "never" ? undefined : Number(e.target.value))}
                  className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value={30}>30 Days</option>
                  <option value={90}>90 Days (Recommended)</option>
                  <option value={180}>180 Days</option>
                  <option value={365}>1 Year</option>
                  <option value="never">Never Expires</option>
                </select>
              </div>

              <div className="pt-3 border-t border-border-soft flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="bb-btn bb-btn-subtle text-xs px-3.5 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="bb-btn bb-btn-primary text-xs px-4 py-2 font-medium"
                >
                  {creating ? "Generating..." : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-Time Revealed Key Modal */}
      {revealedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border border-ok/40 bg-panel p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3 text-ok">
              <Check className="h-6 w-6 rounded-full bg-ok/15 p-1" />
              <div>
                <h3 className="text-sm font-semibold text-ink">API Key Generated</h3>
                <span className="text-xs text-muted">Save this key now — you will not be able to see it again!</span>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-base border border-border-soft space-y-2">
              <span className="text-[10px] uppercase tracking-wider font-mono text-faint">Your Secret Key</span>
              <div className="flex items-center justify-between gap-2">
                <code className="text-xs font-mono text-accent break-all select-all font-semibold">
                  {revealedKey}
                </code>
                <ClipboardCopyButton
                  text={revealedKey}
                  successMessage="Key copied to clipboard"
                  className="bb-btn bb-btn-primary text-xs py-1.5 px-3 shrink-0"
                />
              </div>
            </div>

            <div className="rounded-lg bg-warn/10 border border-warn/20 p-3 text-xs text-warn flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <p>For your security, Forge does not store this plaintext token. If you lose it, you will need to generate a new key.</p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setRevealedKey(null)}
                className="bb-btn bb-btn-primary text-xs px-4 py-2"
              >
                I Have Saved My Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {keyToRevoke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-error/30 bg-panel p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-error">
              <AlertTriangle className="h-6 w-6" />
              <h3 className="text-sm font-semibold text-ink">Revoke API Key?</h3>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Are you sure you want to revoke <strong className="text-ink font-mono">{keyToRevoke.name}</strong>? Any CI/CD pipelines or scripts currently using this key will immediately stop working.
            </p>

            <div className="pt-3 border-t border-border-soft flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setKeyToRevoke(null)}
                className="bb-btn bb-btn-subtle text-xs px-3.5 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                disabled={revoking}
                className="bb-btn bb-btn-danger text-xs px-4 py-2 font-medium"
              >
                {revoking ? "Revoking..." : "Yes, Revoke Key"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
