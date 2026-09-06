import React, { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { formatApiErrorDetail, api } from "@/lib/api";
import { ChartLine, CheckCircle } from "@phosphor-icons/react";

// Self-service reset request. The success state is shown regardless of what actually happened
// server-side (POST /auth/forgot-password always returns {ok: true}) -- admin accounts and unknown
// emails are handled silently on the backend, so this page must never reveal which case occurred.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
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

        {sent ? (
          <div className="space-y-4" data-testid="forgot-password-sent">
            <div className="flex items-center gap-2 text-primary">
              <CheckCircle size={22} weight="bold" />
              <span className="font-display text-xl font-bold">Check your email</span>
            </div>
            <p className="text-sm text-muted-foreground">
              If {email} can reset its own password, we've sent a link to it. Admin accounts don't use
              this self-service flow — if that's you, contact the FleetIntel team directly.
            </p>
            <Link to="/login" className="inline-block bg-primary text-primary-foreground px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90" data-testid="forgot-password-to-login">
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="overline mb-3">Forgot password</div>
            <h2 className="font-display font-black text-3xl tracking-tight mb-8">Reset your password</h2>
            <form onSubmit={submit} className="space-y-4" data-testid="forgot-password-form">
              <div>
                <label className="overline block mb-2">Email</label>
                <input
                  data-testid="forgot-password-email"
                  type="email" required autoFocus value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              {err && <div className="text-sm text-primary border border-primary/40 bg-primary/10 px-3 py-2" data-testid="forgot-password-error">{err}</div>}
              <button
                data-testid="forgot-password-submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground py-3 text-sm uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
            <div className="mt-6 text-xs text-muted-foreground">
              Admin accounts: contact the FleetIntel team directly for a password reset.
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              <Link to="/login" className="text-white underline underline-offset-4">Back to sign in</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
