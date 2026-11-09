import React, { useEffect, useState } from "react";
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
  ShieldCheck,
  Terminal,
  Layers,
  Sparkles,
  Zap,
  Code2,
  Volume2,
  VolumeX,
  X,
  ExternalLink,
  Cpu,
  FolderGit2,
  ChevronRight,
  UserPlus,
} from "lucide-react";
import { useAuthStore, API_URL } from "../store/authStore";
import BrandLogo from "../components/BrandLogo";
import { ThemeToggle } from "../components/ThemeToggle";
import { ForgeSwarmVisual } from "../components/CyberpunkVehicleVisual";

const easeOut = [0.16, 1, 0.3, 1] as const;

// Audio telemetry sound generator via Web Audio API (safe, zero external dependencies)
class CyberAudioSynth {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  playClick(pitch = 880) {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(pitch * 1.8, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.045);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // Audio fallback
    }
  }

  playSwitch() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch {
      // Audio fallback
    }
  }
}

const synth = new CyberAudioSynth();

/**
 * Standardized industrial corner bracket lines across cards and HUD modules
 */
function CornerLines({
  color = "border-black/70 dark:border-white/50",
  size = "w-2.5 h-2.5",
  inset = "p-0",
}: {
  color?: string;
  size?: string;
  inset?: string;
}) {
  return (
    <div className={`absolute inset-0 pointer-events-none ${inset}`} aria-hidden="true">
      <span className={`absolute top-0 left-0 ${size} ${color} border-t-2 border-l-2`} />
      <span className={`absolute top-0 right-0 ${size} ${color} border-t-2 border-r-2`} />
      <span className={`absolute bottom-0 left-0 ${size} ${color} border-b-2 border-l-2`} />
      <span className={`absolute bottom-0 right-0 ${size} ${color} border-b-2 border-r-2`} />
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | undefined {
  if (!value) return "Please enter your email.";
  if (!EMAIL_RE.test(value)) return "Please enter a valid email address.";
  return undefined;
}

function validatePassword(value: string): string | undefined {
  if (!value) return "Please enter your password.";
  return undefined;
}

type Errors = Partial<Record<"email" | "password" | "form", string>>;

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
    action: "Schemas & API boundaries verified",
    badge: "100% TYPED",
    badgeColor: "bg-[#FF5522] text-black",
    icon: Layers,
  },
  {
    code: "DES-02",
    role: "Design Engineer",
    action: "Tokens & layout contracts synced",
    badge: "WCAG AA",
    badgeColor: "bg-white text-black dark:bg-white/80",
    icon: Code2,
  },
  {
    code: "DEV-03",
    role: "Full-Stack Engineer",
    action: "Routes & state pipelines deployed",
    badge: "0 LINT",
    badgeColor: "bg-[#00F59B] text-black",
    icon: Terminal,
  },
  {
    code: "QA-06",
    role: "Security & QA Lead",
    action: "0 CVEs • Verification loop green",
    badge: "SCORE: 99",
    badgeColor: "bg-[#FF5522] text-black",
    icon: ShieldCheck,
  },
];

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const BARS_BUILDS = [40, 65, 55, 80, 95, 70, 85];

export default function AuthPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const verifyMfa = useAuthStore((s) => s.verifyMfa);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [capsLockActive, setCapsLockActive] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pipelineLoads, setPipelineLoads] = useState([88, 94, 76, 92]);

  // Inline MFA challenge state
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | undefined>();

  const loginShake = useAnimationControls();
  const mfaShake = useAnimationControls();

  const handleSound = (type: "click" | "switch" = "click") => {
    if (!soundEnabled) return;
    if (type === "switch") {
      synth.playSwitch();
    } else {
      synth.playClick();
    }
  };

  useEffect(() => {
    if (errors.form) {
      loginShake.start({
        x: [0, -8, 8, -6, 6, 0],
        transition: { duration: 0.35, ease: easeOut },
      });
    }
  }, [errors.form, loginShake]);

  useEffect(() => {
    if (mfaError) {
      mfaShake.start({
        x: [0, -8, 8, -6, 6, 0],
        transition: { duration: 0.35, ease: easeOut },
      });
    }
  }, [mfaError, mfaShake]);

  const handleKeyModifier = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLockActive(e.getModifierState("CapsLock"));
    }
  };

  const handleQuickDemoFill = () => {
    handleSound("switch");
    setEmail("demo@forge.ai");
    setPassword("DemoPass123!");
    setErrors({});
  };

  const handleChannelClick = (idx: number) => {
    handleSound("click");
    setPipelineLoads((prev) => {
      const next = [...prev];
      next[idx] = Math.floor(Math.random() * 30) + 70;
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    handleSound("click");
    setTouched({ email: true, password: true });

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result && "mfaRequired" in result) {
        setMfaToken(result.mfaToken);
        return;
      }
      navigate("/projects", { replace: true });
    } catch (err: any) {
      setErrors({
        form:
          err?.response?.data?.detail ||
          "The email or password you entered is incorrect. Please try again or reset your password.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    handleSound("click");
    if (!mfaToken) return;
    setMfaError(undefined);
    setLoading(true);
    try {
      await verifyMfa(mfaToken, mfaCode.trim());
      navigate("/projects", { replace: true });
    } catch (err: any) {
      setMfaError(
        err?.response?.data?.detail || "The code you entered is invalid. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength =
    password.length === 0
      ? 0
      : password.length < 8
      ? 1
      : /[A-Z]/.test(password) && /[0-9]/.test(password)
      ? 3
      : 2;

  const strengthLabels = ["EMPTY", "FAIR", "GOOD", "STRONG"];

  const emailErrorId = errors.email ? "email-error" : undefined;
  const passwordErrorId = errors.password ? "password-error" : undefined;
  const formErrorId = errors.form ? "form-error" : undefined;
  const mfaErrorId = mfaError ? "mfa-error" : undefined;

  return (
    <div className="min-h-screen bg-[#D4D7CF] dark:bg-[#0F1115] text-[#0A0C0E] dark:text-[#E6EDF3] flex flex-col justify-between selection:bg-[#FF5522] selection:text-white transition-colors font-sans antialiased overflow-x-hidden">
      {/* ========================================================================= */}
      {/* 1. TOP NAVIGATION BAR (FORGE PLATFORM & TOOLS - MATCHING LAUNCH PAGE)     */}
      {/* ========================================================================= */}
      <header className="w-full border-b border-black/80 dark:border-white/20 bg-[#D4D7CF] dark:bg-[#0F1115] z-30">
        <div className="max-w-[1720px] mx-auto flex items-stretch justify-between h-14 sm:h-16">
          {/* Left: Brand Identity with Official Forge Logo */}
          <div className="flex items-stretch">
            <Link
              to="/home"
              onClick={() => handleSound()}
              className="flex items-center gap-3 px-3.5 sm:px-5 border-r border-black/80 dark:border-white/20 bg-white/50 dark:bg-black/40 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors group text-left"
              title="FORGE AI - Autonomous Software Runtime"
            >
              <BrandLogo size="sm" animated />
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-xs sm:text-sm tracking-wider uppercase leading-none">
                    FORGE AI
                  </span>
                  <span className="px-1.5 py-0.5 bg-[#FF5522] text-black font-mono font-black text-[9px] uppercase border border-black/80 dark:border-white/40 leading-none">
                    AUTH GATEWAY
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 bg-[#00F59B] rounded-none animate-pulse" />
                  <span className="font-mono text-[9px] sm:text-[10px] font-bold tracking-widest text-black/70 dark:text-white/70 group-hover:text-white dark:group-hover:text-black uppercase leading-none">
                    CLUSTER // V2.4
                  </span>
                </div>
              </div>
            </Link>
          </div>

          {/* Center-Right: Segmented Website Navigation Links */}
          <div className="hidden lg:flex items-stretch divide-x divide-black/80 dark:divide-white/20 font-mono text-xs font-black uppercase tracking-wider">
            <button
              type="button"
              onClick={() => {
                handleSound();
                navigate("/projects");
              }}
              className="px-5 xl:px-6 flex items-center justify-center hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors cursor-pointer"
            >
              PROJECTS
            </button>
            <button
              type="button"
              onClick={() => {
                handleSound();
                navigate("/initiatives");
              }}
              className="px-5 xl:px-6 flex items-center justify-center hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors cursor-pointer"
            >
              INITIATIVES
            </button>
            <button
              type="button"
              onClick={() => {
                handleSound();
                navigate("/build/demo-project");
              }}
              className="px-5 xl:px-6 flex items-center justify-center hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors text-[#FF5522] cursor-pointer"
            >
              WORKSPACE
            </button>
            <button
              type="button"
              onClick={() => {
                handleSound();
                navigate("/marketplace");
              }}
              className="px-5 xl:px-6 flex items-center justify-center hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors cursor-pointer"
            >
              MARKETPLACE
            </button>
            <button
              type="button"
              onClick={() => {
                handleSound();
                navigate("/launch");
              }}
              className="px-5 xl:px-6 flex items-center justify-center hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors cursor-pointer"
            >
              LAUNCHPAD
            </button>
          </div>

          {/* Far Right: Tools, Signup Link & System Drawer Toggle */}
          <div className="flex items-stretch border-l border-black/80 dark:border-white/20">
            {/* Direct Link to Register / Signup */}
            <button
              type="button"
              onClick={() => {
                handleSound();
                navigate("/signup");
              }}
              className="flex items-center gap-2 px-3 sm:px-4 font-mono font-black text-xs uppercase tracking-wider border-r border-black/80 dark:border-white/20 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition cursor-pointer"
              title="Create a new Forge account"
            >
              <UserPlus size={13} strokeWidth={2.5} />
              <span className="hidden sm:inline">CREATE ACCOUNT</span>
              <span className="sm:hidden">SIGN UP</span>
            </button>

            {/* Audio Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) synth.playClick();
              }}
              className="px-3 sm:px-4 flex items-center justify-center border-r border-black/80 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/5 transition text-black dark:text-white cursor-pointer"
              title={soundEnabled ? "Mute Cyber Audio Telemetry" : "Unmute Cyber Audio Telemetry"}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {/* Light / Dark Mode Toggle */}
            <div className="flex items-center px-3 border-r border-black/80 dark:border-white/20">
              <ThemeToggle compact />
            </div>

            {/* Minimalist Black Box Hamburger / Close Drawer Button */}
            <button
              type="button"
              onClick={() => {
                handleSound();
                setMenuOpen((prev) => !prev);
              }}
              className={`w-14 sm:w-16 flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                menuOpen
                  ? "bg-[#FF5522] text-black"
                  : "bg-black text-white hover:bg-[#FF5522] hover:text-black"
              }`}
              title={menuOpen ? "Close System Control Drawer" : "Toggle System Control Drawer"}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? (
                <X size={20} strokeWidth={2.5} />
              ) : (
                <>
                  <span className="w-5 h-0.5 bg-current" />
                  <span className="w-5 h-0.5 bg-current" />
                  <span className="w-5 h-0.5 bg-current" />
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. SUB-HEADER TECHNICAL HUD TELEMETRY LAYER                               */}
      {/* ========================================================================= */}
      <section className="w-full max-w-[1720px] mx-auto px-4 sm:px-8 py-3 sm:py-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 items-center">
          {/* Left: Industrial Spec Label Badge for Forge System */}
          <div className="md:col-span-3 flex items-center">
            <div className="relative w-full max-w-xs border border-black/80 dark:border-white/30 bg-white/30 dark:bg-black/30 p-2.5 font-mono">
              <CornerLines color="border-black/50 dark:border-white/40" size="w-1.5 h-1.5" />
              <div className="flex items-center justify-between text-[11px] font-black text-black dark:text-white border-b border-black/40 dark:border-white/20 pb-1 mb-1">
                <span>Cluster region</span>
                <span className="font-bold text-[#FF5522]">US-EAST</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-xs font-black tracking-wider text-black dark:text-white">
                  Security Gateway
                </span>
                <div className="border border-black/60 dark:border-white/40 px-1.5 py-0.5 text-[9px] font-bold text-[#FF5522]">
                  802.1X // TLS 1.3
                </div>
              </div>
              {/* Barcode Graphic */}
              <div className="pt-1.5 border-t border-black/40 dark:border-white/20 flex items-center justify-between">
                <div className="flex items-center gap-0.5 h-5" aria-hidden="true">
                  {[2, 4, 1, 3, 5, 2, 1, 4, 2, 3, 1, 4, 3, 2, 5, 1, 3].map((w, i) => (
                    <span
                      key={i}
                      style={{ width: `${w * 1.4}px` }}
                      className="h-full bg-black dark:bg-white inline-block"
                    />
                  ))}
                </div>
                <span className="text-[10px] font-mono font-bold tracking-widest text-black dark:text-white">
                  SEC-89D7
                </span>
              </div>
            </div>
          </div>

          {/* Center: Monolithic Brand Display Title */}
          <div className="md:col-span-5 flex items-center justify-center gap-3">
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tighter text-black dark:text-white leading-none select-none uppercase">
              ACCESS
            </h1>
            <div className="flex flex-col justify-center">
              <span
                className="font-mono text-[9px] sm:text-[10px] font-black tracking-widest uppercase text-black dark:text-white select-none whitespace-nowrap"
                style={{
                  writingMode: "vertical-lr",
                  transform: "rotate(180deg)",
                }}
              >
                AUTONOMOUS SYSTEM GATEWAY
              </span>
            </div>
          </div>

          {/* Right: Swarm Pipeline Load Equalizer & Spec Status */}
          <div className="md:col-span-4 flex items-center justify-end gap-3 font-mono">
            {/* Pipeline Equalizer */}
            <div className="relative border border-black/80 dark:border-white/30 bg-white/30 dark:bg-black/30 p-2 sm:p-2.5">
              <CornerLines color="border-black/50 dark:border-white/40" size="w-1.5 h-1.5" />
              <div className="flex items-end gap-1.5 h-10 mb-1 px-1">
                {pipelineLoads.map((val, idx) => {
                  const channelLabels = [
                    "Architecture",
                    "Engineering",
                    "Testing & QA",
                    "Deployment & Ops",
                  ];
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleChannelClick(idx)}
                      className="w-3.5 bg-black/20 dark:bg-white/20 h-full flex items-end justify-center hover:opacity-80 transition cursor-pointer"
                      title={`${channelLabels[idx] || "Channel"}: ${val}% capacity`}
                      aria-label={`${channelLabels[idx] || "Channel"}: ${val}% capacity`}
                    >
                      <span
                        style={{ height: `${val}%` }}
                        className={`w-full ${idx === 0 ? "bg-[#FF5522]" : "bg-black dark:bg-white"} transition-all duration-300`}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[9px] font-black tracking-wider text-black dark:text-white border-t border-black/40 dark:border-white/20 pt-1">
                <span title="Architecture specialist">ARC</span>
                <span title="Engineering specialist">DEV</span>
                <span title="Quality assurance & test suite">QA</span>
                <span title="DevOps and continuous deployment">OPS</span>
              </div>
            </div>

            {/* Gateway Status Box */}
            <div className="relative border border-black/80 dark:border-white/30 bg-white/30 dark:bg-black/30 p-2 sm:p-2.5 min-w-[170px] text-xs">
              <CornerLines color="border-black/50 dark:border-white/40" size="w-1.5 h-1.5" />
              <div className="flex items-center justify-between text-[10px] font-black border-b border-black/40 dark:border-white/20 pb-1 mb-1 text-black dark:text-white">
                <span>Cluster FG-9000</span>
                <span
                  className="w-2 h-2 rounded-full bg-[#00F59B] animate-pulse"
                  title="Gateway online"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-black/70 dark:text-white/70">Session lock</span>
                  <span className="font-black text-black dark:text-white border border-black/40 dark:border-white/30 px-1 py-0.5">
                    AES-256-GCM
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-black/70 dark:text-white/70">Cluster node</span>
                  <span className="font-black text-black dark:text-white border border-black/40 dark:border-white/30 px-1 py-0.5">
                    node-01.east
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. MAIN SHOWCASE STAGE: SPLIT BENTO GRID (LOGIN CARD & SWARM DOSSIER)     */}
      {/* ========================================================================= */}
      <main className="w-full max-w-[1720px] mx-auto px-4 sm:px-8 flex-1 flex flex-col justify-center my-3">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch min-h-[580px]">
          {/* =================== LEFT CARD 001: AUTHENTICATION TERMINAL =================== */}
          <div className="lg:col-span-6 xl:col-span-6 relative border-2 border-black dark:border-white/30 bg-white/70 dark:bg-[#161920]/90 backdrop-blur-md p-6 sm:p-8 flex flex-col justify-between overflow-hidden">
            <CornerLines color="border-black dark:border-white/70" size="w-3.5 h-3.5" />

            {/* Giant Rotated Vertical Number 001 on Right Edge */}
            <div
              className="absolute right-4 top-1/2 -translate-y-1/2 font-mono font-black text-6xl sm:text-7xl md:text-8xl tracking-tighter text-black/10 dark:text-white/10 select-none pointer-events-none z-0"
              aria-hidden="true"
            >
              <span
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                }}
              >
                001
              </span>
            </div>

            {/* Terminal Header Bar */}
            <div className="relative z-10 flex items-center justify-between border-b border-black/20 dark:border-white/20 pb-3 mb-5 font-mono text-xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  <span className="w-2.5 h-2.5 bg-black dark:bg-white rounded-none inline-block" />
                  <span className="w-2.5 h-2.5 bg-[#FF5522] rounded-none inline-block" />
                  <span className="w-2.5 h-2.5 bg-[#00F59B] rounded-none inline-block" />
                </div>
                <span className="font-mono font-black text-xs uppercase tracking-wider text-black dark:text-white">
                  GATEWAY_LOGIN.SYS // AUTH
                </span>
              </div>
              <span className="px-2 py-0.5 bg-[#00F59B] text-black font-mono font-black text-[10px] uppercase border border-black">
                ENCRYPTED
              </span>
            </div>

            {/* Inner Form Content */}
            <div className="relative z-10 flex-1 flex flex-col justify-center">
              {/* Quick Demo Autofill Bar */}
              <div className="mb-5 p-3 border border-black/60 dark:border-white/30 bg-black/5 dark:bg-white/5 flex items-center justify-between gap-3 font-mono text-xs">
                <div className="flex items-center gap-2 text-black dark:text-white font-bold">
                  <Sparkles size={14} className="text-[#FF5522] shrink-0" />
                  <span className="text-[11px] sm:text-xs">Testing Forge runtime?</span>
                </div>
                <button
                  id="auth-demo-fill-btn"
                  type="button"
                  onClick={handleQuickDemoFill}
                  className="px-3 py-1 bg-[#FF5522] hover:bg-black hover:text-white text-black font-mono font-black text-[10px] sm:text-[11px] uppercase tracking-wider border border-black transition cursor-pointer active:translate-x-[1px] active:translate-y-[1px]"
                  title="Populate test account credentials"
                >
                  AUTO-FILL DEMO
                </button>
              </div>

              {/* Form Switching: Standard Credentials vs MFA Challenge */}
              <AnimatePresence mode="wait" initial={false}>
                {mfaToken ? (
                  /* MFA Challenge Form */
                  <motion.form
                    key="mfa"
                    id="mfa-form"
                    onSubmit={handleMfaSubmit}
                    noValidate
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20, transition: { duration: 0.2, ease: easeOut } }}
                    transition={{ duration: 0.35, ease: easeOut }}
                    className="space-y-4 font-mono"
                  >
                    <motion.div animate={mfaShake} className="space-y-4">
                      <div className="p-3.5 border border-black/60 dark:border-white/30 bg-black/5 dark:bg-white/5 text-xs text-black dark:text-white leading-relaxed">
                        Two-factor authentication is active. Enter the 6-digit verification code from
                        your authenticator application.
                      </div>

                      <AnimatePresence>
                        {mfaError && (
                          <motion.div
                            id="mfa-error"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: easeOut }}
                            role="alert"
                            aria-live="assertive"
                            className="p-3 border border-red-600 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold flex items-start gap-2"
                          >
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <span>{mfaError}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="mfa-code"
                          className="block text-xs font-black uppercase tracking-wider text-black dark:text-white"
                        >
                          Authentication code
                        </label>
                        <input
                          id="mfa-code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="123456"
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value)}
                          onBlur={() => setTouched((t) => ({ ...t, mfaCode: true }))}
                          aria-invalid={!!mfaError}
                          aria-describedby={mfaErrorId}
                          autoFocus
                          className="w-full h-12 px-4 border-2 border-black/80 dark:border-white/40 bg-white dark:bg-[#12151B] text-black dark:text-white font-mono font-black text-xl tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-[#FF5522]"
                        />
                      </div>

                      <button
                        id="mfa-submit-btn"
                        type="submit"
                        disabled={loading || !mfaCode.trim()}
                        className="w-full h-12 border-2 border-black bg-[#FF5522] hover:bg-black hover:text-white text-black font-mono font-black text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            <span>VERIFYING TOKEN…</span>
                          </>
                        ) : (
                          <>
                            <span>VERIFY & PROCEED</span>
                            <ArrowRight size={15} strokeWidth={2.5} />
                          </>
                        )}
                      </button>

                      <button
                        id="mfa-back-btn"
                        type="button"
                        onClick={() => {
                          handleSound("click");
                          setMfaToken(null);
                          setMfaCode("");
                          setMfaError(undefined);
                        }}
                        className="w-full text-xs text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white transition py-1 text-center font-bold uppercase underline underline-offset-4 cursor-pointer"
                      >
                        Return to primary sign in
                      </button>
                    </motion.div>
                  </motion.form>
                ) : (
                  /* Standard Credentials Form */
                  <motion.form
                    key="login"
                    id="auth-form"
                    aria-describedby={formErrorId}
                    onSubmit={handleSubmit}
                    noValidate
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20, transition: { duration: 0.2, ease: easeOut } }}
                    transition={{ duration: 0.35, ease: easeOut }}
                    className="space-y-4 font-mono"
                  >
                    <motion.div animate={loginShake} className="space-y-4">
                      {/* Top Level Form Error */}
                      <AnimatePresence>
                        {errors.form && (
                          <motion.div
                            id="form-error"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: easeOut }}
                            role="alert"
                            aria-live="assertive"
                            className="p-3 border border-red-600 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold flex items-start gap-2"
                          >
                            <AlertCircle size={16} className="shrink-0 mt-0.5" />
                            <span>{errors.form}</span>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Email Input */}
                      <div className="space-y-1.5">
                        <label
                          htmlFor="email"
                          className="block text-xs font-black uppercase tracking-wider text-black dark:text-white"
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
                              if (touched.email) {
                                setErrors((er) => ({
                                  ...er,
                                  email: validateEmail(e.target.value),
                                }));
                              }
                            }}
                            onBlur={() => {
                              setTouched((t) => ({ ...t, email: true }));
                              setErrors((er) => ({ ...er, email: validateEmail(email) }));
                            }}
                            aria-invalid={!!errors.email}
                            aria-describedby={emailErrorId}
                            className={`w-full h-11 sm:h-12 pl-10 pr-4 border-2 border-black/80 dark:border-white/30 bg-white dark:bg-[#12151B] text-black dark:text-white font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5522] ${
                              errors.email ? "!border-red-600 bg-red-500/5" : ""
                            }`}
                          />
                          <Mail
                            size={16}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/50 dark:text-white/50 pointer-events-none"
                            aria-hidden="true"
                          />
                        </div>
                        <AnimatePresence>
                          {errors.email && (
                            <motion.p
                              id="email-error"
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
                            className="block text-xs font-black uppercase tracking-wider text-black dark:text-white"
                          >
                            Password
                          </label>
                          <Link
                            to="/forgot-password"
                            onClick={() => handleSound()}
                            className="text-[11px] text-black/70 dark:text-white/70 hover:text-[#FF5522] dark:hover:text-[#FF5522] font-bold uppercase underline underline-offset-2 transition"
                          >
                            FORGOT PASSWORD?
                          </Link>
                        </div>
                        <div className="relative">
                          <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            placeholder="••••••••••••"
                            value={password}
                            onKeyDown={handleKeyModifier}
                            onKeyUp={handleKeyModifier}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              if (touched.password) {
                                setErrors((er) => ({
                                  ...er,
                                  password: validatePassword(e.target.value),
                                }));
                              }
                            }}
                            onBlur={() => {
                              setTouched((t) => ({ ...t, password: true }));
                              setErrors((er) => ({
                                ...er,
                                password: validatePassword(password),
                              }));
                            }}
                            aria-invalid={!!errors.password}
                            aria-describedby={passwordErrorId}
                            className={`w-full h-11 sm:h-12 pl-10 pr-10 border-2 border-black/80 dark:border-white/30 bg-white dark:bg-[#12151B] text-black dark:text-white font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5522] ${
                              errors.password ? "!border-red-600 bg-red-500/5" : ""
                            }`}
                          />
                          <Lock
                            size={16}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/50 dark:text-white/50 pointer-events-none"
                            aria-hidden="true"
                          />
                          <button
                            id="password-visibility-toggle"
                            type="button"
                            onClick={() => {
                              handleSound();
                              setShowPassword((s) => !s);
                            }}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition cursor-pointer"
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
                            id="caps-lock-warning"
                            className="p-1.5 px-2.5 border border-black bg-amber-300 text-black text-[11px] font-black uppercase flex items-center gap-1.5"
                          >
                            <AlertCircle size={13} />
                            <span>CAPS LOCK IS ACTIVE</span>
                          </div>
                        )}

                        {/* Error or Password Strength */}
                        <AnimatePresence mode="wait">
                          {errors.password ? (
                            <motion.p
                              key="error"
                              id="password-error"
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.15 }}
                              className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1 pt-0.5"
                            >
                              <AlertCircle size={13} className="shrink-0" />
                              <span>{errors.password}</span>
                            </motion.p>
                          ) : password.length > 0 ? (
                            <div key="strength" className="pt-1.5 space-y-1">
                              <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
                                {[1, 2, 3].map((step) => (
                                  <div
                                    key={step}
                                    className={`h-1.5 border border-black/50 dark:border-white/30 transition-colors ${
                                      passwordStrength >= step
                                        ? passwordStrength === 1
                                          ? "bg-red-500"
                                          : passwordStrength === 2
                                          ? "bg-amber-400"
                                          : "bg-[#00F59B]"
                                        : "bg-black/10 dark:bg-white/10"
                                    }`}
                                  />
                                ))}
                              </div>
                              <div className="flex justify-between text-[10px] text-black/70 dark:text-white/70 font-mono font-bold uppercase">
                                <span>SECURITY LEVEL:</span>
                                <span className="font-black text-black dark:text-white">
                                  {strengthLabels[passwordStrength]}
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </AnimatePresence>
                      </div>

                      {/* Stay Signed In */}
                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2.5 text-xs text-black dark:text-white font-bold select-none cursor-pointer group">
                          <input
                            id="remember-me-checkbox"
                            type="checkbox"
                            checked={remember}
                            onChange={(e) => setRemember(e.target.checked)}
                            className="w-4 h-4 border border-black/80 rounded-none bg-white dark:bg-black accent-[#FF5522] cursor-pointer"
                          />
                          <span>STAY SIGNED IN (30 DAYS)</span>
                        </label>
                      </div>

                      {/* Primary Submit Button */}
                      <button
                        id="auth-submit-btn"
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 sm:h-13 bg-[#FF5522] hover:bg-black hover:text-white text-black font-mono font-black text-xs sm:text-sm uppercase tracking-wider border-2 border-black active:translate-x-[1px] active:translate-y-[1px] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            <span>SIGNING IN…</span>
                          </>
                        ) : (
                          <>
                            <span>SIGN IN TO WORKSPACE</span>
                            <ArrowRight size={16} strokeWidth={2.5} />
                          </>
                        )}
                      </button>

                      {/* Or Divider */}
                      <div className="relative my-3">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-black/20 dark:border-white/20" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="px-3 bg-white/90 dark:bg-[#161920] text-black/60 dark:text-white/60 font-black uppercase text-[10px]">
                            OR CONTINUE WITH
                          </span>
                        </div>
                      </div>

                      {/* Google Single Sign-On Button */}
                      <button
                        id="auth-google-btn"
                        type="button"
                        onClick={() => {
                          handleSound();
                          window.location.href = `${API_URL}/v1/auth/google`;
                        }}
                        className="w-full h-11 border border-black/80 dark:border-white/30 bg-white dark:bg-[#1A1E26] hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-black dark:text-white font-mono font-bold text-xs uppercase transition flex items-center justify-center gap-2.5 cursor-pointer"
                      >
                        <GoogleIcon className="w-4 h-4" />
                        <span>GOOGLE SINGLE SIGN-ON</span>
                      </button>
                    </motion.div>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {/* Window Footer Strip */}
            <div className="relative z-10 pt-4 mt-4 border-t border-black/20 dark:border-white/20 flex flex-wrap items-center justify-between text-[11px] font-mono text-black/70 dark:text-white/70">
              <div className="flex items-center gap-2">
                <span>NEW TO FORGE?</span>
                <Link
                  id="auth-nav-signup-link"
                  to="/signup"
                  onClick={() => handleSound()}
                  className="font-black text-black dark:text-white underline underline-offset-2 hover:text-[#FF5522] uppercase"
                >
                  CREATE AN ACCOUNT
                </Link>
              </div>
              <span className="text-[10px] uppercase font-bold text-[#FF5522]">
                SESSION: SECURE
              </span>
            </div>
          </div>

          {/* =================== RIGHT CARD 002: AUTONOMOUS RIG & SWARM DOSSIER =================== */}
          <div className="lg:col-span-6 xl:col-span-6 bg-black text-white relative flex flex-col justify-between p-6 sm:p-8 overflow-hidden border-2 border-black dark:border-white/30 select-none">
            <CornerLines color="border-white/70" size="w-3.5 h-3.5" />

            {/* Giant Rotated Vertical Number 002 on Right Edge */}
            <div
              className="absolute right-4 top-1/2 -translate-y-1/2 font-mono font-black text-6xl sm:text-7xl md:text-8xl tracking-tighter text-white select-none pointer-events-none opacity-90 z-20"
              aria-hidden="true"
            >
              <span
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                }}
              >
                002
              </span>
            </div>

            {/* Top Showcase Header */}
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/20 font-mono text-xs font-black">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 border border-black bg-[#FF5522] text-black uppercase">
                  <Zap size={13} strokeWidth={2.5} />
                  <span>AUTONOMOUS SWARM</span>
                </div>
                <span className="text-white/70 uppercase">STATUS: ACTIVE</span>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-mono font-black uppercase tracking-tight text-white leading-tight mb-2">
                  AUTONOMOUS MULTI-AGENT RUNTIME
                </h2>
                <p className="text-xs font-mono text-white/70 leading-relaxed max-w-lg">
                  Forge orchestrates specialist AI agents to synthesize architecture schemas,
                  compile full-stack codebases, and execute zero-defect deployments.
                </p>
              </div>
            </div>

            {/* Swarm Visualization */}
            <div className="relative z-10 my-auto py-2">
              <ForgeSwarmVisual variant="orange" className="max-h-[160px]" />
            </div>

            {/* Active Specialist Agent Strips */}
            <div className="relative z-10 space-y-2 font-mono my-2">
              <div className="text-[11px] font-black uppercase text-white/70 flex items-center justify-between">
                <span>ACTIVE SPECIALIST AGENTS</span>
                <span className="text-[#00F59B] flex items-center gap-1 font-bold">
                  <CheckCircle2 size={12} strokeWidth={2.5} /> DETERMINISTIC
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AGENT_PIPELINE.map((agent) => {
                  const Icon = agent.icon;
                  return (
                    <div
                      key={agent.code}
                      className="p-2 border border-white/20 bg-white/5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 border border-white/30 bg-black flex items-center justify-center text-[#FF5522] shrink-0">
                          <Icon size={12} strokeWidth={2.5} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-black text-white truncate">
                            {agent.role}
                          </div>
                          <div className="text-[9px] text-white/60">[{agent.code}]</div>
                        </div>
                      </div>
                      <span
                        className={`px-1.5 py-0.2 border border-black font-black text-[9px] uppercase shrink-0 ${agent.badgeColor}`}
                      >
                        {agent.badge}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Floating Glass Card with Build Metrics */}
            <div className="relative z-20 bg-white/10 backdrop-blur-md border border-white/30 p-3.5 sm:p-4 mt-3">
              <CornerLines color="border-white/60" size="w-2 h-2" />
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <span className="text-2xl font-mono font-black text-white leading-none">
                    2,628
                  </span>
                  <span className="text-[10px] font-mono text-white/70 uppercase ml-2">
                    Builds Deployed
                  </span>
                </div>
                <div className="text-[10px] font-mono font-bold text-[#FF5522]">
                  100% AUDITED
                </div>
              </div>

              {/* 7-Day Mini Bar Equalizer Chart & Circular Gauge */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/20">
                <div className="flex items-end gap-1.5 h-6">
                  {BARS_BUILDS.map((height, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <span
                        style={{ height: `${height * 0.2}px` }}
                        className={`w-1.5 ${i === 4 ? "bg-[#FF5522]" : "bg-white"} transition-all duration-300`}
                      />
                      <span className="text-[7px] font-mono text-white/60">{DAYS[i]}</span>
                    </div>
                  ))}
                </div>

                <div
                  className="relative w-8 h-8 rounded-full border-2 border-white/30 flex items-center justify-center"
                  title="99% test success rate"
                >
                  <div className="absolute inset-0 rounded-full border-2 border-t-[#FF5522] border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                  <span className="text-[9px] font-mono font-bold text-white">99%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 4. FOOTER SPECIFICATIONS & TELEMETRY (MATCHING LAUNCH PAGE)               */}
      {/* ========================================================================= */}
      <footer className="w-full border-t border-black/80 dark:border-white/20 bg-[#D4D7CF] dark:bg-[#0F1115] px-4 sm:px-8 py-3 text-xs font-mono">
        <div className="max-w-[1720px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-black/70 dark:text-white/70 text-[11px] font-bold">
            <span>Gateway: SEC-AUTH-89D7</span>
            <span>•</span>
            <span>Swarm: Operational</span>
            <span>•</span>
            <span className="text-[#FF5522]">TLS 1.3 Active</span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <button
              type="button"
              onClick={() => {
                handleSound();
                navigate("/projects");
              }}
              className="hover:underline font-bold text-black dark:text-white cursor-pointer"
            >
              Projects
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => {
                handleSound();
                navigate("/initiatives");
              }}
              className="hover:underline font-bold text-black dark:text-white cursor-pointer"
            >
              Initiatives
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => {
                handleSound();
                navigate("/build/demo-project");
              }}
              className="hover:underline font-bold text-[#FF5522] cursor-pointer"
            >
              Workspace IDE
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => {
                handleSound();
                navigate("/home");
              }}
              className="hover:underline font-bold text-black dark:text-white cursor-pointer"
            >
              Overview
            </button>
          </div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* 5. SLIDE-OUT HUD SYSTEM CONTROL DRAWER (MATCHING LAUNCH PAGE)             */}
      {/* ========================================================================= */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-[#D4D7CF] dark:bg-[#12151A] border-l-2 border-black dark:border-white/30 h-full p-6 sm:p-8 flex flex-col justify-between font-mono">
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-black dark:border-white/20 pb-4 mb-6">
                <div className="flex items-center gap-3">
                  <BrandLogo size="xs" />
                  <div>
                    <h2 className="font-mono font-black text-sm uppercase tracking-widest text-black dark:text-white leading-tight">
                      System navigation
                    </h2>
                    <span className="text-[10px] text-[#FF5522] font-bold tracking-wider uppercase">
                      Live cluster telemetry
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
                  }}
                  className="p-1.5 border border-black dark:border-white/40 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition cursor-pointer"
                  title="Close navigation drawer"
                  aria-label="Close navigation drawer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Navigation Items to Real Website Pages */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
                    navigate("/home");
                  }}
                  className="w-full p-3.5 border border-black/80 dark:border-white/30 bg-white/50 dark:bg-black/30 hover:bg-[#FF5522] hover:text-black text-black dark:text-white flex items-center justify-between group transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <BrandLogo size="xs" />
                    <div>
                      <div className="font-black text-xs uppercase tracking-wider">
                        Platform Overview
                      </div>
                      <div className="text-[10px] text-black/60 dark:text-white/60 group-hover:text-black">
                        Documentation & Engine Specs
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
                    navigate("/launch");
                  }}
                  className="w-full p-3.5 border border-black/80 dark:border-white/30 bg-white/50 dark:bg-black/30 hover:bg-[#FF5522] hover:text-black text-black dark:text-white flex items-center justify-between group transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Terminal size={18} />
                    <div>
                      <div className="font-black text-xs uppercase tracking-wider">
                        Launchpad HUD
                      </div>
                      <div className="text-[10px] text-black/60 dark:text-white/60 group-hover:text-black">
                        Interactive Spec Synthesizer
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
                    navigate("/projects");
                  }}
                  className="w-full p-3.5 border border-black/80 dark:border-white/30 bg-white/50 dark:bg-black/30 hover:bg-[#FF5522] hover:text-black text-black dark:text-white flex items-center justify-between group transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <FolderGit2 size={18} />
                    <div>
                      <div className="font-black text-xs uppercase tracking-wider">
                        All Projects
                      </div>
                      <div className="text-[10px] text-black/60 dark:text-white/60 group-hover:text-black">
                        Manage code repositories
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
                    navigate("/initiatives");
                  }}
                  className="w-full p-3.5 border border-black/80 dark:border-white/30 bg-white/50 dark:bg-black/30 hover:bg-[#FF5522] hover:text-black text-black dark:text-white flex items-center justify-between group transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Layers size={18} />
                    <div>
                      <div className="font-black text-xs uppercase tracking-wider">
                        Agile Initiatives
                      </div>
                      <div className="text-[10px] text-black/60 dark:text-white/60 group-hover:text-black">
                        Kanban, Sprints & PRD Copilot
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSound();
                    setMenuOpen(false);
                    navigate("/build/demo-project");
                  }}
                  className="w-full p-3.5 border-2 border-black dark:border-[#FF5522] bg-white/70 dark:bg-black/50 hover:bg-[#FF5522] hover:text-black text-black dark:text-white flex items-center justify-between group transition text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Cpu size={18} className="text-[#FF5522] group-hover:text-black" />
                    <div>
                      <div className="font-black text-xs uppercase tracking-wider text-[#FF5522] group-hover:text-black">
                        Workspace IDE
                      </div>
                      <div className="text-[10px] text-black/60 dark:text-white/60 group-hover:text-black">
                        Cloud editor & multi-agent runtime
                      </div>
                    </div>
                  </div>
                  <ExternalLink size={16} />
                </button>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="pt-6 border-t border-black dark:border-white/20 text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-black/60 dark:text-white/60">Cluster status</span>
                <span className="text-[#00F59B] font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#00F59B] animate-pulse" />
                  ONLINE // 99.98%
                </span>
              </div>
              <p className="text-[10px] text-black/60 dark:text-white/60 leading-relaxed">
                Forge Autonomous Software Runtime v2.4 • Licensed for enterprise cloud infrastructure.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
