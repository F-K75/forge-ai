import { useState, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { notificationsApi } from "../lib/api"
import { LIVE_MODE } from "../lib/env"
import { formatRelativeTime } from "../lib/format"
import { presets } from "../lib/animationPresets"

export function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const dropdownRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list(),
    enabled: LIVE_MODE,
    refetchInterval: 30_000,
  })

  if (!LIVE_MODE) return null

  const unread = notifications.filter(n => !n.read_at).length

  const handleOpen = () => setOpen(o => !o)

  const handleRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id)
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    } catch {
      // best-effort
    }
  }

  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={handleOpen}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-panel-alt focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
        whileHover={reduceMotion ? {} : { scale: 1.1 }}
        whileTap={reduceMotion ? {} : { scale: 0.92 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <Bell size={15} aria-hidden="true" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="badge"
              className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-ink"
              aria-hidden="true"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
            />
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={dropdownRef}
            role="region"
            aria-label="Notifications"
            className="absolute right-0 mt-2 w-80 max-h-96 overflow-hidden glass rounded-lg shadow-xl z-20 flex flex-col"
            initial={reduceMotion ? false : presets.notification.initial}
            animate={presets.notification.animate}
            exit={presets.notification.exit}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
          >
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Notifications</p>
            </div>
            {notifications.length === 0 ? (
              <motion.p
                className="px-4 py-6 text-xs text-faint text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
              >
                All caught up.
              </motion.p>
            ) : (
              <ul className="overflow-y-auto flex-1">
                {notifications.map((n, idx) => (
                  <motion.li
                    key={n.id}
                    initial={reduceMotion ? false : { opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * idx, duration: 0.3 }}
                  >
                    <motion.button
                      onClick={() => handleRead(n.id)}
                      className={`w-full text-left px-4 py-3 border-b border-border-soft last:border-b-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ink/40 ${
                        n.read_at ? "opacity-60" : "hover:bg-panel-alt"
                      }`}
                      whileHover={reduceMotion ? {} : { x: 4 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-xs font-medium text-ink truncate">{n.title}</p>
                        <span className="text-[10px] text-faint shrink-0">{formatRelativeTime(n.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed">{n.message}</p>
                    </motion.button>
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <button
          aria-label="Close notifications"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  )
}
