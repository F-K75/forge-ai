import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { notificationsApi } from "../lib/api";
import { LIVE_MODE } from "../lib/env";
import { formatRelativeTime } from "../lib/format";

// Module 15: a lightweight bell + dropdown over the existing
// /growth/notifications collection, polled the same way AdminConsole polls
// system health -- no backend change needed for the read side.
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list(),
    enabled: LIVE_MODE,
    refetchInterval: 30_000,
  });

  if (!LIVE_MODE) return null;

  const unread = notifications.filter(n => !n.read_at).length;

  const handleOpen = () => setOpen(o => !o);

  const handleRead = async (id: string) => {
    try {
      await notificationsApi.markRead(id);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch {
      // best-effort
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-panel-alt transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
      >
        <Bell size={15} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-ink" aria-hidden="true" />
        )}
      </button>

      {open && (
        <>
          <button
            aria-label="Close notifications"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="region"
            aria-label="Notifications"
            className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-panel border border-border rounded-lg shadow-xl z-20"
          >
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs uppercase tracking-[0.14em] text-muted">Notifications</p>
            </div>
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-xs text-faint text-center">No notifications yet.</p>
            ) : (
              <ul>
                {notifications.map(n => (
                  <li key={n.id}>
                    <button
                      onClick={() => handleRead(n.id)}
                      className={`w-full text-left px-4 py-3 border-b border-border-soft last:border-b-0 hover:bg-panel-alt transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ink/40 ${
                        n.read_at ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-xs font-medium text-ink truncate">{n.title}</p>
                        <span className="text-[10px] text-faint shrink-0">{formatRelativeTime(n.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed">{n.message}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
