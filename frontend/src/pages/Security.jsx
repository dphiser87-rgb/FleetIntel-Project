import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ShieldCheck, ShieldWarning, QrCode, EnvelopeSimple, ClockCounterClockwise, Copy, ArrowsClockwise } from "@phosphor-icons/react";
import { formatApiErrorDetail } from "@/lib/api";

export default function Security() {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [digestSending, setDigestSending] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [recoveryStatus, setRecoveryStatus] = useState(null);

  const load = () => {
    api.get("/auth/2fa/status").then(r => setStatus(r.data.enabled));
    api.get("/auth/2fa/recovery-status").then(r => setRecoveryStatus(r.data)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

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

  const sendDigest = async () => {
    setDigestSending(true);
    try {
      const { data } = await api.post("/workspace/send-digest");
      if (data.sent) toast.success("Weekly digest emailed to the workspace owner");
      else toast.error("No supplier email configured or send failed");
    } catch (e) { toast.error("Failed"); }
    finally { setDigestSending(false); }
  };

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6">
        <div className="overline">Account</div>
        <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="security-title">Security & schedule</h1>
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

        <div className="bg-[#121214] border border-border p-6" data-testid="digest-card">
          <div className="flex items-center gap-3 mb-1">
            <ClockCounterClockwise size={22} className="text-primary" />
            <div className="overline">Automated reports</div>
          </div>
          <h3 className="font-display text-2xl font-bold tracking-tight">Weekly digest email</h3>
          <div className="mt-2 text-sm text-muted-foreground">
            Every Monday at 13:00 UTC we send the workspace owner a PDF summary of KPIs, cost anomalies, pending jobs and low-stock parts.
          </div>
          <div className="mt-4 flex items-center gap-2">
            <EnvelopeSimple size={16} className="text-muted-foreground" />
            <div className="text-xs text-muted-foreground">
              Recipient: <span className="mono text-white">workspace owner email</span>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <button onClick={sendDigest} disabled={digestSending} data-testid="send-digest-now" className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60">
              <EnvelopeSimple size={14} /> {digestSending ? "Sending…" : "Send digest now"}
            </button>
            <div className="text-xs text-muted-foreground mt-3">
              Use this to preview what your scheduled email looks like.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
