import React, { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { formatApiErrorDetail, api } from "@/lib/api";
import { ChartLine, CheckCircle } from "@phosphor-icons/react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password !== confirm) { setErr("Passwords don't match"); return; }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
      toast.success("Password updated");
    } catch (e) {
      const msg = formatApiErrorDetail(e.response?.data?.detail) || e.message;
      setErr(msg); toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background noise-bg flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary flex items-center justify-center">
            <ChartLine size={22} weight="bold" color="#fff" />
          </div>
          <div>
            <div className="font-display font-black text-xl leading-none tracking-tight">FleetIntel</div>
            <div className="overline mt-1">Cost intelligence platform</div>
          </div>
        </div>

        {!token ? (
          <div className="text-sm text-primary border border-primary/40 bg-primary/10 px-3 py-2" data-testid="reset-no-token">
            This link is missing its reset token. Ask an admin to send a new one.
          </div>
        ) : done ? (
          <div className="space-y-4" data-testid="reset-done">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle size={22} weight="bold" />
              <span className="font-display text-xl font-bold">Password updated</span>
            </div>
            <p className="text-sm text-muted-foreground">You can sign in with your new password now.</p>
            <Link to="/login" className="inline-block bg-primary text-primary-foreground px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90" data-testid="reset-to-login">
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="overline mb-3">Reset password</div>
            <h2 className="font-display font-black text-3xl tracking-tight mb-8">Choose a new password</h2>
            <form onSubmit={submit} className="space-y-4" data-testid="reset-password-form">
              <div>
                <label className="overline block mb-2">New password</label>
                <input
                  data-testid="reset-password-input"
                  type="password" required autoFocus value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="overline block mb-2">Confirm password</label>
                <input
                  data-testid="reset-password-confirm"
                  type="password" required value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              {err && <div className="text-sm text-primary border border-primary/40 bg-primary/10 px-3 py-2" data-testid="reset-error">{err}</div>}
              <button
                data-testid="reset-submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground py-3 text-sm uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
            <div className="mt-6 text-xs text-muted-foreground">This link expires 15 minutes after it was sent and can only be used once.</div>
          </>
        )}
      </div>
    </div>
  );
}
