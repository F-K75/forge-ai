import { useState } from "react";
import { Monitor, Smartphone, Tablet, RefreshCw, CheckCircle2, ShieldCheck, CreditCard, Sparkles, Lock } from "lucide-react";

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
    <div className="h-full flex flex-col bg-[#FAF7F2] dark:bg-[#0D0D12] overflow-hidden select-none font-mono text-ink">
      {/* Visual Canvas Sub-Header */}
      <div className="h-10 px-3 border-b-2 border-black dark:border-white/80 bg-[#EFECE6] dark:bg-[#1A1A22] flex items-center justify-between text-xs gap-2 shrink-0">
        {/* Device Mode Switcher */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setDevice("desktop")}
            className={`w-7 h-7 border-2 border-black dark:border-white/80 flex items-center justify-center transition-none active:translate-x-[1px] active:translate-y-[1px] ${
              device === "desktop"
                ? "bg-brutal-yellow text-black shadow-[1.5px_1.5px_0px_#000]"
                : "bg-white dark:bg-[#252530] text-ink shadow-[1px_1px_0px_#000] hover:bg-neutral-100"
            }`}
            title="Desktop view"
          >
            <Monitor size={12} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => setDevice("tablet")}
            className={`w-7 h-7 border-2 border-black dark:border-white/80 flex items-center justify-center transition-none active:translate-x-[1px] active:translate-y-[1px] ${
              device === "tablet"
                ? "bg-brutal-yellow text-black shadow-[1.5px_1.5px_0px_#000]"
                : "bg-white dark:bg-[#252530] text-ink shadow-[1px_1px_0px_#000] hover:bg-neutral-100"
            }`}
            title="Tablet view"
          >
            <Tablet size={12} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={() => setDevice("mobile")}
            className={`w-7 h-7 border-2 border-black dark:border-white/80 flex items-center justify-center transition-none active:translate-x-[1px] active:translate-y-[1px] ${
              device === "mobile"
                ? "bg-brutal-yellow text-black shadow-[1.5px_1.5px_0px_#000]"
                : "bg-white dark:bg-[#252530] text-ink shadow-[1px_1px_0px_#000] hover:bg-neutral-100"
            }`}
            title="Mobile view"
          >
            <Smartphone size={12} strokeWidth={2.5} />
          </button>
        </div>

        {/* Address Bar */}
        <div className="flex items-center gap-1.5 px-2.5 h-7 bg-white dark:bg-[#1E1E28] border-2 border-black dark:border-white/80 font-mono text-[10px] font-bold text-ink max-w-sm w-full truncate justify-center shadow-[1px_1px_0px_#000]">
          <Lock size={10} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate">https://forge-app.internal/{activeDomain}</span>
        </div>

        {/* Right Status */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden sm:flex items-center gap-1 px-2 h-7 bg-white dark:bg-[#252530] border-2 border-black dark:border-white/80 font-mono font-bold text-[10px] text-emerald-600 dark:text-emerald-400 shadow-[1px_1px_0px_#000]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>LIVE_RUN</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setPaymentDone(false);
              setAuthenticatedUser(null);
            }}
            className="w-7 h-7 bg-white dark:bg-[#252530] text-ink hover:bg-brutal-yellow hover:text-black border-2 border-black dark:border-white/80 flex items-center justify-center shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
            title="Reset sandbox state"
          >
            <RefreshCw size={11} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex items-center justify-center bg-[#FAF7F2] dark:bg-[#0D0D12]">
        <div
          className={`transition-all bg-white dark:bg-[#14141C] border-2 border-black dark:border-white/80 shadow-[4px_4px_0px_#000] dark:shadow-[4px_4px_0px_#fff] overflow-hidden ${
            device === "mobile"
              ? "w-[375px] min-h-[600px]"
              : device === "tablet"
              ? "w-[720px] min-h-[520px]"
              : "w-full max-w-4xl min-h-[540px]"
          }`}
        >
          {activeDomain === "billing" ? (
            <div className="p-5 sm:p-8 space-y-6">
              {/* Product Header */}
              <div className="text-center max-w-md mx-auto space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-brutal-yellow text-black border-2 border-black font-black text-[10px] uppercase shadow-[1px_1px_0px_#000]">
                  <Sparkles size={11} /> STRIPE_CHECKOUT_SANDBOX
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-ink uppercase tracking-tight">
                  Choose your subscription plan
                </h3>
                <p className="text-xs text-muted font-sans">
                  Production checkout wired with Stripe Elements, automated tax, and instant provisioning.
                </p>
              </div>

              {/* Tiers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
                <button
                  type="button"
                  onClick={() => setSelectedPlan("pro")}
                  className={`p-4 border-2 border-black dark:border-white/80 text-left transition-none active:translate-x-[1px] active:translate-y-[1px] ${
                    selectedPlan === "pro"
                      ? "bg-brutal-yellow text-black shadow-[3px_3px_0px_#000]"
                      : "bg-white dark:bg-[#1C1C26] text-ink shadow-[2px_2px_0px_#000] hover:bg-neutral-100"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-sm uppercase">Pro Builder</h4>
                      <p className="text-[10px] text-muted mt-0.5 font-sans">For individuals & founders</p>
                    </div>
                    <span className="text-base font-black font-mono">$19<span className="text-[10px] font-normal">/mo</span></span>
                  </div>
                  <ul className="mt-3 space-y-1 text-[11px] font-mono">
                    <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-600" /> Unlimited builds</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-600" /> Edge CDN deployment</li>
                  </ul>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPlan("team")}
                  className={`p-4 border-2 border-black dark:border-white/80 text-left transition-none active:translate-x-[1px] active:translate-y-[1px] ${
                    selectedPlan === "team"
                      ? "bg-brutal-yellow text-black shadow-[3px_3px_0px_#000]"
                      : "bg-white dark:bg-[#1C1C26] text-ink shadow-[2px_2px_0px_#000] hover:bg-neutral-100"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-sm uppercase">Team Scale</h4>
                      <p className="text-[10px] text-muted mt-0.5 font-sans">For autonomous squads</p>
                    </div>
                    <span className="text-base font-black font-mono">$49<span className="text-[10px] font-normal">/mo</span></span>
                  </div>
                  <ul className="mt-3 space-y-1 text-[11px] font-mono">
                    <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-600" /> Multi-agent fleet</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-600" /> Dedicated Postgres</li>
                  </ul>
                </button>
              </div>

              {/* Stripe Payment Form */}
              <div className="max-w-md mx-auto p-4 bg-[#F4F0EA] dark:bg-[#1A1A22] border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] space-y-3">
                <div className="flex items-center justify-between text-xs pb-2 border-b-2 border-black dark:border-white/80">
                  <span className="flex items-center gap-1.5 font-black uppercase text-ink">
                    <CreditCard size={12} strokeWidth={2.5} /> PAYMENT_METHOD
                  </span>
                  <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 bg-white dark:bg-[#252530] border border-black">TEST_MODE</span>
                </div>

                {paymentDone ? (
                  <div className="text-center py-4 space-y-1.5">
                    <div className="w-8 h-8 bg-emerald-400 text-black border-2 border-black flex items-center justify-center mx-auto shadow-[1.5px_1.5px_0px_#000]">
                      <CheckCircle2 size={16} strokeWidth={3} />
                    </div>
                    <h4 className="text-sm font-black uppercase text-ink">SUBSCRIPTION_ACTIVE</h4>
                    <p className="text-[10px] text-muted font-mono">
                      Webhook checkout.session.completed received & verified.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1 text-xs">
                      <label className="block text-ink font-mono font-bold text-[10px] uppercase">Card Number</label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full bg-white dark:bg-[#14141C] px-2.5 py-1.5 border-2 border-black dark:border-white/80 text-ink font-mono text-xs outline-none shadow-[1px_1px_0px_#000]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="block text-ink font-mono font-bold text-[10px] uppercase mb-0.5">Expiry</label>
                        <input
                          type="text"
                          defaultValue="12/28"
                          className="w-full bg-white dark:bg-[#14141C] px-2.5 py-1.5 border-2 border-black dark:border-white/80 text-ink font-mono text-xs outline-none shadow-[1px_1px_0px_#000]"
                        />
                      </div>
                      <div>
                        <label className="block text-ink font-mono font-bold text-[10px] uppercase mb-0.5">CVC</label>
                        <input
                          type="text"
                          defaultValue="382"
                          className="w-full bg-white dark:bg-[#14141C] px-2.5 py-1.5 border-2 border-black dark:border-white/80 text-ink font-mono text-xs outline-none shadow-[1px_1px_0px_#000]"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handlePay}
                      className="w-full py-2 bg-brutal-yellow hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-black border-2 border-black font-mono font-black text-xs uppercase transition-none active:translate-x-[1px] active:translate-y-[1px] flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_#000] cursor-pointer"
                    >
                      {isProcessing ? (
                        <span>VALIDATING STRIPE...</span>
                      ) : (
                        <span>CONFIRM ${selectedPlan === "pro" ? "19" : "49"} SUBSCRIPTION</span>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Authentication view */
            <div className="p-8 max-w-md mx-auto space-y-6 text-center">
              <div className="w-12 h-12 rounded-xl bg-[#0F1117] border border-white/[0.1] flex items-center justify-center mx-auto text-[#FF5722]">
                <ShieldCheck size={24} />
              </div>

              <div>
                <h3 className="text-xl font-semibold text-[#F4F4F6]">Sign in to Forge App</h3>
                <p className="text-xs text-[#888B96] mt-1">Google Identity Services & OAuth 2.1 PKCE Flow</p>
              </div>

              {authenticatedUser ? (
                <div className="p-4 rounded-xl bg-[#090A0E] border border-white/[0.08] text-left space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#30D158]">
                    <CheckCircle2 size={14} /> Signed In as {authenticatedUser}
                  </div>
                  <div className="text-[11px] font-mono text-[#888B96] bg-[#060709] p-2 rounded overflow-x-auto">
                    JWT Session: eyJhbGciOiJFUzI1NiIsIn...
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthenticatedUser("alex.chen@forge.sh");
                      onTriggerEvent?.("auth.oauth.authenticated");
                    }}
                    className="w-full py-2.5 px-4 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-medium text-[#F4F4F6] transition flex items-center justify-center gap-2"
                  >
                    <span>Continue with Google</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthenticatedUser("dev_architect@github");
                      onTriggerEvent?.("auth.oauth.authenticated");
                    }}
                    className="w-full py-2.5 px-4 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-[#D1D4DC] transition flex items-center justify-center gap-2"
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
