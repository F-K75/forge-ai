import { NavLink, Outlet } from "react-router-dom";
import { LayoutGrid, Store, CreditCard, Settings, ShieldCheck, Rocket, Zap, type LucideIcon } from "lucide-react";
import { CURRENT_USER } from "../lib/mockData";
import { useAuthStore } from "../store/authStore";
import { LIVE_MODE } from "../lib/env";
import { NotificationsBell } from "./NotificationsBell";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/projects",    label: "Projects",    icon: LayoutGrid, end: true  },
  { to: "/initiatives", label: "Initiatives", icon: Rocket                  },
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
        className="w-14 md:w-56 shrink-0 flex flex-col border-r border-border overflow-y-auto"
      >
        {/* Logo */}
        <div className="flex items-center justify-center md:justify-between gap-2.5 px-4 md:px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 border border-ink flex items-center justify-center shrink-0">
              <Zap size={12} className="text-ink" aria-hidden="true" />
            </div>
            <span className="hidden md:block font-display font-medium tracking-tight text-ink">Forge</span>
          </div>
          <div className="hidden md:block">
            <NotificationsBell />
          </div>
        </div>

        {/* Nav items */}
        <div className="flex-1 px-1 md:px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) =>
                [
                  "flex items-center justify-center md:justify-start gap-3",
                  "p-2 md:pl-3 md:pr-3 md:py-2 text-sm w-full border-l md:border-l-2",
                  "transition-colors motion-reduce:transition-none",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40",
                  isActive
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={15} className={isActive ? "text-ink" : ""} aria-hidden="true" />
                  <span className="hidden md:block">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Bottom — credits card + user chip */}
        <div className="hidden md:flex flex-col gap-4 px-4 py-5 border-t border-border">
          {/* Credits */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted">
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
                  className="h-px bg-border overflow-hidden"
                  role="progressbar"
                  aria-valuenow={CURRENT_USER.creditsUsed}
                  aria-valuemin={0}
                  aria-valuemax={CURRENT_USER.creditsTotal}
                  aria-label="Credits used"
                >
                  <div
                    className="h-full bg-ink transition-[width] motion-reduce:transition-none"
                    style={{ width: `${creditPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-faint mt-1.5">credits this month</p>
              </>
            )}
          </div>

          {/* User chip */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-full border border-border flex items-center justify-center shrink-0 text-xs font-medium text-ink select-none"
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
        <div className="md:hidden flex justify-center py-4 border-t border-border">
          <div
            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-xs font-medium text-ink select-none"
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
