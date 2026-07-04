import { NavLink, Outlet } from "react-router-dom";
import { LayoutGrid, Store, CreditCard, Settings, ShieldCheck, Zap, type LucideIcon } from "lucide-react";
import { CURRENT_USER } from "../lib/mockData";
import { useAuthStore } from "../store/authStore";
import { LIVE_MODE } from "../lib/env";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/projects",    label: "Projects",    icon: LayoutGrid, end: true  },
  { to: "/marketplace", label: "Marketplace", icon: Store                   },
  { to: "/reviews",     label: "Reviews",     icon: ShieldCheck             },
  { to: "/billing",     label: "Billing",     icon: CreditCard              },
  { to: "/settings",    label: "Settings",    icon: Settings                },
];

export default function AppShell() {
  // In live mode, real account data comes from useAuthStore -- CURRENT_USER
  // is demo-mode-only mock data and was previously rendered unconditionally,
  // risking mock identity/credits showing over a real signed-in user's data.
  // user.credits is a single remaining balance (no server-side "total" is
  // available client-side without an extra billing fetch), so live mode
  // shows a plain remaining count instead of fabricating a used/total bar.
  const { user } = useAuthStore();
  const name = LIVE_MODE ? user?.name ?? "" : CURRENT_USER.name;
  const email = LIVE_MODE ? user?.email ?? "" : CURRENT_USER.email;
  const plan = LIVE_MODE ? user?.plan ?? "free" : CURRENT_USER.plan;
  const creditsRemaining = LIVE_MODE ? user?.credits ?? 0 : null;
  const creditPct = !LIVE_MODE
    ? Math.round((CURRENT_USER.creditsUsed / CURRENT_USER.creditsTotal) * 100)
    : 0;

  return (
    <div className="flex h-screen bg-base overflow-hidden">
      {/* Rail */}
      <nav
        aria-label="Main navigation"
        className="w-14 md:w-56 shrink-0 flex flex-col bg-panel border-r border-border overflow-y-auto"
      >
        {/* Logo */}
        <div className="flex items-center justify-center md:justify-start gap-2.5 px-3 py-5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <Zap size={14} className="text-white" aria-hidden="true" />
          </div>
          <span className="hidden md:block text-sm font-bold text-ink tracking-tight">Forge</span>
        </div>

        {/* Nav items */}
        <div className="flex-1 px-1 md:px-2 pb-4 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) =>
                [
                  "flex items-center justify-center md:justify-start gap-3",
                  "p-2 md:px-3 md:py-2 rounded-lg text-sm w-full",
                  "transition-colors motion-reduce:transition-none",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  isActive
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:text-ink hover:bg-panel-alt",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} className={isActive ? "text-accent" : ""} aria-hidden="true" />
                  <span className="hidden md:block">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Bottom — credits card + user chip */}
        <div className="hidden md:flex flex-col gap-2 px-2 pb-4">
          {/* Credits */}
          <div className="rounded-lg bg-panel-alt border border-border-soft px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-semibold text-faint uppercase tracking-wide">
                {plan}
              </span>
              {!LIVE_MODE && (
                <span className="text-[10px] text-faint font-mono">
                  {CURRENT_USER.creditsUsed} / {CURRENT_USER.creditsTotal}
                </span>
              )}
            </div>
            {LIVE_MODE ? (
              <p className="text-[10px] text-faint font-mono">{creditsRemaining} credits remaining</p>
            ) : (
              <>
                <div
                  className="h-1 rounded-full bg-border overflow-hidden"
                  role="progressbar"
                  aria-valuenow={CURRENT_USER.creditsUsed}
                  aria-valuemin={0}
                  aria-valuemax={CURRENT_USER.creditsTotal}
                  aria-label="Credits used"
                >
                  <div
                    className="h-full rounded-full bg-accent transition-[width] motion-reduce:transition-none"
                    style={{ width: `${creditPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-faint mt-1">credits this month</p>
              </>
            )}
          </div>

          {/* User chip */}
          <div className="flex items-center gap-2.5 px-1 py-1">
            <div
              className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-agent-designer flex items-center justify-center shrink-0 text-xs font-bold text-white select-none"
              aria-hidden="true"
            >
              {name[0]}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink truncate">{name}</p>
              <p className="text-[10px] text-faint truncate">{email}</p>
            </div>
          </div>
        </div>

        {/* Mobile — avatar only */}
        <div className="md:hidden flex justify-center pb-4">
          <div
            className="w-7 h-7 rounded-full bg-gradient-to-br from-accent to-agent-designer flex items-center justify-center text-xs font-bold text-white select-none"
            aria-label={name}
          >
            {name[0]}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1 overflow-auto bg-base">
        <Outlet />
      </main>
    </div>
  );
}
