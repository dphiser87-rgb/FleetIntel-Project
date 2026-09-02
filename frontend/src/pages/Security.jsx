import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, ShieldWarning, Copy, ArrowsClockwise, LockKey } from "@phosphor-icons/react";
import { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const LOCKOUT_MINUTES = 15; // mirrors backend server.py's LOCKOUT_COOLDOWN_MINUTES

export default function Security() {
  const { user } = useAuth();
  const canManage = user && ["admin", "manager"].includes(user.role);
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [recoveryStatus, setRecoveryStatus] = useState(null);
  const [minPasswordLength, setMinPasswordLength] = useState(null);
  const [lockoutEnabled, setLockoutEnabled] = useState(false);
  const [lockoutThreshold, setLockoutThreshold] = useState(5);

  const load = () => {
    api.get("/auth/2fa/status").then(r => setStatus(r.data.enabled));
    api.get("/auth/2fa/recovery-status").then(r => setRecoveryStatus(r.data)).catch(() => {});
    api.get("/workspace").then((r) => {
      setMinPasswordLength(r.data.workspace.min_password_length ?? 8);
      setLockoutEnabled(r.data.workspace.lockout_enabled ?? false);
      setLockoutThreshold(r.data.workspace.lockout_threshold ?? 5);
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const saveMinPasswordLength = async (n) => {
    setMinPasswordLength(n);
    try { await api.patch("/workspace", { min_password_length: n }); } catch (e) { toast.error("Failed to save"); }
  };
  const toggleLockout = async () => {
    const next = !lockoutEnabled;
    setLockoutEnabled(next);
    try { await api.patch("/workspace", { lockout_enabled: next }); } catch (e) { toast.error("Failed to save"); setLockoutEnabled(!next); }
  };
  const saveLockoutThreshold = async (n) => {
    setLockoutThreshold(n);
    try { await api.patch("/workspace", { lockout_threshold: n }); } catch (e) { toast.error("Failed to save"); }
  };

  const startSetup = async () => {
    try {
      const { data } = await api.post("/auth/2fa/setup");
      setSetup(data);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const enable = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post("/auth/2fa/enable", { code });
      setRecoveryCodes(data.recovery_codes);
      toast.success("Two-factor enabled — save your recovery codes!");
      setSetup(null); setCode(""); load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const regenerateRecovery = async () => {
    const c = window.prompt("Enter current 6-digit code to regenerate recovery codes:");
    if (!c) return;
    try {
      const { data } = await api.post("/auth/2fa/regenerate-recovery", { code: c });
      setRecoveryCodes(data.recovery_codes);
      toast.success("New recovery codes generated");
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const disable = async () => {
    const c = window.prompt("Enter current 6-digit code to disable 2FA:");
    if (!c) return;
    try {
      await api.post("/auth/2fa/disable", { code: c });
      toast.success("Two-factor disabled");
      load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6">
        <div className="overline">Account</div>
        <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="security-title">Security</h1>
      </header>

      <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        <div className="bg-[#121214] border border-border p-6" data-testid="twofa-card">
          <div className="flex items-center gap-3 mb-1">
            {status ? <ShieldCheck size={22} className="text-primary" weight="bold" /> : <ShieldWarning size={22} className="text-[#FFCC00]" />}
            <div className="overline">Two-factor authentication</div>
          </div>
          <h3 className="font-display text-2xl font-bold tracking-tight">TOTP (Google Authenticator, 1Password)</h3>
          <div className="mt-2 text-sm text-muted-foreground">
            Status: <span className={status ? "text-primary mono" : "text-[#FFCC00] mono"}>{status === null ? "…" : status ? "Enabled" : "Not enabled"}</span>
          </div>

          {!status && !setup && (
            <button onClick={startSetup} data-testid="start-2fa" className="mt-4 bg-primary text-primary-foreground px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90">
              Enable 2FA
            </button>
          )}

          {!status && setup && (
            <div className="mt-6 space-y-4">
              <div className="text-sm">1. Scan this QR code with your authenticator app:</div>
              <img src={setup.qr} alt="QR" className="w-48 h-48 border border-border bg-white p-2" data-testid="totp-qr" />
              <div className="text-xs text-muted-foreground">
                Or enter this secret manually: <span className="mono text-white select-all">{setup.secret}</span>
              </div>
              <form onSubmit={enable} className="space-y-3">
                <div className="text-sm">2. Enter the 6-digit code from your app:</div>
                <input value={code} onChange={(e) => setCode(e.target.value)} required maxLength={6}
                  placeholder="000000" data-testid="totp-code"
                  className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 mono text-lg tracking-widest text-center focus:border-primary focus:outline-none" />
                <button type="submit" disabled={busy} data-testid="confirm-2fa" className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60">
                  {busy ? "Enabling…" : "Confirm & enable"}
                </button>
              </form>
            </div>
          )}

          {status && (
            <div className="mt-4 space-y-2">
              <div className="text-sm text-muted-foreground">2FA is active. You'll need a 6-digit code on every login.</div>
              {recoveryStatus && (
                <div className="text-xs mt-2 border border-border p-3 bg-[#0b0b0d]">
                  <div className="flex items-center justify-between">
                    <div><span className="mono text-primary">{recoveryStatus.unused}</span> of <span className="mono">{recoveryStatus.total}</span> recovery codes remaining</div>
                    <button onClick={regenerateRecovery} className="text-xs uppercase tracking-widest text-primary hover:text-white flex items-center gap-1" data-testid="regen-recovery">
                      <ArrowsClockwise size={12} /> Regenerate
                    </button>
                  </div>
                </div>
              )}
              <button onClick={disable} data-testid="disable-2fa" className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
                Disable 2FA
              </button>
            </div>
          )}
          {recoveryCodes && (
            <div className="mt-4 border-2 border-primary bg-primary/10 p-4" data-testid="recovery-codes">
              <div className="flex items-center justify-between mb-3">
                <div className="overline text-primary">Your recovery codes · save now</div>
                <button onClick={() => {
                  navigator.clipboard.writeText(recoveryCodes.join("\n"));
                  toast.success("Recovery codes copied");
                }} className="flex items-center gap-1 text-xs uppercase tracking-widest text-primary hover:text-white" data-testid="copy-recovery"><Copy size={12} /> Copy all</button>
              </div>
              <div className="grid grid-cols-2 gap-2 mono text-sm">
                {recoveryCodes.map(c => <div key={c} className="bg-[#0b0b0d] border border-primary/40 p-2 text-center tracking-widest">{c}</div>)}
              </div>
              <div className="text-xs text-muted-foreground mt-3">Each code works exactly once during login when you don't have your authenticator. Store them somewhere safe — we can't show them again.</div>
              <button onClick={() => setRecoveryCodes(null)} className="mt-3 text-xs uppercase tracking-widest text-white/60 hover:text-white">I've saved them ✓</button>
            </div>
          )}
        </div>

        <div className="bg-[#121214] border border-border p-6" data-testid="password-policy-card">
          <div className="flex items-center gap-3 mb-1">
            <LockKey size={22} className="text-primary" />
            <div className="overline">Access policy</div>
          </div>
          <h3 className="font-display text-2xl font-bold tracking-tight">Password & lockout</h3>
          <div className="mt-2 text-sm text-muted-foreground">
            Applies workspace-wide, to every teammate's login.
            {!canManage && " Only admins and managers can change this."}
          </div>

          <div className="mt-5">
            <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Minimum password length</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="6" max="64"
                value={minPasswordLength ?? ""}
                disabled={!canManage || minPasswordLength === null}
                data-testid="min-password-length-input"
                onChange={(e) => saveMinPasswordLength(Math.max(6, Number(e.target.value) || 8))}
                className="w-20 bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm mono focus:border-primary focus:outline-none disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">characters</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1.5">
              Enforced when a new teammate registers or accepts an invite. Doesn't cover a self-service password reset — that flow is hosted by Supabase outside this app.
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-border">
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Lock account after failed logins</label>
              <button
                type="button"
                disabled={!canManage}
                onClick={toggleLockout}
                data-testid="toggle-lockout"
                className={`shrink-0 w-11 h-6 rounded-full border transition-colors relative disabled:opacity-50 ${lockoutEnabled ? "bg-primary border-primary" : "bg-[#0b0b0d] border-border"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${lockoutEnabled ? "translate-x-[22px]" : "translate-x-0"}`} />
              </button>
            </div>
            {lockoutEnabled && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-sm text-muted-foreground">Lock after</span>
                <input
                  type="number" min="3" max="20"
                  value={lockoutThreshold}
                  disabled={!canManage}
                  data-testid="lockout-threshold-input"
                  onChange={(e) => saveLockoutThreshold(Math.max(3, Number(e.target.value) || 5))}
                  className="w-16 bg-[#0b0b0d] border border-border px-3 py-2 text-sm mono focus:border-primary focus:outline-none disabled:opacity-50"
                />
                <span className="text-sm text-muted-foreground">failed attempts, for {LOCKOUT_MINUTES} minutes</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-2">
              A locked teammate can be unlocked early from their profile on the Team page.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
