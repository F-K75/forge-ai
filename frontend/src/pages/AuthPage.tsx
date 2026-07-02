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
    <div className="flex h-screen bg-land-paper overflow-hidden">
      {/* Brand panel — hidden below md */}
      <aside
        aria-hidden="true"
        className="hidden md:flex md:w-2/5 flex-col bg-land-surface border-r border-land-border relative overflow-hidden"
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-10 pt-10">
          <div className="w-9 h-9 rounded-xl bg-land-accent flex items-center justify-center shrink-0">
            <Hammer size={16} className="text-white" aria-hidden="true" />
          </div>
          <span className="text-base font-bold text-land-ink tracking-tight">Forge</span>
        </div>

        {/* Headline + agent list */}
        <div className="flex-1 flex flex-col justify-center px-10">
          <h2 className="text-[1.55rem] font-bold text-land-ink leading-snug mb-8">
            Describe your app.<br />
            <span className="text-land-muted">Watch a team build it.</span>
          </h2>
          <ol className="flex flex-col gap-3">
            {AGENTS.map((agent) => {
              const Icon = agent.icon;
              return (
                <li key={agent.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-land-border-soft border border-land-border">
                    <Icon size={14} className="text-land-faint" aria-hidden="true" />
                  </div>
                  <span className="text-sm text-land-muted">{agent.label}</span>
                  <Check size={12} className="ml-auto text-land-accent" aria-hidden="true" />
                </li>
              );
            })}
          </ol>
        </div>

        {/* Social proof */}
        <p className="px-10 pb-10 text-xs text-land-faint">
          Trusted by 2,000+ builders shipping faster with AI agents.
        </p>
      </aside>

      {/* Form column */}
      <div className="flex-1 flex items-center justify-center bg-land-paper px-6">
        <main className="w-full max-w-sm">
          {/* Heading */}
          <div className="mb-7">
            <h1 className="text-2xl font-bold text-land-ink">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="mt-1.5 text-sm text-land-muted">
              {mode === "signup"
                ? "Start building free — 10 credits, no card."
                : "Sign in to keep building."}
            </p>
          </div>

          {/* SSO buttons */}
          <div className="flex flex-col gap-2.5 mb-5">
            <button
              type="button"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-land-surface border border-land-border text-sm text-land-ink hover:bg-land-border-soft transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
            >
              <Github size={15} aria-hidden="true" />
              Continue with GitHub
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-land-surface border border-land-border text-sm text-land-ink hover:bg-land-border-soft transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent"
            >
              <Chrome size={15} aria-hidden="true" />
              Continue with Google
            </button>
          </div>

          {/* "or" divider */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-land-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-land-paper text-xs text-land-faint">or</span>
            </div>
          </div>

          {/* Email + password */}
          <div className="flex flex-col gap-3 mb-5">
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-land-faint pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full bg-land-surface border border-land-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-land-ink placeholder:text-land-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent transition motion-reduce:transition-none"
              />
            </div>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-land-faint pointer-events-none"
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
                className="w-full bg-land-surface border border-land-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-land-ink placeholder:text-land-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent transition motion-reduce:transition-none"
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="mb-5 bg-red-500/10 border border-red-500/30 text-red-400 px-3.5 py-2.5 rounded-xl text-sm">
              {error}
            </div>
          )}

          {/* Primary submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            className="w-full py-2.5 rounded-xl bg-land-ink text-land-paper text-sm font-semibold hover:opacity-90 transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent focus-visible:ring-offset-2 focus-visible:ring-offset-land-paper disabled:opacity-50 disabled:cursor-not-allowed mb-5"
          >
            {loading ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          {/* Mode toggle */}
          <p className="text-center text-sm text-land-muted">
            {mode === "signup" ? "Already have an account? " : "New to Forge? "}
            <button
              type="button"
              onClick={() =>
                setMode((m) => (m === "signup" ? "signin" : "signup"))
              }
              className="text-land-accent hover:opacity-80 transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-land-accent rounded"
            >
              {mode === "signup" ? "Sign in" : "Create one"}
            </button>
          </p>
        </main>
      </div>
    </div>
  );
}
