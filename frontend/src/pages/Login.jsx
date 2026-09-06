import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatApiErrorDetail, api } from "@/lib/api";
import { ChartLine } from "@phosphor-icons/react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("dphiser87@gmail.com");
  const [password, setPassword] = useState("admin123");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password, ...(needs2fa && { code }) });
      if (data.requires_2fa) {
        setNeeds2fa(true);
        toast.info("Enter your 6-digit authenticator code");
        setLoading(false);
        return;
      }
      localStorage.setItem("token", data.token);
      window.location.href = "/";
    } catch (e) {
      const msg = formatApiErrorDetail(e.response?.data?.detail) || e.message;
      setErr(msg); toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background noise-bg grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-border overflow-y-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary flex items-center justify-center">
            <ChartLine size={22} weight="bold" color="#fff" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display font-black text-xl leading-none tracking-tight">FleetIntel</span>
              <span className="overline">— Cost intelligence platform</span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-1.5">
              Your Fleet. Your Control. Your Savings.
            </div>
          </div>
        </div>
        <div>
          <div className="overline mb-4" style={{ color: "hsl(var(--primary))" }}>Operator console</div>
          <h1 className="font-display font-black text-6xl leading-[0.95] tracking-tighter">
            See exactly what<br/>
            every vehicle costs you.<br/>
            <span className="text-primary">Before it becomes a liability.</span>
          </h1>
          <p className="mt-6 text-muted-foreground max-w-md leading-relaxed">
            A cost-intelligence layer for fleet operations. KPIs, digital inspections, and a maintenance
            allocation pipeline — connected end to end.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 border-t border-border pt-6">
          {[
            ["12+", "Live KPIs"],
            ["4", "Roles"],
            ["∞", "Templates"],
          ].map(([v, l]) => (
            <div key={l}>
              <div className="mono text-3xl font-bold">{v}</div>
              <div className="overline mt-1">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h2 className="font-display font-black text-4xl tracking-tight mb-8">
            Access your fleet
          </h2>
          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div>
              <label className="overline block mb-2">Email</label>
              <input
                data-testid="login-email"
                type="email" required value={email} disabled={needs2fa}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
              />
            </div>
            <div>
              <label className="overline block mb-2">Password</label>
              <input
                data-testid="login-password"
                type="password" required value={password} disabled={needs2fa}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none disabled:opacity-60"
              />
            </div>
            {needs2fa && (
              <div>
                <label className="overline block mb-2">2FA code</label>
                <input
                  data-testid="login-2fa-code"
                  autoFocus type="text" inputMode="numeric" required value={code} maxLength={6}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000000"
                  className="w-full bg-[#121214] border border-border px-3 py-2.5 mono text-lg tracking-widest text-center focus:border-primary focus:outline-none"
                />
              </div>
            )}
            {err && <div className="text-sm text-primary border border-primary/40 bg-primary/10 px-3 py-2" data-testid="login-error">{err}</div>}
            <button
              data-testid="login-submit"
              disabled={loading}
              className="w-full h-14 rounded-full bg-primary text-primary-foreground text-sm font-semibold uppercase tracking-[0.08em] transition-all duration-200 hover:bg-primary/90 hover:shadow-[0_0_24px_rgba(34,197,94,0.45)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none cursor-pointer"
            >
              {loading ? "Authenticating…" : (needs2fa ? "Verify & sign in" : "Sign in")}
            </button>
          </form>
          <div className="mt-6 text-xs text-muted-foreground">
            <Link to="/forgot-password" data-testid="forgot-password-link" className="text-white underline underline-offset-4">
              Forgot password?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
