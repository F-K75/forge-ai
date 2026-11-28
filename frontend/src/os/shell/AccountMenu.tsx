/** Profile and account controls: one avatar button, one quiet menu. */
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Contrast, CreditCard, LayoutDashboard, LogOut, Moon, Settings, Sun } from "lucide-react"
import { applyTheme, getStoredTheme, type ThemeMode } from "../../lib/theme"
import { useAuthStore } from "../../store/authStore"
import { openCapability, openLegacyRoute } from "./sessionController"

function initials(name?: string, email?: string): string {
  const src = (name || email || "?").trim()
  const parts = src.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase()
}

const THEMES: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "light", label: "Light", Icon: Sun },
  { id: "high-contrast", label: "High contrast", Icon: Contrast },
]

export function AccountMenu() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme())
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    window.addEventListener("pointerdown", onDown)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("keydown", onKey)
    }
  }, [open])

  const item =
    "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-caption text-ink transition-colors hover:bg-ink/[0.06] focus-visible:bg-ink/[0.06] focus-visible:outline-none"
  const run = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user?.name ?? "you"}`}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/[0.08] text-2xs font-medium text-ink transition-colors hover:bg-ink/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        data-testid="os-account-button"
      >
        {initials(user?.name, user?.email)}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-10 z-[120] w-64 rounded-lg border border-border bg-panel p-1 shadow-brutal-lg animate-scale-in motion-reduce:animate-none"
        >
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-caption font-medium text-ink">{user?.name ?? "Signed in"}</p>
            <p className="truncate text-xs font-normal text-muted">{user?.email}</p>
            <p className="mt-2 flex items-center gap-2 text-xs font-normal text-muted">
              <span className="rounded-pill bg-accent/[0.12] px-2 py-0.5 text-2xs font-medium capitalize text-accent">{user?.plan ?? "free"}</span>
              <span className="font-mono tabular-nums text-ink">{(user?.credits ?? 0).toLocaleString()}</span>
              <span>credits</span>
            </p>
          </div>
          <div className="my-1 border-t border-border-soft" />
          <button type="button" role="menuitem" className={item} onClick={run(() => openCapability("account.settings"))}>
            <Settings size={14} className="text-muted" aria-hidden="true" /> Settings
          </button>
          <button type="button" role="menuitem" className={item} onClick={run(() => openCapability("account.billing"))}>
            <CreditCard size={14} className="text-muted" aria-hidden="true" /> Billing and credits
          </button>
          <button type="button" role="menuitem" className={item} onClick={run(() => openLegacyRoute("/command", "Command Center"))}>
            <LayoutDashboard size={14} className="text-muted" aria-hidden="true" /> Command Center
          </button>
          <div className="my-1 border-t border-border-soft" />
          <div role="group" aria-label="Theme" className="flex gap-0.5 rounded-pill bg-ink/[0.05] p-0.5 mx-1.5 my-1">
            {THEMES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={theme === id}
                aria-label={label}
                title={label}
                onClick={() => {
                  setTheme(id)
                  applyTheme(id)
                }}
                className={`flex h-7 flex-1 items-center justify-center rounded-pill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  theme === id ? "bg-ink text-on-ink" : "text-muted hover:text-ink"
                }`}
              >
                <Icon size={13} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="my-1 border-t border-border-soft" />
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={run(() => {
              void logout()
              navigate("/login", { replace: true })
            })}
          >
            <LogOut size={14} className="text-muted" aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
