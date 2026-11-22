import { useState } from "react";
import {
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  Lock,
} from "lucide-react";

interface ForgeVisualSurfaceProps {
  activeDomain?: "billing" | "auth" | "analytics" | "app";
  onTriggerEvent?: (name: string) => void;
}

export function ForgeVisualSurface({
  activeDomain = "billing",
  onTriggerEvent,
}: ForgeVisualSurfaceProps) {
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [selectedPlan, setSelectedPlan] = useState<"pro" | "team">("pro");
  const [cardNumber, setCardNumber] = useState("4242 •••• •••• 4242");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<string | null>(null);

  const handlePay = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setPaymentDone(true);
      onTriggerEvent?.("stripe.payment.succeeded");
    }, 750);
  };

  return (
    <div className="h-full flex flex-col bg-base overflow-hidden select-none text-ink">
      {/* Preview Browser Chrome */}
      <div className="h-11 px-3 border-b border-border bg-panel-alt flex items-center justify-between gap-3 shrink-0">
        {/* Device Mode Switcher */}
        <div className="inline-flex items-center p-0.5 rounded-lg border border-border bg-panel shrink-0">
          {(
            [
              { id: "desktop", label: "Desktop view", icon: Monitor },
              { id: "tablet", label: "Tablet view", icon: Tablet },
              { id: "mobile", label: "Mobile view", icon: Smartphone },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = device === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setDevice(item.id)}
                title={item.label}
                aria-label={item.label}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                  active
                    ? "bg-accent text-white"
                    : "text-muted hover:text-ink hover:bg-panel-alt"
                }`}
              >
                <Icon size={13} />
              </button>
            );
          })}
        </div>

        {/* Address Bar */}
        <div className="flex items-center gap-2 px-3 h-7 rounded-md bg-panel border border-border font-mono text-xs text-muted max-w-md w-full justify-center min-w-0">
          <Lock size={11} className="text-ok shrink-0" />
          <span className="truncate text-ink">https://forge-app.internal/{activeDomain}</span>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono text-ok whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-ok shrink-0" />
            Live sandbox
          </span>
          <button
            type="button"
            onClick={() => {
              setPaymentDone(false);
              setAuthenticatedUser(null);
            }}
            className="w-8 h-8 rounded-md border border-border bg-panel text-muted hover:text-ink hover:bg-panel-alt flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            title="Reset sandbox state"
            aria-label="Reset sandbox state"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex items-start justify-center bg-base">
        <div
          className={`transition-all duration-200 bg-panel border border-border rounded-xl shadow-apple overflow-hidden ${
            device === "mobile"
              ? "w-[375px] min-h-[560px]"
              : device === "tablet"
              ? "w-[720px] min-h-[520px]"
              : "w-full max-w-4xl min-h-[520px]"
          }`}
        >
          {activeDomain === "billing" ? (
            <div className="p-6 sm:p-8 space-y-6">
              {/* Product Header */}
              <div className="text-center max-w-md mx-auto space-y-1.5">
                <p className="text-xs font-mono font-medium text-accent">
                  Checkout Sandbox
                </p>
                <h3 className="font-display text-xl sm:text-2xl font-semibold text-ink tracking-tight">
                  Choose your subscription plan
                </h3>
                <p className="text-sm text-muted">
                  Production checkout wired with Stripe Elements, automated tax, and instant provisioning.
                </p>
              </div>

              {/* Tiers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-xl mx-auto">
                <button
                  type="button"
                  onClick={() => setSelectedPlan("pro")}
                  className={`p-4 rounded-xl border text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                    selectedPlan === "pro"
                      ? "bg-accent-soft border-accent text-ink"
                      : "bg-panel border-border text-ink hover:bg-panel-alt"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="font-display font-semibold text-sm text-ink">Pro Builder</h4>
                      <p className="text-xs text-muted mt-0.5">For individuals &amp; founders</p>
                    </div>
                    <span className="text-base font-mono font-semibold tabular-nums text-ink">
                      $19<span className="text-xs font-normal text-muted">/mo</span>
                    </span>
                  </div>
                  <ul className="mt-3.5 space-y-1.5 text-xs text-muted">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-ok shrink-0" />
                      <span>Unlimited builds</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-ok shrink-0" />
                      <span>Edge CDN deployment</span>
                    </li>
                  </ul>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPlan("team")}
                  className={`p-4 rounded-xl border text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer ${
                    selectedPlan === "team"
                      ? "bg-accent-soft border-accent text-ink"
                      : "bg-panel border-border text-ink hover:bg-panel-alt"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="font-display font-semibold text-sm text-ink">Team Scale</h4>
                      <p className="text-xs text-muted mt-0.5">For autonomous squads</p>
                    </div>
                    <span className="text-base font-mono font-semibold tabular-nums text-ink">
                      $49<span className="text-xs font-normal text-muted">/mo</span>
                    </span>
                  </div>
                  <ul className="mt-3.5 space-y-1.5 text-xs text-muted">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-ok shrink-0" />
                      <span>Multi-agent fleet</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-ok shrink-0" />
                      <span>Dedicated Postgres</span>
                    </li>
                  </ul>
                </button>
              </div>

              {/* Stripe Payment Form */}
              <div className="max-w-md mx-auto p-5 rounded-xl bg-panel-alt border border-border space-y-4">
                <div className="flex items-center justify-between text-xs pb-3 border-b border-border">
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    <CreditCard size={14} className="text-muted" />
                    Payment Method
                  </span>
                  <span className="font-mono text-[11px] text-muted">Test Mode</span>
                </div>

                {paymentDone ? (
                  <div className="text-center py-4 space-y-2">
                    <div className="w-10 h-10 rounded-full bg-ok/15 text-ok flex items-center justify-center mx-auto">
                      <CheckCircle2 size={20} />
                    </div>
                    <h4 className="font-display text-sm font-semibold text-ink">
                      Subscription Active
                    </h4>
                    <p className="text-xs text-muted font-mono">
                      Webhook checkout.session.completed received &amp; verified.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="sandbox-card-number" className="block text-xs font-medium text-muted">Card Number</label>
                      <input
                        id="sandbox-card-number"
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full h-9 rounded-lg bg-panel px-3 border border-border text-ink font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label htmlFor="sandbox-card-expiry" className="block text-xs font-medium text-muted">Expiry</label>
                        <input
                          id="sandbox-card-expiry"
                          type="text"
                          defaultValue="12/28"
                          className="w-full h-9 rounded-lg bg-panel px-3 border border-border text-ink font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="sandbox-card-cvc" className="block text-xs font-medium text-muted">CVC</label>
                        <input
                          id="sandbox-card-cvc"
                          type="text"
                          defaultValue="382"
                          className="w-full h-9 rounded-lg bg-panel px-3 border border-border text-ink font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handlePay}
                      className="w-full h-9 rounded-lg bg-accent hover:bg-ember-glow text-white font-medium text-xs transition-colors duration-150 disabled:opacity-50 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
                    >
                      {isProcessing ? (
                        <span>Validating payment…</span>
                      ) : (
                        <span>Confirm ${selectedPlan === "pro" ? "19" : "49"} Subscription</span>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Authentication view */
            <div className="p-8 max-w-md mx-auto space-y-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-accent-soft text-accent flex items-center justify-center mx-auto">
                <ShieldCheck size={22} />
              </div>

              <div className="space-y-1">
                <h3 className="font-display text-xl font-semibold text-ink">
                  Sign in to Forge App
                </h3>
                <p className="text-xs text-muted">
                  Google Identity Services &amp; OAuth 2.1 PKCE Flow
                </p>
              </div>

              {authenticatedUser ? (
                <div className="p-4 rounded-xl bg-panel-alt border border-border text-left space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-ok">
                    <CheckCircle2 size={14} /> Signed in as {authenticatedUser}
                  </div>
                  <div className="text-[11px] font-mono text-muted bg-panel border border-border p-2.5 rounded-lg overflow-x-auto">
                    JWT Session: eyJhbGciOiJFUzI1NiIsIn...
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthenticatedUser("alex.chen@forge.sh");
                      onTriggerEvent?.("auth.oauth.authenticated");
                    }}
                    className="w-full h-10 px-4 rounded-lg bg-accent hover:bg-ember-glow text-white text-xs font-medium transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Continue with Google</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthenticatedUser("dev_architect@github");
                      onTriggerEvent?.("auth.oauth.authenticated");
                    }}
                    className="w-full h-10 px-4 rounded-lg bg-panel-alt hover:bg-base border border-border text-xs font-medium text-ink transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Continue with GitHub</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
