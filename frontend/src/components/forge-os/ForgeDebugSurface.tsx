import { useState } from "react";
import { RotateCcw, CheckCircle2, Clock, Terminal } from "lucide-react";

interface TestCase {
  id: string;
  name: string;
  suite: "Auth" | "Billing" | "Database" | "Edge";
  duration: string;
  status: "passed" | "running" | "failed";
  assertion: string;
}

const TESTS: TestCase[] = [
  { id: "t-1", name: "OAuth PKCE code verifier SHA-256 match", suite: "Auth", duration: "12ms", status: "passed", assertion: "expect(crypto.subtle.digest).toBeValidSHA256()" },
  { id: "t-2", name: "Session token expires after 7 days", suite: "Auth", duration: "8ms", status: "passed", assertion: "expect(session.expiresAt - session.createdAt).toBe(604800000)" },
  { id: "t-3", name: "CSRF token rejected on origin mismatch", suite: "Auth", duration: "14ms", status: "passed", assertion: "expect(response.status).toBe(403)" },
  { id: "t-4", name: "Stripe checkout session idempotency key", suite: "Billing", duration: "19ms", status: "passed", assertion: "expect(stripe.checkout.sessions.create).toBeCalledWithIdempotency()" },
  { id: "t-5", name: "Webhook rejects unsigned payload", suite: "Billing", duration: "11ms", status: "passed", assertion: "expect(verifyWebhookSignature).toThrow('InvalidSignature')" },
  { id: "t-6", name: "Subscription downgrade retains access till period_end", suite: "Billing", duration: "16ms", status: "passed", assertion: "expect(tier.activeUntilPeriodEnd).toBe(true)" },
  { id: "t-7", name: "PostgreSQL foreign key cascade on user delete", suite: "Database", duration: "24ms", status: "passed", assertion: "expect(remainingTokens.count).toBe(0)" },
  { id: "t-8", name: "Connection pool auto-reconnects on drop", suite: "Database", duration: "9ms", status: "passed", assertion: "expect(pool.totalConnections).toBeGreaterThanOrEqual(1)" },
  { id: "t-9", name: "Edge cold start latency < 25ms", suite: "Edge", duration: "18ms", status: "passed", assertion: "expect(measuredLatency).toBeLessThan(25)" },
  { id: "t-10", name: "Automated TLS 1.3 cipher suite negotiation", suite: "Edge", duration: "11ms", status: "passed", assertion: "expect(tls.cipher).toContain('TLS_AES_128_GCM_SHA256')" },
];

export function ForgeDebugSurface() {
  const [filter, setFilter] = useState<"all" | "Auth" | "Billing" | "Database" | "Edge">("all");
  const [isRunning, setIsRunning] = useState(false);

  const filteredTests = filter === "all" ? TESTS : TESTS.filter((t) => t.suite === filter);

  const handleRerun = () => {
    setIsRunning(true);
    setTimeout(() => setIsRunning(false), 600);
  };

  return (
    <div className="h-full flex flex-col bg-base overflow-hidden select-none text-ink">
      {/* Test Suite Header */}
      <div className="h-11 px-4 border-b border-border bg-panel-alt flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-ok whitespace-nowrap tabular-nums">
            <CheckCircle2 size={14} />
            42/42 Passed · 142ms
          </span>

          <div className="inline-flex items-center p-0.5 rounded-pill border border-border bg-panel">
            {(["all", "Auth", "Billing", "Database", "Edge"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`h-7 px-2.5 rounded-pill text-xs font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                  filter === s
                    ? "bg-ink text-on-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={isRunning}
          onClick={handleRerun}
          className="h-8 px-3 rounded-pill bg-ink hover:bg-ink/90 text-on-ink text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors duration-150 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
        >
          <RotateCcw size={12} className={isRunning ? "animate-spin" : ""} />
          <span>{isRunning ? "Running…" : "Re-run Suite"}</span>
        </button>
      </div>

      {/* Test Runner Results List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="rounded-xl border border-border bg-panel overflow-hidden divide-y divide-border">
          {filteredTests.map((test) => (
            <div
              key={test.id}
              className="px-4 py-3 hover:bg-panel-alt/60 transition-colors duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="flex items-start gap-3 min-w-0">
                <CheckCircle2 size={15} className="text-ok shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-medium text-sm text-ink">{test.name}</span>
                    <span className="text-[11px] font-mono text-muted">
                      {test.suite}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-muted truncate mt-0.5">
                    {test.assertion}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0 self-end sm:self-auto font-mono text-xs tabular-nums">
                <span className="inline-flex items-center gap-1 text-muted">
                  <Clock size={12} /> {test.duration}
                </span>
                <span className="text-ok font-medium">Passed</span>
              </div>
            </div>
          ))}
        </div>

        {/* Console Output */}
        <div className="rounded-xl border border-border bg-ink text-muted p-4 font-mono text-xs space-y-1.5">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border text-[11px] text-faint">
            <span className="inline-flex items-center gap-1.5 text-muted font-medium">
              <Terminal size={13} className="text-accent" />
              Vitest Runner Output
            </span>
            <span className="tabular-nums">Vitest 2.1.8 · Node v20.18</span>
          </div>
          <p className="text-ok">✓ 42 tests passed across 10 test files</p>
          <p className="text-faint tabular-nums">  Duration: 142ms total (11ms setup, 131ms execution)</p>
          <p className="text-faint tabular-nums">  Snapshots: 0 failed, 12 passed</p>
          <p className="text-ok tabular-nums">  Coverage: 98.4% statements, 96.1% branches</p>
        </div>
      </div>
    </div>
  );
}
