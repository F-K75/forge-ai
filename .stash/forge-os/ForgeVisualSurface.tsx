import { useState } from "react";
import { Monitor, Smartphone, Tablet, RefreshCw, CheckCircle2, ShieldCheck, CreditCard, Sparkles, ArrowRight, Lock, ExternalLink } from "lucide-react";

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
    <div className="h-full flex flex-col bg-[#08090C] overflow-hidden select-none">
      {/* Visual Canvas Sub-Header */}
      <div className="h-10 px-4 border-b border-white/[0.06] bg-[#0C0D12] flex items-center justify-between text-xs text-[#888B96]">
        {/* Device Mode Switcher */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDevice("desktop")}
            className={`p-1.5 rounded transition ${device === "desktop" ? "bg-white/[0.08] text-[#F4F4F6]" : "hover:text-[#F4F4F6]"}`}
            title="Desktop view"
          >
            <Monitor size={13} />
          </button>
          <button
            type="button"
            onClick={() => setDevice("tablet")}
            className={`p-1.5 rounded transition ${device === "tablet" ? "bg-white/[0.08] text-[#F4F4F6]" : "hover:text-[#F4F4F6]"}`}
            title="Tablet view"
          >
            <Tablet size={13} />
          </button>
          <button
            type="button"
            onClick={() => setDevice("mobile")}
            className={`p-1.5 rounded transition ${device === "mobile" ? "bg-white/[0.08] text-[#F4F4F6]" : "hover:text-[#F4F4F6]"}`}
            title="Mobile view"
          >
            <Smartphone size={13} />
          </button>
        </div>

        {/* Address Bar */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-[#07080B] border border-white/[0.06] font-mono text-[11px] text-[#A0A3AF] max-w-sm w-full truncate justify-center">
          <Lock size={10} className="text-[#30D158]" />
          <span>https://forge-app.internal/{activeDomain}</span>
        </div>

        {/* Right Status */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-mono text-[#30D158]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#30D158] animate-pulse" />
            LIVE ARTIFACT
          </span>
          <button
            type="button"
            onClick={() => {
              setPaymentDone(false);
              setAuthenticatedUser(null);
            }}
            className="p-1.5 rounded text-[#888B96] hover:text-[#F4F4F6] transition"
            title="Reset sandbox state"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex items-center justify-center bg-[#060709]">
        <div
          className={`transition-all duration-300 rounded-xl bg-[#0D0F14] border border-white/[0.08] shadow-2xl shadow-black overflow-hidden ${
            device === "mobile"
              ? "w-[375px] min-h-[640px]"
              : device === "tablet"
              ? "w-[720px] min-h-[540px]"
              : "w-full max-w-4xl min-h-[580px]"
          }`}
        >
          {activeDomain === "billing" ? (
            <div className="p-6 sm:p-10 space-y-8">
              {/* Product Header */}
              <div className="text-center max-w-md mx-auto space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FF5722]/10 border border-[#FF5722]/30 text-[11px] font-mono text-[#FF5722]">
                  <Sparkles size={11} /> Stripe Powered Subscriptions
                </div>
                <h3 className="text-2xl font-semibold text-[#F4F4F6] tracking-tight">
                  Choose your subscription plan
                </h3>
                <p className="text-xs text-[#888B96]">
                  Production checkout wired with Stripe Elements, automated tax, and instant provisioning.
                </p>
              </div>

              {/* Tiers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                <div
                  onClick={() => setSelectedPlan("pro")}
                  className={`p-5 rounded-xl border cursor-pointer transition ${
                    selectedPlan === "pro"
                      ? "bg-[#14161F] border-[#FF5722] ring-1 ring-[#FF5722]"
                      : "bg-[#0A0B0E] border-white/[0.06] hover:border-white/[0.12]"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-sm text-[#F4F4F6]">Pro Builder</h4>
                      <p className="text-[11px] text-[#888B96] mt-0.5">For individuals & founders</p>
                    </div>
                    <span className="text-lg font-bold text-[#F4F4F6] font-mono">$19<span className="text-xs font-normal text-[#888B96]">/mo</span></span>
                  </div>
                  <ul className="mt-4 space-y-1.5 text-xs text-[#888B96] font-mono">
                    <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-[#30D158]" /> Unlimited builds</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-[#30D158]" /> Edge CDN deployment</li>
                  </ul>
                </div>

                <div
                  onClick={() => setSelectedPlan("team")}
                  className={`p-5 rounded-xl border cursor-pointer transition ${
                    selectedPlan === "team"
                      ? "bg-[#14161F] border-[#FF5722] ring-1 ring-[#FF5722]"
                      : "bg-[#0A0B0E] border-white/[0.06] hover:border-white/[0.12]"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-sm text-[#F4F4F6]">Team Scale</h4>
                      <p className="text-[11px] text-[#888B96] mt-0.5">For autonomous squads</p>
                    </div>
                    <span className="text-lg font-bold text-[#F4F4F6] font-mono">$49<span className="text-xs font-normal text-[#888B96]">/mo</span></span>
                  </div>
                  <ul className="mt-4 space-y-1.5 text-xs text-[#888B96] font-mono">
                    <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-[#30D158]" /> Multi-agent orchestration</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 size={12} className="text-[#30D158]" /> Dedicated PostgreSQL node</li>
                  </ul>
                </div>
              </div>

              {/* Stripe Payment Form */}
              <div className="max-w-md mx-auto p-5 rounded-xl bg-[#090A0E] border border-white/[0.08] space-y-4">
                <div className="flex items-center justify-between text-xs text-[#888B96] pb-2 border-b border-white/[0.06]">
                  <span className="flex items-center gap-1.5 font-medium text-[#F4F4F6]">
                    <CreditCard size={13} className="text-[#FF5722]" /> Payment Method
                  </span>
                  <span className="font-mono text-[10px]">Stripe Elements (Test Mode)</span>
                </div>

                {paymentDone ? (
                  <div className="text-center py-6 space-y-2">
                    <div className="w-10 h-10 rounded-full bg-[#30D158]/20 text-[#30D158] flex items-center justify-center mx-auto">
                      <CheckCircle2 size={20} />
                    </div>
                    <h4 className="text-base font-semibold text-[#F4F4F6]">Subscription Active</h4>
                    <p className="text-xs text-[#888B96] font-mono">
                      Webhook checkout.session.completed received & validated.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 text-xs">
                      <label className="block text-[#A0A3AF] font-mono text-[11px]">Card details</label>
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full bg-[#0E1015] px-3 py-2 rounded-lg border border-white/[0.08] text-[#F4F4F6] font-mono text-xs focus:outline-none focus:border-[#FF5722]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[#A0A3AF] font-mono text-[11px] mb-1">Expiry</label>
                        <input
                          type="text"
                          defaultValue="12/28"
                          className="w-full bg-[#0E1015] px-3 py-2 rounded-lg border border-white/[0.08] text-[#F4F4F6] font-mono text-xs focus:outline-none focus:border-[#FF5722]"
                        />
                      </div>
                      <div>
                        <label className="block text-[#A0A3AF] font-mono text-[11px] mb-1">CVC</label>
                        <input
                          type="text"
                          defaultValue="382"
                          className="w-full bg-[#0E1015] px-3 py-2 rounded-lg border border-white/[0.08] text-[#F4F4F6] font-mono text-xs focus:outline-none focus:border-[#FF5722]"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handlePay}
                      className="w-full py-2.5 rounded-lg bg-[#FF5722] hover:bg-[#FF7A1A] text-white font-medium text-xs transition active:scale-98 flex items-center justify-center gap-2 shadow-sm"
                    >
                      {isProcessing ? (
                        <span>Validating with Stripe...</span>
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
