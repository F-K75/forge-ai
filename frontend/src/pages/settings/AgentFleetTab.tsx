import { useState } from "react";
import { Bot, GitBranch, ShieldCheck, Play, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "react-hot-toast";
import { authApi } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { useAuthStore } from "../../store/authStore";
import type { AgentFleetPreferences } from "./types";

export function AgentFleetTab() {
  const { user } = useAuthStore();
  const userPrefs = (user?.preferences as Record<string, any>) || {};
  const storedFleet: Partial<AgentFleetPreferences> = (userPrefs.agentFleet as Partial<AgentFleetPreferences>) || {};

  const [fleet, setFleet] = useState<AgentFleetPreferences>({
    autoDeploy: storedFleet.autoDeploy ?? false,
    debugIterations: storedFleet.debugIterations ?? 3,
    requireMigrationApproval: storedFleet.requireMigrationApproval ?? true,
    requirePackageApproval: storedFleet.requirePackageApproval ?? true,
    requireScriptApproval: storedFleet.requireScriptApproval ?? true,
    codeFlavor: storedFleet.codeFlavor || "strict-ts",
    testCoverageMode: storedFleet.testCoverageMode || "comprehensive",
    gitBranchPrefix: storedFleet.gitBranchPrefix || "forge/",
    conventionalCommits: storedFleet.conventionalCommits ?? true,
  });

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (LIVE_MODE) {
        await authApi.updateProfile({
          preferences: {
            ...userPrefs,
            agentFleet: fleet,
          },
        });
      }
      toast.success("Agent fleet & execution policies saved");
    } catch {
      toast.error("Failed to update fleet configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="settings-agents-panel" className="space-y-8">
      {/* Self-Healing & Deployment Policies */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Bot size={15} className="text-accent" />
            Autonomous Execution & Self-Healing
          </h2>
          <p className="text-xs text-muted mt-1">
            Control the autonomy boundary for the developer, architect, and reviewer agent pipelines.
          </p>
        </div>

        <div className="space-y-5">
          {/* Debug Iterations Stepper */}
          <div className="p-4 rounded-xl border border-border-soft bg-base/50 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-ink flex items-center gap-2">
                  <RotateCcw size={14} className="text-accent" />
                  Self-Healing Compiler Loops ({fleet.debugIterations} iterations)
                </span>
                <p className="text-[11px] text-muted mt-1">
                  Number of automated self-repair attempts an agent runs when typechecks or test suites fail.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-panel p-1 rounded-lg border border-border-soft">
                {[1, 2, 3, 4, 5].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setFleet((f) => ({ ...f, debugIterations: count }))}
                    className={`h-7 w-8 rounded text-xs font-mono font-medium transition ${
                      fleet.debugIterations === count
                        ? "bg-ink text-on-ink shadow-sm"
                        : "text-muted hover:text-ink hover:bg-base"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-faint">
              Recommended: 3 loops balances rapid recovery without depleting credits on persistent environment bugs.
            </p>
          </div>

          {/* Auto-Deploy */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-border-soft bg-base/50">
            <div>
              <span className="text-xs font-semibold text-ink flex items-center gap-2">
                <Play size={14} className="text-ok" />
                Automatic Preview Deployment
              </span>
              <p className="text-[11px] text-muted mt-1">
                Instantly deploy to preview URL when all automated tests pass and QA score exceeds 85%.
              </p>
            </div>
            <input
              type="checkbox"
              id="fleet-auto-deploy"
              checked={fleet.autoDeploy}
              onChange={(e) => setFleet((f) => ({ ...f, autoDeploy: e.target.checked }))}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </div>
        </div>
      </section>

      {/* Interactive Safety & Approval Gates */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <ShieldCheck size={15} className="text-accent" />
            Interactive Approval Gates
          </h2>
          <p className="text-xs text-muted mt-1">
            Pause execution and request explicit human confirmation before performing high-risk actions.
          </p>
        </div>

        <div className="divide-y divide-border-soft">
          <label htmlFor="require-migration-approval" className="py-3.5 flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-medium text-ink block">Database Migrations & Schema Changes</span>
              <span className="text-[11px] text-muted">Requires confirmation before running SQL DDL or altering collection schemas.</span>
            </div>
            <input
              id="require-migration-approval"
              type="checkbox"
              checked={fleet.requireMigrationApproval}
              onChange={(e) => setFleet((f) => ({ ...f, requireMigrationApproval: e.target.checked }))}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </label>

          <label htmlFor="require-package-approval" className="py-3.5 flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-medium text-ink block">Package Installations (npm / pip)</span>
              <span className="text-[11px] text-muted">Prompts approval before introducing new 3rd-party dependencies.</span>
            </div>
            <input
              id="require-package-approval"
              type="checkbox"
              checked={fleet.requirePackageApproval}
              onChange={(e) => setFleet((f) => ({ ...f, requirePackageApproval: e.target.checked }))}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </label>

          <label htmlFor="require-script-approval" className="py-3.5 flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-medium text-ink block">Shell Script & File Deletions</span>
              <span className="text-[11px] text-muted">Warns before deleting non-empty directories or invoking raw shell commands.</span>
            </div>
            <input
              id="require-script-approval"
              type="checkbox"
              checked={fleet.requireScriptApproval}
              onChange={(e) => setFleet((f) => ({ ...f, requireScriptApproval: e.target.checked }))}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </label>
        </div>
      </section>

      {/* Code Generation Standards */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Sparkles size={15} className="text-accent" />
            Code Generation Standards & Git Conventions
          </h2>
          <p className="text-xs text-muted mt-1">
            Enforce typing rigor, automated test authoring, and version control hygiene.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label htmlFor="fleet-code-flavor" className="text-xs font-medium text-ink block">
              Code Architecture Flavor
            </label>
            <select
              id="fleet-code-flavor"
              value={fleet.codeFlavor}
              onChange={(e) => setFleet((f) => ({ ...f, codeFlavor: e.target.value as any }))}
              className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="strict-ts">Strict TypeScript + Tailwind (Production Ready)</option>
              <option value="fast-scaffold">Fast Scaffold (Speed prioritized)</option>
              <option value="lean-minimal">Lean & Minimalist (Zero boilerplate)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="fleet-test-mode" className="text-xs font-medium text-ink block">
              Automated Test Coverage
            </label>
            <select
              id="fleet-test-mode"
              value={fleet.testCoverageMode}
              onChange={(e) => setFleet((f) => ({ ...f, testCoverageMode: e.target.value as any }))}
              className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="comprehensive">Comprehensive Unit & Smoke Tests</option>
              <option value="smoke-only">Basic Smoke Tests Only</option>
              <option value="disabled">Skip Test Suite Creation</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="fleet-git-prefix" className="text-xs font-medium text-ink flex items-center gap-1.5">
              <GitBranch size={13} className="text-muted" />
              Git Branch Prefix
            </label>
            <input
              id="fleet-git-prefix"
              type="text"
              value={fleet.gitBranchPrefix}
              onChange={(e) => setFleet((f) => ({ ...f, gitBranchPrefix: e.target.value }))}
              className="w-full text-xs font-mono bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="forge/"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border-soft bg-base/40 self-end">
            <div>
              <span className="text-xs font-medium text-ink block">Conventional Commits</span>
              <span className="text-[11px] text-muted">Format commit messages with feat:, fix:, refactor:</span>
            </div>
            <input
              type="checkbox"
              checked={fleet.conventionalCommits}
              onChange={(e) => setFleet((f) => ({ ...f, conventionalCommits: e.target.checked }))}
              className="h-4 w-4 rounded text-accent focus:ring-accent cursor-pointer"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-border-soft flex items-center justify-end">
          <button
            id="fleet-save-btn"
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bb-btn bb-btn-primary text-xs px-4 py-2 font-medium"
          >
            {saving ? "Saving..." : "Save Fleet Policies"}
          </button>
        </div>
      </section>
    </div>
  );
}
