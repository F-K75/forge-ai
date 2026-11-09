import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  User,
  ShieldCheck,
  Terminal,
  Layers,
  Sparkles,
  Zap,
  Code2,
  Check,
} from "lucide-react";
import { useAuthStore, API_URL } from "../store/authStore";
import { validateNewPassword } from "../lib/passwordPolicy";
import BrandLogo from "../components/BrandLogo";
import { ThemeToggle } from "../components/ThemeToggle";

const easeOut = [0.16, 1, 0.3, 1] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateName(value: string): string | undefined {
  if (!value || !value.trim()) return "Please enter your full name.";
  if (value.trim().length < 2) return "Name must be at least 2 characters.";
  return undefined;
}

function validateEmail(value: string): string | undefined {
  if (!value || !value.trim()) return "Please enter your email.";
  if (!EMAIL_RE.test(value.trim())) return "Please enter a valid email address.";
  return undefined;
}

function validateConfirmPassword(value: string, passwordValue: string): string | undefined {
  if (!value) return "Please confirm your password.";
  if (value !== passwordValue) return "The passwords you entered don't match.";
  return undefined;
}

type Field = "name" | "email" | "password" | "confirmPassword";
type Errors = Partial<Record<Field | "form", string>>;

function GoogleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

const AGENT_PIPELINE = [
  {
    code: "ARCH-01",
    role: "System Architect",
    action: "PostgreSQL schemas & API boundaries validated",
    badge: "100% Typed",
    badgeColor: "bg-brutal-yellow text-black",
    icon: Layers,
  },
  {
    code: "DES-02",
    role: "Design Engineer",
    action: "Design tokens & brutal components compiled",
    badge: "WCAG AA",
    badgeColor: "bg-brutal-pink text-black",
    icon: Code2,
  },
  {
    code: "DEV-03",
    role: "Full-Stack Engineer",
    action: "Fastify endpoints & state stores generated",
    badge: "0 Lint Errors",
    badgeColor: "bg-brutal-cyan text-black",
    icon: Terminal,
  },
  {
    code: "PM-06",
    role: "Quality & Security Lead",
    action: "Zero high CVEs • Automated debug loop passed",
    badge: "Score: 99/100",
    badgeColor: "bg-brutal-green text-black",
    icon: ShieldCheck,
  },
];

export default function Signup() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [capsLockActive, setCapsLockActive] = useState(false);

  const signupShake = useAnimationControls();

  useEffect(() => {
    if (errors.form) {
      signupShake.start({
        x: [0, -8, 8, -6, 6, 0],
        transition: { duration: 0.35, ease: easeOut },
      });
    }
  }, [errors.form, signupShake]);

  const handleKeyModifier = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState("CapsLock"));
    }
  };

  const handleQuickDemoFill = () => {
    setName("Alex Rivera");
    setEmail("alex.rivera@forge.ai");
    setPassword("ForgeDeveloper2026!");
    setConfirmPassword("ForgeDeveloper2026!");
    setErrors({});
  };

  const validateField = (field: Field, value: string) => {
    let error: string | undefined;
    if (field === "name") error = validateName(value);
    if (field === "email") error = validateEmail(value);
    if (field === "password") error = validateNewPassword(value);
    if (field === "confirmPassword") error = validateConfirmPassword(value, password);
    setErrors((prev) => ({ ...prev, [field]: error }));
    return error;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirmPassword: true });

    const nameError = validateName(name);
    const emailError = validateEmail(email);
    const passwordError = validateNewPassword(password);
    const confirmPasswordError = validateConfirmPassword(confirmPassword, password);

    if (nameError || emailError || passwordError || confirmPasswordError) {
      setErrors({
        name: nameError,
        email: emailError,
        password: passwordError,
        confirmPassword: confirmPasswordError,
      });
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      await register(email.trim(), name.trim(), password);
      setSubmittedEmail(email.trim());
    } catch (err: any) {
      setErrors({
        form:
          err?.response?.data?.detail ||
          "We could not initialize your workspace account. Please try again or use Google SSO.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Password policy checks
  const policyLength = password.length >= 12;
  const policyUpper = /[A-Z]/.test(password);
  const policyLower = /[a-z]/.test(password);
  const policyNumber = /[0-9]/.test(password);
  const policySpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const passedChecksCount = [
    policyLength,
    policyUpper,
    policyLower,
    policyNumber,
    policySpecial,
  ].filter(Boolean).length;

  const passwordStrength =
    password.length === 0
      ? 0
      : passedChecksCount <= 2
      ? 1
      : passedChecksCount <= 4
      ? 2
      : 3;

  const strengthLabels = ["EMPTY", "FAIR", "GOOD", "STRONG"];

  const nameErrorId = errors.name ? "signup-name-error" : undefined;
  const emailErrorId = errors.email ? "signup-email-error" : undefined;
  const passwordErrorId = errors.password ? "signup-password-error" : undefined;
  const confirmPasswordErrorId = errors.confirmPassword
    ? "signup-confirm-error"
    : undefined;
  const formErrorId = errors.form ? "signup-form-error" : undefined;

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#101014] text-black dark:text-[#F5F5F7] flex flex-col selection:bg-brutal-yellow selection:text-black font-sans relative overflow-x-hidden">
      {/* Background Dot Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#000000_1px,transparent_1px)] dark:bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none" />

      {/* ─── Neo-Brutalist Top Header ───────────────────────────────────────── */}
      <header
        id="signup-header"
        className="w-full border-b-3 border-black dark:border-white/80 bg-[#FAF8F5] dark:bg-[#18181C] shadow-[0_4px_0_#000] dark:shadow-[0_4px_0_#fff] sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between font-mono text-xs font-black">
          <Link
            id="signup-brand-logo"
            to="/home"
            className="flex items-center gap-2.5 border-2 border-black dark:border-white/80 bg-white dark:bg-[#252530] px-3 py-1.5 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] hover:bg-brutal-yellow hover:text-black transition active:translate-x-[1px] active:translate-y-[1px]"
          >
            <BrandLogo size="xs" />
            <span className="tracking-wider uppercase text-ink">FORGE AI</span>
            <span className="px-1.5 py-0.2 bg-brutal-yellow text-black border border-black text-[10px]">
              v2.4
            </span>
          </Link>

          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              to="/home"
              className="hidden md:inline-flex px-3 py-1.5 border-2 border-black dark:border-white/80 bg-white dark:bg-[#252530] text-ink uppercase tracking-wider shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] hover:bg-brutal-yellow hover:text-black transition"
            >
              HOME
            </Link>
            <Link
              to="/launch"
              className="hidden md:inline-flex px-3 py-1.5 border-2 border-black dark:border-white/80 bg-white dark:bg-[#252530] text-ink uppercase tracking-wider shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] hover:bg-brutal-yellow hover:text-black transition"
            >
              LAUNCHPAD
            </Link>

            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 border-2 border-black dark:border-white/80 bg-white dark:bg-[#252530] shadow-[2px_2px_0px_#000] text-[11px]">
              <span className="w-2 h-2 rounded-none bg-brutal-green border border-black animate-pulse" />
              <span className="uppercase text-muted">PORT: 3000 [ONLINE]</span>
            </div>

            <ThemeToggle compact />

            <div className="h-5 w-[2px] bg-black dark:bg-white/40 hidden sm:block" aria-hidden="true" />

            <div className="text-xs">
              <span className="hidden sm:inline text-muted">ALREADY HAVE AN ACCOUNT? </span>
              <Link
                id="signup-nav-login-link"
                to="/login"
                className="inline-flex items-center gap-1 px-3 py-1.5 border-2 border-black bg-brutal-yellow text-black font-black uppercase shadow-[2px_2px_0px_#000] hover:bg-[#FFE066] transition active:translate-x-[1px] active:translate-y-[1px]"
              >
                <span>SIGN IN</span>
                <ArrowRight size={12} strokeWidth={3} />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Main Content Container ─────────────────────────────────────────── */}
      <main
        id="signup-main-container"
        className="flex-1 max-w-7xl w-full mx-auto grid lg:grid-cols-12 min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8 gap-8 items-center relative z-10"
      >
        {/* Left Column: Neo-Brutalist Registration Window */}
        <section className="lg:col-span-6 xl:col-span-5 flex justify-center w-full">
          <div
            id="signup-form-card"
            className="w-full max-w-lg border-3 border-black dark:border-white/80 bg-white dark:bg-[#18181C] shadow-[8px_8px_0px_#000] dark:shadow-[8px_8px_0px_#fff] overflow-hidden"
          >
            {/* Terminal Window Header Bar */}
            <div className="h-10 bg-[#EFECE6] dark:bg-[#252530] border-b-3 border-black dark:border-white/80 px-4 flex items-center justify-between font-mono text-xs font-black">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 border border-black bg-red-400" />
                  <div className="w-3 h-3 border border-black bg-yellow-400" />
                  <div className="w-3 h-3 border border-black bg-green-400" />
                </div>
                <span className="tracking-wider uppercase text-ink">
                  {submittedEmail ? "VERIFICATION.SH // INBOX" : "SIGNUP_GATEWAY.SH // INITIALIZE"}
                </span>
              </div>
              <span className="px-2 py-0.5 border border-black bg-brutal-green text-black text-[10px] uppercase font-black">
                {submittedEmail ? "PENDING_VERIFY" : "NEW_BUILDER"}
              </span>
            </div>

            {/* Inner Content Area */}
            <div className="p-6 sm:p-8">
              {submittedEmail ? (
                /* Verification Confirmation State */
                <div id="signup-verification-state" className="space-y-6 font-mono text-ink">
                  <div className="inline-flex items-center gap-2 border-2 border-black bg-brutal-green text-black px-2.5 py-1 font-mono font-black text-xs uppercase shadow-[2px_2px_0px_#000]">
                    <CheckCircle2 size={14} strokeWidth={2.5} />
                    <span>ACCOUNT INITIALIZED</span>
                  </div>

                  <h1
                    id="signup-verify-heading"
                    className="text-2xl sm:text-3xl font-mono font-black uppercase tracking-tight text-ink"
                  >
                    CHECK YOUR INBOX
                  </h1>

                  <div className="p-4 border-2 border-black dark:border-white/80 bg-[#FAF8F5] dark:bg-[#202028] shadow-[3px_3px_0px_#000] space-y-2 text-xs">
                    <p className="text-muted leading-relaxed">
                      We have dispatched a verification link to your work inbox:
                    </p>
                    <div className="p-2 border-2 border-black bg-brutal-cyan text-black font-black text-sm break-all">
                      {submittedEmail}
                    </div>
                    <p className="text-muted text-[11px] pt-1">
                      Click the link to verify your email. Your autonomous workspace is ready to deploy.
                    </p>
                  </div>

                  <button
                    id="signup-continue-workspace-btn"
                    type="button"
                    onClick={() => navigate("/projects", { replace: true })}
                    className="w-full h-14 border-3 border-black bg-brutal-yellow text-black font-mono font-black text-sm uppercase shadow-[5px_5px_0px_#000] hover:bg-brutal-cyan active:translate-x-[2px] active:translate-y-[2px] transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>CONTINUE TO WORKSPACE</span>
                    <ArrowRight size={16} strokeWidth={2.5} />
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setSubmittedEmail(null)}
                      className="text-xs font-mono font-bold text-muted hover:text-ink uppercase underline underline-offset-4 cursor-pointer"
                    >
                      Use a different email address
                    </button>
                  </div>
                </div>
              ) : (
                /* Registration Form */
                <>
                  {/* Top Banner Tag */}
                  <div className="inline-flex items-center gap-2 border-2 border-black bg-brutal-cyan text-black px-2.5 py-1 font-mono font-black text-xs uppercase shadow-[2px_2px_0px_#000] mb-4">
                    <Sparkles size={14} strokeWidth={2.5} />
                    <span>DEVELOPER ONBOARDING</span>
                  </div>

                  <h1
                    id="signup-heading"
                    className="text-2xl sm:text-3xl font-mono font-black uppercase tracking-tight text-ink mb-2"
                  >
                    CREATE ACCOUNT
                  </h1>
                  <p className="text-xs sm:text-sm font-mono text-muted mb-6 leading-relaxed">
                    Initialize your developer credentials to deploy autonomous agent swarms and full-stack software.
                  </p>

                  {/* Quick Demo Autofill Pill */}
                  <div className="mb-6 p-3 border-2 border-black dark:border-white/80 bg-[#FAF8F5] dark:bg-[#202028] shadow-[3px_3px_0px_#000] flex items-center justify-between gap-3 font-mono text-xs">
                    <div className="flex items-center gap-2 text-ink font-bold">
                      <Sparkles size={15} className="text-amber-500 shrink-0" />
                      <span>Testing signup?</span>
                    </div>
                    <button
                      id="signup-demo-fill-btn"
                      type="button"
                      onClick={handleQuickDemoFill}
                      className="px-2.5 py-1 border-2 border-black bg-brutal-yellow text-black font-black uppercase text-[11px] shadow-[2px_2px_0px_#000] hover:bg-[#2DD4BF] active:translate-x-[1px] active:translate-y-[1px] transition cursor-pointer"
                    >
                      AUTO-FILL TEST ACCOUNT
                    </button>
                  </div>

                  <motion.form
                    id="signup-form"
                    aria-describedby={formErrorId}
                    onSubmit={handleSubmit}
                    noValidate
                    className="space-y-4 font-mono"
                  >
                    <motion.div animate={signupShake} className="space-y-4">
                      {/* Top Level Form Error */}
                      <AnimatePresence>
                        {errors.form && (
                          <motion.div
                            id="signup-form-error"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: easeOut }}
                            role="alert"
                            aria-live="assertive"
                            className="p-3 border-2 border-black bg-red-400 text-black text-xs font-bold flex items-start gap-2 shadow-[2px_2px_0px_#000]"
                          >
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <span>{errors.form}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Full Name Input */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor="name"
                          className="block text-xs font-black uppercase tracking-wider text-ink"
                        >
                          Full name
                        </label>
                        <div className="relative">
                          <input
                            id="name"
                            type="text"
                            autoComplete="name"
                            placeholder="Ada Lovelace"
                            value={name}
                            onChange={(e) => {
                              setName(e.target.value);
                              if (touched.name) validateField("name", e.target.value);
                            }}
                            onBlur={() => {
                              setTouched((t) => ({ ...t, name: true }));
                              validateField("name", name);
                            }}
                            aria-invalid={!!errors.name}
                            aria-describedby={nameErrorId}
                            className={`w-full h-12 pl-10 pr-4 border-3 border-black dark:border-white/80 bg-white dark:bg-[#202028] text-ink font-mono text-sm shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] focus:outline-none focus:bg-amber-50/20 ${
                              errors.name ? "!border-red-500 bg-red-50 dark:bg-red-950/20" : ""
                            }`}
                          />
                          <User
                            size={16}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                            aria-hidden="true"
                          />
                        </div>
                        <AnimatePresence>
                          {errors.name && (
                            <motion.p
                              id="signup-name-error"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1 pt-0.5"
                            >
                              <AlertCircle size={13} className="shrink-0" />
                              <span>{errors.name}</span>
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Work Email Input */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor="email"
                          className="block text-xs font-black uppercase tracking-wider text-ink"
                        >
                          Email
                        </label>
                        <div className="relative">
                          <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="developer@forge.ai"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              if (touched.email) validateField("email", e.target.value);
                            }}
                            onBlur={() => {
                              setTouched((t) => ({ ...t, email: true }));
                              validateField("email", email);
                            }}
                            aria-invalid={!!errors.email}
                            aria-describedby={emailErrorId}
                            className={`w-full h-12 pl-10 pr-4 border-3 border-black dark:border-white/80 bg-white dark:bg-[#202028] text-ink font-mono text-sm shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] focus:outline-none focus:bg-amber-50/20 ${
                              errors.email ? "!border-red-500 bg-red-50 dark:bg-red-950/20" : ""
                            }`}
                          />
                          <Mail
                            size={16}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                            aria-hidden="true"
                          />
                        </div>
                        <AnimatePresence>
                          {errors.email && (
                            <motion.p
                              id="signup-email-error"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1 pt-0.5"
                            >
                              <AlertCircle size={13} className="shrink-0" />
                              <span>{errors.email}</span>
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Password Input */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="password"
                            className="block text-xs font-black uppercase tracking-wider text-ink"
                          >
                            Password
                          </label>
                          <span className="text-[10px] text-muted font-bold uppercase">
                            12+ CHARACTERS
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="••••••••••••"
                            value={password}
                            onKeyDown={handleKeyModifier}
                            onKeyUp={handleKeyModifier}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              if (touched.password) validateField("password", e.target.value);
                              if (touched.confirmPassword) {
                                setErrors((er) => ({
                                  ...er,
                                  confirmPassword: validateConfirmPassword(confirmPassword, e.target.value),
                                }));
                              }
                            }}
                            onBlur={() => {
                              setTouched((t) => ({ ...t, password: true }));
                              validateField("password", password);
                            }}
                            aria-invalid={!!errors.password}
                            aria-describedby={passwordErrorId}
                            className={`w-full h-12 pl-10 pr-10 border-3 border-black dark:border-white/80 bg-white dark:bg-[#202028] text-ink font-mono text-sm shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] focus:outline-none focus:bg-amber-50/20 ${
                              errors.password ? "!border-red-500 bg-red-50 dark:bg-red-950/20" : ""
                            }`}
                          />
                          <Lock
                            size={16}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                            aria-hidden="true"
                          />
                          <button
                            id="signup-password-visibility-toggle"
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-ink transition cursor-pointer"
                          >
                            {showPassword ? (
                              <EyeOff size={16} aria-hidden="true" />
                            ) : (
                              <Eye size={16} aria-hidden="true" />
                            )}
                          </button>
                        </div>

                        {/* Caps Lock Indicator */}
                        {capsLockActive && (
                          <div
                            id="signup-caps-lock-warning"
                            className="p-1 px-2 border border-black bg-amber-300 text-black text-[11px] font-black uppercase flex items-center gap-1.5"
                          >
                            <AlertCircle size={12} />
                            <span>CAPS LOCK IS ACTIVE</span>
                          </div>
                        )}

                        {/* Password Policy Meter & Checkmarks */}
                        {password.length > 0 && (
                          <div className="pt-2 space-y-2">
                            <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
                              {[1, 2, 3].map((step) => (
                                <div
                                  key={step}
                                  className={`h-2 border border-black transition-colors ${
                                    passwordStrength >= step
                                      ? passwordStrength === 1
                                        ? "bg-red-400"
                                        : passwordStrength === 2
                                        ? "bg-amber-400"
                                        : "bg-brutal-green"
                                      : "bg-neutral-200 dark:bg-neutral-800"
                                  }`}
                                />
                              ))}
                            </div>
                            <div className="flex justify-between text-[10px] text-muted font-mono font-bold uppercase">
                              <span>SECURITY LEVEL:</span>
                              <span className="font-black text-ink">
                                {strengthLabels[passwordStrength]}
                              </span>
                            </div>

                            {/* Compact Policy Criteria Pills */}
                            <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                              <span
                                className={`flex items-center gap-1 px-1.5 py-0.5 border ${
                                  policyLength
                                    ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold"
                                    : "border-neutral-300 dark:border-neutral-700 text-muted"
                                }`}
                              >
                                <Check size={10} strokeWidth={3} className={policyLength ? "opacity-100" : "opacity-30"} />
                                12+ chars
                              </span>
                              <span
                                className={`flex items-center gap-1 px-1.5 py-0.5 border ${
                                  policyUpper && policyLower
                                    ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold"
                                    : "border-neutral-300 dark:border-neutral-700 text-muted"
                                }`}
                              >
                                <Check size={10} strokeWidth={3} className={policyUpper && policyLower ? "opacity-100" : "opacity-30"} />
                                Upper & lower
                              </span>
                              <span
                                className={`flex items-center gap-1 px-1.5 py-0.5 border ${
                                  policyNumber
                                    ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold"
                                    : "border-neutral-300 dark:border-neutral-700 text-muted"
                                }`}
                              >
                                <Check size={10} strokeWidth={3} className={policyNumber ? "opacity-100" : "opacity-30"} />
                                Number
                              </span>
                              <span
                                className={`flex items-center gap-1 px-1.5 py-0.5 border ${
                                  policySpecial
                                    ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-bold"
                                    : "border-neutral-300 dark:border-neutral-700 text-muted"
                                }`}
                              >
                                <Check size={10} strokeWidth={3} className={policySpecial ? "opacity-100" : "opacity-30"} />
                                Special symbol
                              </span>
                            </div>
                          </div>
                        )}

                        <AnimatePresence>
                          {errors.password && (
                            <motion.p
                              id="signup-password-error"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1 pt-0.5"
                            >
                              <AlertCircle size={13} className="shrink-0" />
                              <span>{errors.password}</span>
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Confirm Password Input */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor="confirmPassword"
                          className="block text-xs font-black uppercase tracking-wider text-ink"
                        >
                          Confirm password
                        </label>
                        <div className="relative">
                          <input
                            id="confirmPassword"
                            type={showConfirmPassword ? "text" : "password"}
                            autoComplete="new-password"
                            placeholder="••••••••••••"
                            value={confirmPassword}
                            onChange={(e) => {
                              setConfirmPassword(e.target.value);
                              if (touched.confirmPassword) {
                                validateField("confirmPassword", e.target.value);
                              }
                            }}
                            onBlur={() => {
                              setTouched((t) => ({ ...t, confirmPassword: true }));
                              validateField("confirmPassword", confirmPassword);
                            }}
                            aria-invalid={!!errors.confirmPassword}
                            aria-describedby={confirmPasswordErrorId}
                            className={`w-full h-12 pl-10 pr-10 border-3 border-black dark:border-white/80 bg-white dark:bg-[#202028] text-ink font-mono text-sm shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] focus:outline-none focus:bg-amber-50/20 ${
                              errors.confirmPassword
                                ? "!border-red-500 bg-red-50 dark:bg-red-950/20"
                                : ""
                            }`}
                          />
                          <Lock
                            size={16}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                            aria-hidden="true"
                          />
                          <button
                            id="signup-confirm-password-visibility-toggle"
                            type="button"
                            onClick={() => setShowConfirmPassword((s) => !s)}
                            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-ink transition cursor-pointer"
                          >
                            {showConfirmPassword ? (
                              <EyeOff size={16} aria-hidden="true" />
                            ) : (
                              <Eye size={16} aria-hidden="true" />
                            )}
                          </button>
                        </div>
                        <AnimatePresence>
                          {errors.confirmPassword && (
                            <motion.p
                              id="signup-confirm-error"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1 pt-0.5"
                            >
                              <AlertCircle size={13} className="shrink-0" />
                              <span>{errors.confirmPassword}</span>
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Primary Submit Button */}
                      <button
                        id="signup-submit-btn"
                        type="submit"
                        disabled={loading}
                        className="w-full h-14 border-3 border-black bg-brutal-yellow text-black font-mono font-black text-sm uppercase shadow-[5px_5px_0px_#000] hover:bg-brutal-cyan active:translate-x-[2px] active:translate-y-[2px] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                            <span>CREATING ACCOUNT…</span>
                          </>
                        ) : (
                          <>
                            <span>CREATE WORKSPACE ACCOUNT</span>
                            <ArrowRight size={16} strokeWidth={2.5} />
                          </>
                        )}
                      </button>

                      {/* Or Divider */}
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t-2 border-black dark:border-white/40" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="px-3 bg-white dark:bg-[#18181C] text-muted font-black uppercase text-[10px]">
                            OR CONTINUE WITH
                          </span>
                        </div>
                      </div>

                      {/* Google Single Sign-On Button */}
                      <button
                        id="signup-google-btn"
                        type="button"
                        onClick={() => {
                          window.location.href = `${API_URL}/v1/auth/google`;
                        }}
                        className="w-full h-12 border-3 border-black dark:border-white/80 bg-white dark:bg-[#202028] text-ink font-mono font-black text-xs uppercase shadow-[4px_4px_0px_#000] dark:shadow-[4px_4px_0px_#fff] hover:bg-neutral-100 dark:hover:bg-[#2F2F3D] active:translate-x-[2px] active:translate-y-[2px] transition flex items-center justify-center gap-3 cursor-pointer"
                      >
                        <GoogleIcon className="w-4 h-4" />
                        <span>GOOGLE SINGLE SIGN-ON</span>
                      </button>

                      {/* Compliance Footer */}
                      <p className="pt-2 text-center text-[11px] text-muted leading-relaxed font-bold">
                        By creating an account, you agree to Forge&apos;s{" "}
                        <Link to="/home" className="text-ink underline underline-offset-2 hover:text-amber-500">
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link to="/home" className="text-ink underline underline-offset-2 hover:text-amber-500">
                          Privacy Policy
                        </Link>
                        .
                      </p>
                    </motion.div>
                  </motion.form>
                </>
              )}
            </div>

            {/* Window Footer Status Strip */}
            <div className="h-8 bg-[#FAF8F5] dark:bg-[#121216] border-t-2 border-black dark:border-white/80 px-4 flex items-center justify-between text-[11px] font-mono text-muted font-bold">
              <span>INIT PROTOCOL: SECURE</span>
              <span className="text-ink font-black">FLEET GATEWAY v2.4</span>
            </div>
          </div>
        </section>

        {/* Right Column: Architectural Showcase & System Telemetry (Same as Sign In) */}
        <aside
          id="signup-showcase-panel"
          className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between p-6 xl:p-8 border-3 border-black dark:border-white/80 bg-white dark:bg-[#18181C] shadow-[8px_8px_0px_#000] dark:shadow-[8px_8px_0px_#fff] relative overflow-hidden h-full min-h-[600px]"
        >
          {/* Top Panel Window Bar */}
          <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b-2 border-black dark:border-white/80 font-mono text-xs font-black">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 border-2 border-black bg-brutal-pink text-black uppercase shadow-[2px_2px_0px_#000]">
                <Zap size={14} strokeWidth={2.5} />
                <span>AUTONOMOUS ENGINE DISPATCH</span>
              </div>
              <span className="text-muted uppercase">FLEET: SYNCHRONIZED</span>
            </div>

            <div>
              <h2 className="text-2xl xl:text-3xl font-mono font-black uppercase tracking-tight text-ink leading-tight mb-3">
                AN AUTONOMOUS FLEET BUILT TO DRAFT, COMPILE, AND SHIP.
              </h2>
              <p className="text-xs sm:text-sm font-mono text-muted leading-relaxed">
                Forge synchronizes 6 specialized AI engineering agents across architecture schemas,
                full-stack code streaming, self-correcting debug loops, and Docker containerization.
              </p>
            </div>

            {/* Live Agent Pipeline Dossier Strips */}
            <div id="signup-showcase-pipeline" className="space-y-2.5 font-mono">
              <div className="text-xs font-black uppercase text-muted flex items-center justify-between">
                <span>ACTIVE SPECIALIST AGENTS</span>
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-bold">
                  <CheckCircle2 size={13} strokeWidth={2.5} /> DETERMINISTIC
                </span>
              </div>

              {AGENT_PIPELINE.map((agent) => {
                const IconComponent = agent.icon;
                return (
                  <div
                    key={agent.code}
                    className="p-3 border-2 border-black dark:border-white/80 bg-[#FAF8F5] dark:bg-[#202028] shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 border-2 border-black bg-white dark:bg-[#18181C] flex items-center justify-center text-ink shrink-0 shadow-[1px_1px_0px_#000]">
                        <IconComponent size={16} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-ink uppercase">
                            {agent.role}
                          </span>
                          <span className="text-[10px] text-muted font-bold">
                            [{agent.code}]
                          </span>
                        </div>
                        <p className="text-[11px] text-muted truncate">{agent.action}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 border border-black font-black text-[10px] uppercase shrink-0 shadow-[1px_1px_0px_#000] ${agent.badgeColor}`}
                    >
                      {agent.badge}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Simulated Live Terminal Stream */}
            <div
              id="signup-showcase-terminal"
              className="border-2 border-black dark:border-white/80 bg-neutral-900 text-neutral-100 p-3.5 font-mono text-xs shadow-[3px_3px_0px_#000]"
            >
              <div className="flex items-center justify-between border-b border-neutral-700 pb-2 mb-2 text-[11px] text-neutral-400">
                <div className="flex items-center gap-2">
                  <span className="text-brutal-green font-bold">●</span>
                  <span className="text-white font-bold">forge-orchestrator.log</span>
                </div>
                <span className="text-brutal-yellow font-black">STREAM ACTIVE</span>
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="text-brutal-green font-bold">✓</span>
                  <span className="text-brutal-yellow font-bold">[ARCH-01]</span>
                  <span className="text-neutral-300">Prisma schema synthesized with 0 circular dependencies</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-brutal-green font-bold">✓</span>
                  <span className="text-brutal-cyan font-bold">[DEV-03]</span>
                  <span className="text-neutral-300">Fastify backend routes & PostgreSQL queries compiled</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-brutal-green font-bold">✓</span>
                  <span className="text-brutal-pink font-bold">[QA-06]</span>
                  <span className="text-neutral-300">Automated Playwright test suite passed: 100% green</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Telemetry Metrics Bar */}
          <div
            id="signup-showcase-stats"
            className="pt-6 mt-6 border-t-3 border-black dark:border-white/80 grid grid-cols-3 gap-3 font-mono"
          >
            <div className="p-3 border-2 border-black dark:border-white/80 bg-white dark:bg-[#202028] shadow-[3px_3px_0px_#000]">
              <div className="text-xl xl:text-2xl font-black text-ink">4.8x</div>
              <div className="text-[10px] text-muted font-black uppercase mt-0.5">
                FASTER DEPLOY
              </div>
            </div>

            <div className="p-3 border-2 border-black dark:border-white/80 bg-white dark:bg-[#202028] shadow-[3px_3px_0px_#000]">
              <div className="text-xl xl:text-2xl font-black text-ink">100%</div>
              <div className="text-[10px] text-muted font-black uppercase mt-0.5">
                TYPE SAFE
              </div>
            </div>

            <div className="p-3 border-2 border-black dark:border-white/80 bg-white dark:bg-[#202028] shadow-[3px_3px_0px_#000]">
              <div className="text-xl xl:text-2xl font-black text-ink flex items-center gap-1">
                <span>0</span>
                <span className="text-xs px-1 bg-brutal-green text-black border border-black">GIT</span>
              </div>
              <div className="text-[10px] text-muted font-black uppercase mt-0.5">
                VENDOR LOCK-IN
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
