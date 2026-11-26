import { useState } from "react";
import { User, Shield, Calendar, CreditCard, Check, Sparkles } from "lucide-react";
import { toast } from "react-hot-toast";
import { authApi } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { useAuthStore } from "../../store/authStore";
import { ClipboardCopyButton } from "../../components/ui/ClipboardCopyButton";
import type { ProfileFormData } from "./types";

const AVATAR_PRESETS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
];

const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (US & Canada - ET)" },
  { value: "America/Chicago", label: "Central Time (US & Canada - CT)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada - MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada - PT)" },
  { value: "Europe/London", label: "London / GMT" },
  { value: "Europe/Paris", label: "Central European Time (CET)" },
  { value: "Europe/Berlin", label: "Berlin / Frankfurt (CET)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST)" },
  { value: "Asia/Kolkata", label: "India Standard Time (IST)" },
  { value: "Asia/Singapore", label: "Singapore / Hong Kong (SGT)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (AET)" },
];

export function ProfileTab() {
  const { user, fetchMe } = useAuthStore();
  const [saving, setSaving] = useState(false);

  const existingPrefs = (user?.preferences as Record<string, any>) || {};

  const [form, setForm] = useState<ProfileFormData>({
    name: user?.name || "Developer",
    email: user?.email || "developer@forge.dev",
    avatarUrl: user?.avatar_url || "",
    role: existingPrefs.role || "Full Stack Architect",
    organization: existingPrefs.organization || "Engineering Team",
    timezone: existingPrefs.timezone || "America/Los_Angeles",
    bio: existingPrefs.bio || "Building high-performance software with Forge autonomous agents.",
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (LIVE_MODE) {
        await authApi.updateProfile({
          name: form.name.trim(),
          avatar_url: form.avatarUrl.trim() || undefined,
          preferences: {
            ...existingPrefs,
            role: form.role,
            organization: form.organization,
            timezone: form.timezone,
            bio: form.bio,
          },
        });
        await fetchMe();
      } else {
        // Demo optimistic simulation
        await new Promise((r) => setTimeout(r, 450));
      }
      toast.success("Profile changes saved successfully");
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to update profile";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Recently";

  return (
    <div id="settings-profile-panel" className="space-y-8">
      {/* Account Overview Card */}
      <div className="rounded-xl border border-border bg-panel p-6 shadow-m3-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-border">
          <div className="flex items-center gap-4">
            <div className="relative">
              {form.avatarUrl ? (
                <img
                  src={form.avatarUrl}
                  alt={form.name}
                  className="h-16 w-16 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-accent-soft border border-accent/30 text-accent flex items-center justify-center font-semibold text-xl">
                  {form.name ? form.name.charAt(0).toUpperCase() : "U"}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-ok border-2 border-panel" title="Online" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-ink">{form.name || "Forge User"}</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase bg-accent-soft text-accent border border-accent/30">
                  {user?.plan || "Pro"} Plan
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5 font-mono">{form.email}</p>
              <p className="text-xs text-muted mt-1">
                {form.role} • {form.organization}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-ink bg-panel-alt border border-border rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <CreditCard size={14} className="text-accent" />
              <span>
                Credits: <strong className="text-ink font-semibold">{user?.credits ?? 612}</strong>
              </span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-muted" />
              <span>Joined {memberSince}</span>
            </div>
          </div>
        </div>

        {/* User identifier copy row */}
        <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-muted font-mono">
            <Shield size={13} className="text-accent" />
            <span>Workspace Account ID:</span>
            <code className="font-mono text-ink bg-panel-alt px-2 py-0.5 rounded-md border border-border font-medium">
              {user?.id || "usr_forge_default"}
            </code>
          </div>
          <ClipboardCopyButton
            text={user?.id || "usr_forge_default"}
            successMessage="User ID copied"
            className="rounded-lg border border-border bg-panel-alt text-ink font-mono font-medium text-xs py-1 px-2.5 h-7 hover:border-accent/50 transition-colors self-start sm:self-auto"
          />
        </div>
      </div>

      {/* Main Profile Form */}
      <form onSubmit={handleSave} className="rounded-xl border border-border bg-panel p-6 space-y-6 shadow-m3-1">
        <div className="border-b border-border pb-4">
          <h2 className="text-sm font-semibold text-ink">Personal Information</h2>
          <p className="text-xs text-muted mt-1">
            Update your profile identity and developer credentials across Forge AI.
          </p>
        </div>

        {/* Avatar Selection */}
        <div className="space-y-3">
          <span className="text-xs font-medium text-ink block">Profile Photo</span>
          <div className="flex flex-wrap items-center gap-3">
            {AVATAR_PRESETS.map((url, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, avatarUrl: url }))}
                className={`relative rounded-lg h-11 w-11 overflow-hidden border transition-all ${
                  form.avatarUrl === url
                    ? "border-accent ring-2 ring-accent/40 scale-105"
                    : "border-border opacity-80 hover:opacity-100"
                }`}
                title={`Preset avatar ${idx + 1}`}
              >
                <img src={url} alt={`Avatar preset ${idx + 1}`} className="h-full w-full object-cover" />
                {form.avatarUrl === url && (
                  <div className="absolute inset-0 bg-accent/30 flex items-center justify-center text-ink">
                    <Check size={14} strokeWidth={3} />
                  </div>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, avatarUrl: "" }))}
              className="px-2.5 py-1 text-xs font-medium rounded-lg border border-border text-muted hover:text-error hover:border-error/40 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="mt-2">
            <input
              id="profile-avatar-url-input"
              type="url"
              placeholder="Or paste an image URL (https://...)"
              value={form.avatarUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
              className="w-full text-xs font-mono bg-panel-alt border border-border rounded-lg px-3 py-2 text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
            />
          </div>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label htmlFor="profile-name-input" className="text-xs font-medium text-ink flex items-center gap-1.5">
              <User size={13} className="text-muted" />
              Full Name
            </label>
            <input
              id="profile-name-input"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full text-xs bg-panel-alt border border-border rounded-lg px-3 py-2 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
              placeholder="Your Name"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-email-input" className="text-xs font-medium text-ink flex items-center justify-between">
              <span>Account Email</span>
              <span className="text-[10px] font-mono font-semibold text-ok bg-ok/15 px-1.5 py-0.5 rounded border border-ok/30">Verified</span>
            </label>
            <input
              id="profile-email-input"
              type="email"
              disabled
              value={form.email}
              className="w-full text-xs font-mono bg-panel-alt/50 border border-border rounded-lg px-3 py-2 text-muted cursor-not-allowed"
            />
            <p className="text-[11px] text-muted">Contact security support to change verified account email.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-role-input" className="text-xs font-medium text-ink block">
              Role / Specialization
            </label>
            <select
              id="profile-role-input"
              value={form.role}
              onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              className="w-full text-xs bg-panel-alt border border-border rounded-lg px-3 py-2 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
            >
              <option value="Full Stack Architect">Full Stack Architect</option>
              <option value="Senior Frontend Engineer">Senior Frontend Engineer</option>
              <option value="Backend Systems Engineer">Backend Systems Engineer</option>
              <option value="AI / ML Systems Engineer">AI / ML Systems Engineer</option>
              <option value="Engineering Manager / Lead">Engineering Manager / Lead</option>
              <option value="Product Engineer">Product Engineer</option>
              <option value="DevOps & Cloud Architect">DevOps & Cloud Architect</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="profile-org-input" className="text-xs font-medium text-ink block">
              Organization / Team
            </label>
            <input
              id="profile-org-input"
              type="text"
              value={form.organization}
              onChange={(e) => setForm((prev) => ({ ...prev, organization: e.target.value }))}
              className="w-full text-xs bg-panel-alt border border-border rounded-lg px-3 py-2 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
              placeholder="e.g. Platform Team, ACME Corp"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="profile-timezone-input" className="text-xs font-medium text-ink block">
              Timezone
            </label>
            <select
              id="profile-timezone-input"
              value={form.timezone}
              onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
              className="w-full text-xs bg-panel-alt border border-border rounded-lg px-3 py-2 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted">Used to schedule automated daily summaries and fleet maintenance windows.</p>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="profile-bio-input" className="text-xs font-medium text-ink flex items-center justify-between">
              <span>Developer Bio / Team Instructions</span>
              <span className="text-[10px] text-muted flex items-center gap-1 font-mono">
                <Sparkles size={11} className="text-accent" /> Read by autonomous agents
              </span>
            </label>
            <textarea
              id="profile-bio-input"
              rows={3}
              value={form.bio}
              onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
              className="w-full text-xs bg-panel-alt border border-border rounded-lg p-3 text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 transition-all resize-none"
              placeholder="Provide background information or persistent architectural guidelines for your agents..."
            />
          </div>
        </div>

        <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
          <button
            id="profile-save-btn"
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent text-on-ink font-semibold text-xs px-5 py-2.5 hover:opacity-90 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving changes..." : "Save Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}
