import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BarChart3, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { initiativesApi } from "../../lib/pmApi";
import { motion, motionVariants } from "../../lib/animations";

type AnalyticsEvent = {
  event_name: string;
  count: number;
  last_at?: string;
};

export default function AnalyticsTab() {
  const { initiativeId } = useParams<{ initiativeId: string }>();
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!initiativeId) return;
    setLoading(true);
    try {
      const data = await initiativesApi.analytics(initiativeId);
      setEvents(data.events || []);
    } catch {
      toast.error("Couldn't load analytics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const total = events.reduce((sum, e) => sum + (e.count || 0), 0);

  return (
    <motion.div className="mx-auto max-w-5xl px-4 py-6 md:px-8 space-y-6" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <BarChart3 size={12} aria-hidden="true" />
          </span>
          <h2 className="font-display text-sm font-semibold text-ink">Analytics</h2>
        </div>
        <span className="text-xs text-muted">{total} events</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-faint">No analytics events yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {events.map(event => (
            <motion.div
              key={event.event_name}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl"
              variants={motionVariants.fadeUp}
            >
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">{event.event_name}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{event.count}</p>
              {event.last_at && (
                <p className="mt-1 text-[10px] text-faint">Last: {new Date(event.last_at).toLocaleString()}</p>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
