import { useState } from "react";
import { Play, RotateCcw, CheckCircle2, AlertCircle, Clock, Terminal, Shield, Check, Filter } from "lucide-react";

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
    <div className="h-full flex flex-col bg-[#08090C] overflow-hidden select-none">
      {/* Test Suite Header */}
      <div className="h-11 px-4 border-b border-white/[0.06] bg-[#0C0D12] flex items-center justify-between text-xs text-[#888B96]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[#30D158] font-semibold text-[11px]">
            <CheckCircle2 size={13} /> 42 tests passed (142ms)
          </span>
          <span className="text-white/[0.1]">|</span>
          <div className="flex items-center gap-1 font-mono text-[11px]">
            {(["all", "Auth", "Billing", "Database", "Edge"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`px-2 py-0.5 rounded capitalize transition ${
                  filter === s ? "bg-white/[0.1] text-[#F4F4F6]" : "hover:text-[#F4F4F6]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isRunning}
            onClick={handleRerun}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-white/[0.06] hover:bg-white/[0.1] text-[#F4F4F6] font-mono text-[11px] transition active:scale-95"
          >
            <RotateCcw size={11} className={isRunning ? "animate-spin text-[#FF5722]" : ""} />
            <span>{isRunning ? "Running Suite..." : "Re-run 42 Tests"}</span>
          </button>
        </div>
      </div>

      {/* Test Runner Results List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
        {filteredTests.map((test) => (
          <div
            key={test.id}
            className="p-3 rounded-xl bg-[#0E1015] border border-white/[0.06] hover:border-white/[0.12] transition flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <span className="shrink-0 h-5 w-5 rounded-full bg-[#30D158]/15 text-[#30D158] flex items-center justify-center">
                <Check size={12} strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#F4F4F6]">{test.name}</span>
                  <span className="text-[10px] font-mono text-[#888B96] bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.04]">
                    {test.suite}
                  </span>
                </div>
                <p className="font-mono text-[10px] text-[#5A5D68] truncate mt-0.5">
                  {test.assertion}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto text-[11px] font-mono text-[#888B96]">
              <span className="flex items-center gap-1">
                <Clock size={11} /> {test.duration}
              </span>
              <span className="text-[#30D158]">PASSED</span>
            </div>
          </div>
        ))}

        {/* Live Terminal Output Console */}
        <div className="mt-4 p-4 rounded-xl bg-[#060709] border border-white/[0.08] font-mono text-[11px] text-[#888B96] space-y-1">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-[#5A5D68]">
            <span className="flex items-center gap-1.5">
              <Terminal size={12} className="text-[#FF5722]" /> System Test Output
            </span>
            <span>Runner: Vitest 2.1.8 · Node v20.18</span>
          </div>
          <p className="text-[#30D158]">✓ 42 tests passed in 10 test files</p>
          <p className="text-[#A0A3AF]">  Time: 142ms total (11ms setup, 131ms execution)</p>
          <p className="text-[#5A5D68]">  Snapshots: 0 failed, 12 passed</p>
          <p className="text-[#30D158]">  Coverage: 98.4% statements, 96.1% branches</p>
        </div>
      </div>
    </div>
  );
}
