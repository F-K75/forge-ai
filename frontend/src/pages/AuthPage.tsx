import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hammer, Mail, Lock, Github, Chrome, Check } from "lucide-react";
import { AGENTS } from "../lib/agents";
import { useAuthStore } from "../store/authStore";

type Mode = "signin" | "signup";

export default function AuthPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        await register(email, email.split("@")[0] || "Builder", password);
        navigate("/onboarding");
      } else {
        await login(email, password);
        navigate("/");
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      {/* Brand panel — hidden below md */}
      <aside
        aria-hidden="true"
        className="hidden md:flex md:w-2/5 flex-col bg-gradient-to-b from-panel to-[#1A1430] relative overflow-hidden"
      >
        {/* Soft radial glow top-right */}
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-accent opacity-[0.07] blur-[90px] pointer-events-none" />

        {/* Logo */}
        <div className="flex items-center gap-2.5 px-10 pt-10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-[#A855F7] flex items-center justify-center shrink-0">
            <Hammer size={16} className="text-white" aria-hidden="true" />
          </div>
          <span className="text-base font-bold text-ink tracking-tight">Forge</span>
        </div>

        {/* Headline + agent list */}
        <div className="flex-1 flex flex-col justify-center px-10">
          <h2 className="text-[1.55rem] font-bold text-ink leading-snug mb-8">
            Describe your app.<br />Watch a team build it.
          </h2>
          <ol className="flex flex-col gap-3">
            {AGENTS.map((agent, i) => {
              const Icon = agent.icon;
              const opacity = 0.42 + (i / (AGENTS.length - 1)) * 0.58;
              return (
                <li key={agent.id} className="flex items-center gap-3" style={{ opacity }}>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${agent.hue}1F`,
                      border: `1px solid ${agent.hue}44`,
                    }}
                  >
                    <Icon size={14} style={{ color: agent.hue }} aria-hidden="true" />
                  </div>
                  <span className="text-sm text-ink">{agent.label}</span>
                  <Check
                    size={12}
                    className="ml-auto text-ok opacity-60"
                    aria-hidden="true"
                  />
                </li>
              );
            })}
          </ol>
        </div>

        {/* Social proof */}
        <p className="px-10 pb-10 text-xs text-muted">
          Trusted by 2,000+ builders shipping faster with AI agents.
        </p>
      </aside>

      {/* Form column */}
      <div className="flex-1 flex items-center justify-center bg-base px-6">
        <main className="w-full max-w-sm">
          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-ink">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              {mode === "signup"
                ? "Start building free — 10 credits, no card."
                : "Sign in to keep building."}
            </p>
          </div>

          {/* SSO buttons */}
          <div className="flex flex-col gap-2.5 mb-5">
            <button
              type="button"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-panel border border-border text-sm text-ink hover:bg-panel-alt transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Github size={15} aria-hidden="true" />
              Continue with GitHub
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-panel border border-border text-sm text-ink hover:bg-panel-alt transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Chrome size={15} aria-hidden="true" />
              Continue with Google
            </button>
          </div>

          {/* "or" divider */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-base text-xs text-faint">or</span>
            </div>
          </div>

          {/* Email + password */}
          <div className="flex flex-col gap-3 mb-5">
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full bg-panel-alt border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition motion-reduce:transition-none"
              />
            </div>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="••••••••"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="w-full bg-panel-alt border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition motion-reduce:transition-none"
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="mb-5 bg-error/10 border border-error/30 text-error px-3.5 py-2.5 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Primary submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:opacity-90 transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:opacity-50 disabled:cursor-not-allowed mb-5"
          >
            {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          {/* Mode toggle */}
          <p className="text-center text-sm text-muted">
            {mode === "signup" ? "Already have an account? " : "New to Forge? "}
            <button
              type="button"
              onClick={() =>
                setMode((m) => (m === "signup" ? "signin" : "signup"))
              }
              className="text-accent hover:opacity-80 transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        </main>
      </div>
    </div>
  );
}
