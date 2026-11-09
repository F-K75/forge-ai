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
    <div className="h-full flex flex-col bg-[#FAF7F2] dark:bg-[#0D0D12] overflow-hidden select-none font-mono text-ink">
      {/* Test Suite Header */}
      <div className="h-10 px-3 border-b-2 border-black dark:border-white/80 bg-[#EFECE6] dark:bg-[#1A1A22] flex items-center justify-between text-xs gap-2 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <span className="flex items-center gap-1 font-mono text-black bg-emerald-400 border-2 border-black font-black text-[10px] uppercase px-2 h-7 shadow-[1px_1px_0px_#000] whitespace-nowrap">
            <CheckCircle2 size={11} strokeWidth={3} /> 42/42 PASSED (142MS)
          </span>

          <div className="flex items-center gap-1 font-mono text-[10px]">
            {(["all", "Auth", "Billing", "Database", "Edge"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`h-7 px-2 border-2 border-black dark:border-white/80 uppercase font-black transition-none active:translate-x-[1px] active:translate-y-[1px] ${
                  filter === s
                    ? "bg-brutal-yellow text-black shadow-[1.5px_1.5px_0px_#000]"
                    : "bg-white dark:bg-[#252530] text-ink shadow-[1px_1px_0px_#000] hover:bg-neutral-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={isRunning}
            onClick={handleRerun}
            className="h-7 px-2.5 bg-brutal-yellow hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-black border-2 border-black font-mono text-[10px] font-black uppercase flex items-center gap-1 shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer"
          >
            <RotateCcw size={10} strokeWidth={3} className={isRunning ? "animate-spin" : ""} />
            <span>{isRunning ? "RUNNING..." : "RE-RUN SUITE"}</span>
          </button>
        </div>
      </div>

      {/* Test Runner Results List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
        {filteredTests.map((test) => (
          <div
            key={test.id}
            className="p-2.5 border-2 border-black dark:border-white/80 bg-white dark:bg-[#1A1A24] shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              <span className="shrink-0 w-4 h-4 bg-emerald-400 text-black border border-black flex items-center justify-center text-[10px] font-black">
                ✓
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-ink text-xs">{test.name}</span>
                  <span className="text-[9px] font-mono font-black uppercase bg-[#F4F0EA] dark:bg-[#2A2A36] border border-black dark:border-white/60 px-1.5 py-0.2">
                    {test.suite}
                  </span>
                </div>
                <p className="font-mono text-[10px] text-muted truncate mt-0.5">
                  {test.assertion}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto text-[10px] font-mono">
              <span className="flex items-center gap-1 text-muted">
                <Clock size={10} /> {test.duration}
              </span>
              <span className="px-1.5 py-0.5 bg-emerald-400 text-black border border-black font-black text-[9px] uppercase">
                PASSED
              </span>
            </div>
          </div>
        ))}

        {/* Live Terminal Output Console */}
        <div className="mt-3 p-3 bg-[#0C0D10] text-[#E0E0E0] border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] font-mono text-[10px] space-y-1">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/20 text-[9px] uppercase tracking-wider text-neutral-400">
            <span className="flex items-center gap-1 text-[#00F0FF] font-black">
              <Terminal size={11} strokeWidth={2.5} /> TERMINAL_TEST_RUNNER
            </span>
            <span>VITEST 2.1.8 · NODE V20.18</span>
          </div>
          <p className="text-emerald-400 font-bold">✓ 42 tests passed in 10 test files</p>
          <p className="text-neutral-400">  Time: 142ms total (11ms setup, 131ms execution)</p>
          <p className="text-neutral-400">  Snapshots: 0 failed, 12 passed</p>
          <p className="text-emerald-400">  Coverage: 98.4% statements, 96.1% branches</p>
        </div>
      </div>
    </div>
  );
}
