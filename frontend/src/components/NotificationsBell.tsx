import { useState, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { notificationsApi } from "../lib/api"
import { LIVE_MODE } from "../lib/env"
import { formatRelativeTime } from "../lib/format"
import { presets } from "../lib/animationPresets"

export interface NotificationsBellProps {
  className?: string;
}

export function NotificationsBell({ className }: NotificationsBellProps = {}) {
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
    <div className="relative flex items-center">
      <motion.button
        type="button"
        onClick={handleOpen}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className={
          className ||
          "relative flex items-center justify-center w-7 h-7 bg-white dark:bg-[#252530] border-2 border-black dark:border-white/80 text-ink shadow-[1px_1px_0px_#000] dark:shadow-[1px_1px_0px_#fff] hover:bg-brutal-yellow hover:text-black active:translate-x-[1px] active:translate-y-[1px] focus:outline-none"
        }
        whileHover={reduceMotion ? {} : { scale: 1.05 }}
        whileTap={reduceMotion ? {} : { scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
      >
        <Bell size={13} strokeWidth={2.5} aria-hidden="true" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              key="badge"
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-brutal-pink border border-black"
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
            className="absolute right-0 mt-2 w-80 max-h-96 overflow-hidden bg-white border-2 border-black rounded-sm shadow-brutal-lg z-20 flex flex-col"
            initial={reduceMotion ? false : presets.notification.initial}
            animate={presets.notification.animate}
            exit={presets.notification.exit}
            transition={{ type: "spring", stiffness: 450, damping: 24 }}
          >
            <div className="px-4 py-2.5 border-b-2 border-black bg-brutal-cream shrink-0">
              <p className="text-xs font-black uppercase tracking-wider text-black">Notifications</p>
            </div>
            {notifications.length === 0 ? (
              <motion.p
                className="px-4 py-6 text-xs font-bold text-muted text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
              >
                All caught up.
              </motion.p>
            ) : (
              <ul className="overflow-y-auto flex-1 divide-y-2 divide-black/10">
                {notifications.map((n, idx) => (
                  <motion.li
                    key={n.id}
                    initial={reduceMotion ? false : { opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * idx, duration: 0.2 }}
                  >
                    <motion.button
                      onClick={() => handleRead(n.id)}
                      className={`w-full text-left px-4 py-3 focus:outline-none transition-colors ${
                        n.read_at ? "opacity-60 bg-neutral-50" : "hover:bg-brutal-yellow/20 bg-white"
                      }`}
                      whileHover={reduceMotion ? {} : { x: 2 }}
                      transition={{ duration: 0.1 }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-xs font-bold text-black truncate">{n.title}</p>
                        <span className="text-[10px] font-mono font-bold text-muted shrink-0">{formatRelativeTime(n.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-ink leading-relaxed">{n.message}</p>
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
