import { useState, useEffect, useCallback } from "react";
import { LifeBuoy, Send, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "react-hot-toast";
import { supportApi, type SupportTicketItem } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";

const DEMO_TICKETS: SupportTicketItem[] = [
  {
    id: "tkt_001",
    subject: "Inquiry on custom VPC agent deployment",
    description: "Looking to deploy the autonomous agent cluster inside our private AWS VPC subnet.",
    priority: "normal",
    status: "in_progress",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: "tkt_002",
    subject: "Docker daemon socket permission inquiry",
    description: "Clarification on rootless container execution privileges during code verification.",
    priority: "low",
    status: "resolved",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
  },
];

export function SupportTab() {
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState("normal");
  const [category, setCategory] = useState("technical");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      if (LIVE_MODE) {
        const data = await supportApi.list();
        setTickets(data || []);
      } else {
        const stored = localStorage.getItem("forge_demo_support_tickets");
        setTickets(stored ? JSON.parse(stored) : DEMO_TICKETS);
      }
    } catch {
      if (LIVE_MODE) {
        setTickets([]);
        toast.error("Failed to load support tickets");
      } else {
        setTickets(DEMO_TICKETS);
      }
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      toast.error("Please fill in both subject and description.");
      return;
    }

    setSubmitting(true);
    try {
      if (LIVE_MODE) {
        await supportApi.create({
          subject: `[${category.toUpperCase()}] ${subject.trim()}`,
          description: description.trim(),
          priority,
        });
      } else {
        const newTkt: SupportTicketItem = {
          id: `tkt_${Date.now()}`,
          subject: `[${category.toUpperCase()}] ${subject.trim()}`,
          description: description.trim(),
          priority,
          status: "open",
          created_at: new Date().toISOString(),
        };
        const updated = [newTkt, ...tickets];
        setTickets(updated);
        localStorage.setItem("forge_demo_support_tickets", JSON.stringify(updated));
      }

      toast.success("Support ticket submitted. Our engineering team will respond shortly.");
      setSubject("");
      setDescription("");
      loadTickets();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "resolved":
        return <span className="text-[10px] font-mono text-ok bg-ok/10 border border-ok/20 px-2 py-0.5 rounded">Resolved</span>;
      case "in_progress":
        return <span className="text-[10px] font-mono text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded">In Progress</span>;
      default:
        return <span className="text-[10px] font-mono text-warn bg-warn/10 border border-warn/20 px-2 py-0.5 rounded">Open</span>;
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case "urgent":
        return <span className="text-[10px] text-error font-semibold uppercase">Urgent</span>;
      case "high":
        return <span className="text-[10px] text-warn font-semibold uppercase">High</span>;
      case "low":
        return <span className="text-[10px] text-muted uppercase">Low</span>;
      default:
        return <span className="text-[10px] text-muted uppercase">Normal</span>;
    }
  };

  return (
    <div id="settings-support-panel" className="space-y-8">
      {/* Quick Help Resources */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <a
          href="https://docs.forge.dev"
          target="_blank"
          rel="noreferrer"
          className="p-4 rounded-xl border border-border bg-panel hover:border-accent/40 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink group-hover:text-accent transition">Documentation</span>
            <ExternalLink size={12} className="text-muted group-hover:text-accent" />
          </div>
          <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
            Architectural guides, agent protocol specifications, and CLI setup.
          </p>
        </a>

        <a
          href="https://discord.gg/forge"
          target="_blank"
          rel="noreferrer"
          className="p-4 rounded-xl border border-border bg-panel hover:border-accent/40 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink group-hover:text-accent transition">Discord Community</span>
            <ExternalLink size={12} className="text-muted group-hover:text-accent" />
          </div>
          <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
            Connect with other autonomous software engineers and core maintainers.
          </p>
        </a>

        <a
          href="https://status.forge.dev"
          target="_blank"
          rel="noreferrer"
          className="p-4 rounded-xl border border-border bg-panel hover:border-accent/40 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink group-hover:text-accent transition">Platform Status</span>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ok" />
              <span className="text-[10px] text-ok font-mono">99.98%</span>
            </div>
          </div>
          <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
            Real-time uptime and incident tracking across all agent inference clusters.
          </p>
        </a>
      </section>

      {/* Submit Ticket Form */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <LifeBuoy size={15} className="text-accent" />
            Open an Engineering Support Ticket
          </h2>
          <p className="text-xs text-muted mt-1">
            Need assistance with compiler diagnostics, enterprise billing, or agent orchestration? Our team is on standby.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="ticket-subject-input" className="text-xs font-medium text-ink block">
                Subject
              </label>
              <input
                id="ticket-subject-input"
                type="text"
                required
                maxLength={200}
                placeholder="Brief summary of the issue or inquiry"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ticket-priority-select" className="text-xs font-medium text-ink block">
                Priority
              </label>
              <select
                id="ticket-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="low">Low (General question)</option>
                <option value="normal">Normal (Default)</option>
                <option value="high">High (Production blocked)</option>
                <option value="urgent">Urgent (System outage)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ticket-category-select" className="text-xs font-medium text-ink block">
              Issue Category
            </label>
            <select
              id="ticket-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="technical">Autonomous Agent & Build Errors</option>
              <option value="billing">Billing, Invoices & Credits</option>
              <option value="security">Security & Access Management</option>
              <option value="feature">Feature Request & Suggestions</option>
              <option value="other">Other Inquiry</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ticket-desc-input" className="text-xs font-medium text-ink flex items-center justify-between">
              <span>Detailed Description</span>
              <span className="text-[10px] text-faint font-mono">{description.length}/5000</span>
            </label>
            <textarea
              id="ticket-desc-input"
              rows={4}
              required
              maxLength={5000}
              placeholder="Describe your environment, reproduction steps, or question in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs bg-base border border-border rounded-lg p-3 text-ink focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              id="submit-ticket-btn"
              type="submit"
              disabled={submitting || !subject || !description}
              className="bb-btn bb-btn-primary text-xs px-4 py-2 font-medium flex items-center gap-1.5"
            >
              <Send size={13} className={submitting ? "animate-spin" : ""} />
              {submitting ? "Submitting..." : "Submit Ticket"}
            </button>
          </div>
        </form>
      </section>

      {/* My Support Tickets List */}
      <section className="rounded-xl border border-border bg-panel overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border-soft flex items-center justify-between">
          <div className="text-xs font-semibold text-ink">
            Ticket History ({tickets.length})
          </div>
          <button
            type="button"
            onClick={loadTickets}
            disabled={loadingTickets}
            className="text-xs text-muted hover:text-ink flex items-center gap-1"
          >
            <RefreshCw size={12} className={loadingTickets ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {loadingTickets ? (
          <div className="p-8 text-center text-xs text-muted">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted">
            No support tickets submitted yet.
          </div>
        ) : (
          <div className="divide-y divide-border-soft">
            {tickets.map((t) => (
              <div key={t.id} className="p-4 hover:bg-base/30 transition space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink text-xs">{t.subject}</span>
                    {getStatusBadge(t.status)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted font-mono">
                    {getPriorityBadge(t.priority)}
                    <span>{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted line-clamp-2 leading-relaxed">
                  {t.description}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
