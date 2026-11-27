import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, ShieldAlert, Lock, Smartphone, Laptop, Check, Download, RefreshCw, Eye, EyeOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "react-hot-toast";
import { authApi } from "../../lib/api";
import { LIVE_MODE } from "../../lib/env";
import { useAuthStore } from "../../store/authStore";
import { ClipboardCopyButton } from "../../components/ui/ClipboardCopyButton";

interface SessionItem {
  id: string;
  user_agent?: string;
  ip_address?: string;
  created_at: string;
  last_active_at: string;
  is_current?: boolean;
}

const DEMO_SESSIONS: SessionItem[] = [
  {
    id: "sess_curr_1",
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0",
    ip_address: "192.168.1.42",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    last_active_at: new Date().toISOString(),
    is_current: true,
  },
  {
    id: "sess_old_2",
    user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    ip_address: "73.189.42.10",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    last_active_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    is_current: false,
  },
];

function parseUserAgent(ua?: string): { browser: string; os: string } {
  if (!ua) return { browser: "Web Browser", os: "Unknown OS" };
  let browser = "Web Browser";
  if (ua.includes("Chrome")) browser = "Google Chrome";
  else if (ua.includes("Firefox")) browser = "Mozilla Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Apple Safari";
  else if (ua.includes("Edge")) browser = "Microsoft Edge";

  let os = "Desktop";
  if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Android")) os = "Android";

  return { browser, os };
}

function calculatePasswordStrength(pass: string): { score: number; label: string; color: string } {
  if (!pass) return { score: 0, label: "Empty", color: "bg-border-soft" };
  let score = 0;
  if (pass.length >= 8) score += 1;
  if (pass.length >= 12) score += 1;
  if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;

  if (score <= 2) return { score: 1, label: "Weak", color: "bg-error" };
  if (score <= 3) return { score: 2, label: "Fair", color: "bg-warn" };
  if (score === 4) return { score: 3, label: "Good", color: "bg-accent" };
  return { score: 4, label: "Strong", color: "bg-ok" };
}

export function SecurityTab() {
  const { user, fetchMe } = useAuthStore();
  const mfaEnabled = Boolean(user?.mfa_enabled);

  // MFA Setup state
  const [mfaSetupData, setMfaSetupData] = useState<{
    secret: string;
    qr_code_url: string;
    backup_codes: string[];
  } | null>(null);
  const [completedBackupCodes, setCompletedBackupCodes] = useState<string[] | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [verifyingMfa, setVerifyingMfa] = useState(false);
  const [startingMfa, setStartingMfa] = useState(false);

  // Disable MFA state
  const [isDisableMfaOpen, setIsDisableMfaOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disablingMfa, setDisablingMfa] = useState(false);

  // Password Change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingAll, setRevokingAll] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      if (LIVE_MODE) {
        const res = await authApi.sessions.list();
        setSessions(Array.isArray(res) ? res : (res as any)?.sessions || []);
      } else {
        const stored = localStorage.getItem("forge_demo_sessions");
        setSessions(stored ? JSON.parse(stored) : DEMO_SESSIONS);
      }
    } catch {
      // Never show made-up sessions on a security screen in live mode.
      if (LIVE_MODE) {
        setSessions([]);
        toast.error("Failed to load active sessions");
      } else {
        setSessions(DEMO_SESSIONS);
      }
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // MFA Setup Handler
  const handleStartMfaSetup = async () => {
    setStartingMfa(true);
    try {
      if (LIVE_MODE) {
        const res = await authApi.mfa.setup();
        setMfaSetupData({
          secret: res.secret,
          qr_code_url: res.otpauth_uri,
          backup_codes: [],
        });
      } else {
        const secret = "JBSWY3DPEHPK3PXP";
        setMfaSetupData({
          secret,
          qr_code_url: `otpauth://totp/Forge:${user?.email || "developer"}?secret=${secret}&issuer=Forge`,
          backup_codes: [],
        });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to initialize MFA setup");
    } finally {
      setStartingMfa(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length < 6) {
      toast.error("Please enter a 6-digit authentication code.");
      return;
    }
    setVerifyingMfa(true);
    try {
      let codes: string[] = [];
      if (LIVE_MODE) {
        const res = await authApi.mfa.verifySetup(totpCode.trim());
        codes = res.backup_codes || [];
        await fetchMe();
      } else {
        codes = [
          "a89f-23c1",
          "51b7-90ef",
          "cc44-12ea",
          "7b91-450f",
          "9901-cd34",
          "e312-78fa",
          "34aa-8812",
          "b710-99ec",
        ];
        await new Promise((r) => setTimeout(r, 450));
      }
      setCompletedBackupCodes(codes);
      toast.success("Two-Factor Authentication is now enabled!");
      setMfaSetupData(null);
      setTotpCode("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Invalid code. Please try again.");
    } finally {
      setVerifyingMfa(false);
    }
  };

  const handleDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setDisablingMfa(true);
    try {
      if (LIVE_MODE) {
        await authApi.mfa.disable(disablePassword);
        await fetchMe();
      } else {
        await new Promise((r) => setTimeout(r, 400));
      }
      toast.success("Two-Factor Authentication has been disabled");
      setIsDisableMfaOpen(false);
      setDisablePassword("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Incorrect password");
    } finally {
      setDisablingMfa(false);
    }
  };

  const handleDownloadBackupCodes = () => {
    const codes = completedBackupCodes || mfaSetupData?.backup_codes;
    if (!codes || codes.length === 0) return;
    const content = `Forge AI - Emergency Backup Codes\nGenerated: ${new Date().toISOString()}\nAccount: ${user?.email}\n\n${codes.join("\n")}\n\nKeep these codes in a secure offline vault. Each code can be used once.`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forge-backup-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup codes downloaded");
  };

  // Password Change Handler
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      if (LIVE_MODE) {
        await authApi.changePassword({
          current_password: currentPassword,
          new_password: newPassword,
        });
      } else {
        await new Promise((r) => setTimeout(r, 500));
      }
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update password");
    } finally {
      setChangingPassword(false);
    }
  };

  // Session Revocation Handlers
  const handleRevokeSession = async (id: string) => {
    try {
      if (LIVE_MODE) {
        await authApi.sessions.revoke(id);
      } else {
        const updated = sessions.filter((s) => s.id !== id);
        setSessions(updated);
        localStorage.setItem("forge_demo_sessions", JSON.stringify(updated));
      }
      toast.success("Session revoked");
      loadSessions();
    } catch {
      toast.error("Failed to revoke session");
    }
  };

  const handleRevokeAllSessions = async () => {
    setRevokingAll(true);
    try {
      if (LIVE_MODE) {
        await authApi.sessions.revokeAll();
      } else {
        const currentOnly = sessions.filter((s) => s.is_current);
        setSessions(currentOnly);
        localStorage.setItem("forge_demo_sessions", JSON.stringify(currentOnly));
      }
      toast.success("Signed out of all other devices");
      loadSessions();
    } catch {
      toast.error("Failed to revoke sessions");
    } finally {
      setRevokingAll(false);
    }
  };

  const strength = calculatePasswordStrength(newPassword);

  return (
    <div id="settings-security-panel" className="space-y-8">
      {/* Two-Factor Authentication Card */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <ShieldCheck size={16} className="text-accent" />
              Two-Factor Authentication (TOTP)
            </h2>
            <p className="text-xs text-muted mt-1">
              Add an extra layer of security using Google Authenticator, 1Password, or Yubikey.
            </p>
          </div>

          <div>
            {mfaEnabled ? (
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono bg-ok/10 text-ok border border-ok/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <Check size={12} strokeWidth={3} /> Active & Enforced
                </span>
                <button
                  type="button"
                  onClick={() => setIsDisableMfaOpen(true)}
                  className="bb-btn bb-btn-subtle text-xs px-2.5 py-1 text-error hover:bg-error/10"
                >
                  Disable
                </button>
              </div>
            ) : (
              <button
                id="enable-mfa-btn"
                type="button"
                onClick={handleStartMfaSetup}
                disabled={startingMfa || !!mfaSetupData}
                className="bb-btn bb-btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5"
              >
                <Smartphone size={14} />
                {startingMfa ? "Initializing..." : "Enable 2FA"}
              </button>
            )}
          </div>
        </div>

        {/* 2FA Setup Flow Drawer / Card */}
        {mfaSetupData && !mfaEnabled && (
          <div className="p-5 rounded-xl border border-accent/40 bg-accent/5 space-y-5 animate-in fade-in duration-200">
            <div className="border-b border-border-soft pb-3">
              <h3 className="text-xs font-semibold text-ink">Set Up Authenticator App</h3>
              <p className="text-[11px] text-muted mt-0.5">
                Scan the QR code with your authenticator app, or enter the secret key manually.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* QR Code */}
              <div className="md:col-span-4 flex flex-col items-center justify-center p-3 rounded-lg bg-panel shadow-sm border border-border-soft">
                <QRCodeSVG value={mfaSetupData.qr_code_url} size={160} level="M" />
                <span className="text-[10px] text-muted font-mono mt-2">Scan in Authenticator</span>
              </div>

              {/* Secret and Code Input */}
              <div className="md:col-span-8 space-y-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-ink block">Manual Secret Key</span>
                  <div className="flex items-center justify-between gap-2 bg-base p-2 rounded-lg border border-border-soft">
                    <code className="text-xs font-mono text-accent font-semibold tracking-wider">
                      {mfaSetupData.secret}
                    </code>
                    <ClipboardCopyButton
                      text={mfaSetupData.secret}
                      successMessage="Secret key copied"
                      className="bb-btn bb-btn-subtle text-xs py-1 px-2 h-6"
                    />
                  </div>
                </div>

                <form onSubmit={handleVerifyMfa} className="space-y-3 pt-2">
                  <label htmlFor="totp-code-input" className="text-xs font-medium text-ink block">
                    Enter 6-Digit Code from Authenticator
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="totp-code-input"
                      type="text"
                      maxLength={6}
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      className="w-40 text-center font-mono text-base tracking-widest bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <button
                      type="submit"
                      disabled={verifyingMfa || totpCode.length < 6}
                      className="bb-btn bb-btn-primary text-xs px-4 py-2 font-medium"
                    >
                      {verifyingMfa ? "Verifying..." : "Verify & Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMfaSetupData(null)}
                      className="bb-btn bb-btn-subtle text-xs px-3 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Emergency Backup Codes Box */}
            {mfaSetupData.backup_codes && mfaSetupData.backup_codes.length > 0 && (
              <div className="pt-3 border-t border-border-soft space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink">Emergency Recovery Backup Codes</span>
                  <button
                    type="button"
                    onClick={handleDownloadBackupCodes}
                    className="text-xs text-accent hover:underline flex items-center gap-1"
                  >
                    <Download size={12} /> Download (.txt)
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs text-ink bg-base p-3 rounded-lg border border-border-soft">
                  {mfaSetupData.backup_codes.map((code, idx) => (
                    <span key={idx} className="bg-panel px-2 py-1 rounded text-center border border-border-soft">
                      {code}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Password Management */}
      <section className="rounded-xl border border-border bg-panel p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Lock size={15} className="text-accent" />
            Password & Credentials
          </h2>
          <p className="text-xs text-muted mt-1">
            Ensure your account uses a robust, unique password to prevent unauthorized access.
          </p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <label htmlFor="current-pass-input" className="text-xs font-medium text-ink block">
              Current Password
            </label>
            <div className="relative">
              <input
                id="current-pass-input"
                type={showCurrentPass ? "text" : "password"}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full text-xs bg-base border border-border rounded-lg pl-3 pr-10 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPass(!showCurrentPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              >
                {showCurrentPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-pass-input" className="text-xs font-medium text-ink flex items-center justify-between">
              <span>New Password</span>
              {newPassword && (
                <span className="text-[11px] font-mono text-muted">
                  Strength: <strong className="text-ink">{strength.label}</strong>
                </span>
              )}
            </label>
            <div className="relative">
              <input
                id="new-pass-input"
                type={showNewPass ? "text" : "password"}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full text-xs bg-base border border-border rounded-lg pl-3 pr-10 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              >
                {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {/* Strength Bar */}
            {newPassword && (
              <div className="h-1.5 w-full bg-base rounded-full overflow-hidden flex gap-1 mt-1">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-full flex-1 transition-colors ${
                      step <= strength.score ? strength.color : "bg-border-soft"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm-pass-input" className="text-xs font-medium text-ink block">
              Confirm New Password
            </label>
            <input
              id="confirm-pass-input"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="pt-2">
            <button
              id="change-password-btn"
              type="submit"
              disabled={changingPassword || !currentPassword || !newPassword}
              className="bb-btn bb-btn-primary text-xs px-4 py-2 font-medium"
            >
              {changingPassword ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </section>

      {/* Active Device Sessions */}
      <section className="rounded-xl border border-border bg-panel overflow-hidden shadow-sm">
        <div className="p-6 border-b border-border-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Laptop size={15} className="text-accent" />
              Active Sessions & Devices
            </h2>
            <p className="text-xs text-muted mt-1">
              Devices and browsers authenticated with your Forge credentials.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRevokeAllSessions}
              disabled={revokingAll || sessions.length <= 1}
              className="bb-btn bb-btn-subtle text-xs px-3 py-1.5 text-error hover:bg-error/10"
            >
              {revokingAll ? "Signing out..." : "Sign Out All Other Devices"}
            </button>
            <button
              type="button"
              onClick={loadSessions}
              disabled={loadingSessions}
              className="p-1.5 text-muted hover:text-ink rounded transition"
              title="Refresh sessions"
            >
              <RefreshCw size={13} className={loadingSessions ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="divide-y divide-border-soft">
          {sessions.map((sess) => {
            const { browser, os } = parseUserAgent(sess.user_agent);
            return (
              <div key={sess.id} className="p-4 flex items-center justify-between gap-4 hover:bg-base/30 transition">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-base border border-border-soft flex items-center justify-center text-muted shrink-0">
                    <Laptop size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ink">
                        {browser} on {os}
                      </span>
                      {sess.is_current && (
                        <span className="text-[10px] font-mono bg-ok/15 text-ok border border-ok/30 px-1.5 py-0.2 rounded font-semibold">
                          This Device
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted font-mono mt-0.5">
                      IP: {sess.ip_address || "Hidden"} • Last active: {new Date(sess.last_active_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                {!sess.is_current && (
                  <button
                    type="button"
                    onClick={() => handleRevokeSession(sess.id)}
                    className="bb-btn bb-btn-subtle text-xs py-1 px-2 text-muted hover:text-error hover:bg-error/10"
                  >
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Disable MFA Confirmation Modal */}
      {isDisableMfaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-error/30 bg-panel p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-error">
              <ShieldAlert className="h-6 w-6" />
              <h3 className="text-sm font-semibold text-ink">Disable Two-Factor Authentication?</h3>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Disabling 2FA makes your account significantly more vulnerable to credential stuffing and phishing attacks. Enter your password to confirm.
            </p>

            <form onSubmit={handleDisableMfa} className="space-y-4">
              <input
                type="password"
                required
                placeholder="Your account password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                className="w-full text-xs bg-base border border-border rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              />

              <div className="pt-2 border-t border-border-soft flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDisableMfaOpen(false)}
                  className="bb-btn bb-btn-subtle text-xs px-3.5 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disablingMfa || !disablePassword}
                  className="bb-btn bb-btn-danger text-xs px-4 py-2 font-medium"
                >
                  {disablingMfa ? "Disabling..." : "Disable 2FA"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Completed 2FA Backup Codes Dialog */}
      {completedBackupCodes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/60 backdrop-blur-xs">
          <div className="bg-panel border border-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-ok">
              <ShieldCheck size={24} />
              <h3 className="text-sm font-semibold text-ink">Two-Factor Authentication Active</h3>
            </div>
            <p className="text-xs text-muted">
              Save your emergency backup recovery codes now. If you lose access to your authenticator app, these codes are the only way to recover your account.
            </p>

            <div className="grid grid-cols-2 gap-2 font-mono text-xs text-ink bg-base p-3 rounded-lg border border-border-soft">
              {completedBackupCodes.map((code, idx) => (
                <span key={idx} className="bg-panel px-2 py-1 rounded text-center border border-border-soft">
                  {code}
                </span>
              ))}
            </div>

            <div className="pt-2 border-t border-border-soft flex items-center justify-between">
              <button
                type="button"
                onClick={handleDownloadBackupCodes}
                className="bb-btn bb-btn-subtle text-xs px-3 py-2 flex items-center gap-1.5"
              >
                <Download size={13} />
                Download Codes (.txt)
              </button>
              <button
                type="button"
                onClick={() => setCompletedBackupCodes(null)}
                className="bb-btn bb-btn-primary text-xs px-4 py-2 font-medium"
              >
                I Have Saved Them
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
