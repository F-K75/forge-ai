import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Activity,
  Search,
  Users,
  CreditCard,
  Zap,
  Database,
  Server,
  AlertTriangle,
  Download,
} from "lucide-react";
import { adminApi } from "../lib/api";
import { LIVE_MODE } from "../lib/env";
import { StatusPill } from "../components/StatusPill";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  plan: string;
  credits: number;
  created_at: string;
}

interface AdminBuildRow {
  id: string;
  status: string;
  credits_used: number;
  debug_iterations: number;
  created_at: string;
}

interface AnalyticsOverview {
  total_users: number;
  total_builds: number;
  total_revenue: number;
  active_subscriptions: number;
}

interface ServiceStatus {
  status: string;
  [key: string]: unknown;
}

interface SystemHealth {
  status: string;
  database: ServiceStatus;
  redis: ServiceStatus;
  uptime_seconds: number;
}

// Mirrors the status normalization already used in ProjectHistory.tsx, since
// StatusPill's vocabulary (complete/running/debugging/failed) predates the
// backend's BuildStatus enum (pending/running/success/failed/debugging).
function toPillStatus(status: string): "complete" | "running" | "debugging" | "failed" {
  if (status === "success") return "complete";
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  return "debugging";
}

export default function AdminConsole() {
  const [search, setSearch] = useState("");

  const { data: overview } = useQuery<AnalyticsOverview>({
    queryKey: ["admin-overview"],
    queryFn: () => adminApi.overview(),
    enabled: LIVE_MODE,
  });

  const { data: health } = useQuery<SystemHealth>({
    queryKey: ["admin-health"],
    queryFn: () => adminApi.systemHealth(),
    enabled: LIVE_MODE,
    refetchInterval: LIVE_MODE ? 30_000 : false,
  });

  const { data: buildsData } = useQuery<{ builds: AdminBuildRow[] }>({
    queryKey: ["admin-builds"],
    queryFn: () => adminApi.listBuilds(),
    enabled: LIVE_MODE,
  });

  const { data: usersData, refetch: refetchUsers } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["admin-users", search],
    queryFn: () => adminApi.listUsers(search || undefined),
    enabled: LIVE_MODE,
  });

  const creditMutation = useMutation({
    mutationFn: (vars: { userId: string; amount: number }) =>
      adminApi.adjustCredits({ user_id: vars.userId, amount: vars.amount, reason: "admin_adjustment" }),
    onSuccess: () => refetchUsers(),
  });

  const [exporting, setExporting] = useState(false);
  const handleExportUsers = async () => {
    setExporting(true);
    try {
      const blob = await adminApi.exportUsers(search || undefined);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `forge-users-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to export users");
    } finally {
      setExporting(false);
    }
  };

  const builds = buildsData?.builds ?? [];
  const users = usersData?.users ?? [];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center gap-2.5 mb-7">
        <Activity size={18} className="text-accent" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-ink">Admin console</h1>
      </header>

      {!LIVE_MODE && (
        <div className="mb-7 bg-warn/10 border border-warn/30 text-warn px-4 py-3 rounded-xl text-sm">
          Demo mode — connect a live backend to see real platform data.
        </div>
      )}

      {/* Stat cards */}
      <section aria-label="Platform statistics" className="mb-7">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total users" value={overview?.total_users ?? "—"} icon={Users} hue="#6366F1" />
          <StatCard label="Total builds" value={overview?.total_builds ?? "—"} icon={Activity} hue="#22D3EE" />
          <StatCard
            label="Total revenue"
            value={overview ? `$${overview.total_revenue.toLocaleString()}` : "—"}
            icon={CreditCard}
            hue="#34D399"
          />
          <StatCard label="Active subscriptions" value={overview?.active_subscriptions ?? "—"} icon={Zap} hue="#F59E0B" />
        </div>
      </section>

      {/* Two-column: system health + builds */}
      <div className="flex flex-col lg:flex-row gap-5 mb-7">
        <section aria-label="System health" className="lg:w-1/3 bg-panel border border-border rounded-xl p-4">
          <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-3">System health</h2>
          <div className="divide-y divide-border-soft">
            <ServiceRow icon={Server} label="API" status={health?.status} />
            <ServiceRow icon={Database} label="Database" status={health?.database?.status as string | undefined} />
            <ServiceRow icon={Zap} label="Redis" status={health?.redis?.status as string | undefined} />
          </div>
        </section>

        <section aria-label="Recent builds" className="flex-1 bg-panel border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-xs font-medium text-faint uppercase tracking-wide">Recent builds</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">Build</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">Credits</th>
                  <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {builds.map((b) => (
                  <tr key={b.id} className="border-t border-border-soft hover:bg-panel-alt transition motion-reduce:transition-none">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-muted">{b.id.slice(0, 8)}…</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={toPillStatus(b.status)} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-mono text-xs text-ink">{b.credits_used}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-mono text-xs text-muted">{new Date(b.created_at).toLocaleDateString()}</span>
                    </td>
                  </tr>
                ))}
                {builds.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-faint">
                      No builds yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Users */}
      <section aria-label="Users" className="bg-panel border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-xs font-medium text-faint uppercase tracking-wide">Users</h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="bg-panel-alt border border-border rounded-lg pl-8 pr-4 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent w-64 transition motion-reduce:transition-none"
              />
            </div>
            <button
              onClick={handleExportUsers}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-ink hover:bg-panel-alt focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors motion-reduce:transition-none disabled:opacity-50 shrink-0"
            >
              <Download size={13} aria-hidden="true" />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-soft">
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">Email</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide">Plan</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">Credits</th>
                <th className="px-4 py-2.5 text-[10px] font-medium text-faint uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border-soft hover:bg-panel-alt transition motion-reduce:transition-none">
                  <td className="px-4 py-2.5 text-sm text-ink">{u.email}</td>
                  <td className="px-4 py-2.5 text-sm text-muted">{u.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm capitalize text-muted">{u.plan}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-mono text-xs text-ink">{u.credits}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => creditMutation.mutate({ userId: u.id, amount: 100 })}
                      disabled={creditMutation.isPending}
                      className="text-xs px-3 py-1 bg-accent hover:opacity-90 text-white rounded transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
                    >
                      +100 credits
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-faint">
                    {search ? `No users match "${search}"` : "No users yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  hue,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  hue: string;
}) {
  return (
    <div className="bg-panel border border-border rounded-xl p-4">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
        style={{ backgroundColor: `${hue}1F`, border: `1px solid ${hue}40` }}
      >
        <Icon size={16} style={{ color: hue }} aria-hidden="true" />
      </div>
      <p className="font-mono text-[1.4rem] font-bold text-ink leading-none mb-1">{value}</p>
      <p className="text-xs text-faint">{label}</p>
    </div>
  );
}

function ServiceRow({ icon: Icon, label, status }: { icon: typeof Server; label: string; status?: string }) {
  const ok = status === "ok";
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-1">
      <Icon size={14} className="text-faint shrink-0" aria-hidden="true" />
      <span className="text-sm text-ink flex-1 truncate">{label}</span>
      {status === undefined ? (
        <span className="font-mono text-xs text-faint">—</span>
      ) : ok ? (
        <span className="font-mono text-xs text-ok">ok</span>
      ) : (
        <span className="flex items-center gap-1 font-mono text-xs text-error">
          <AlertTriangle size={11} aria-hidden="true" /> {status}
        </span>
      )}
    </div>
  );
}
