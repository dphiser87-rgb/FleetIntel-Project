import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/api";
import { ChartLine } from "@phosphor-icons/react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("dphiser87@gmail.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/");
    } catch (e) {
      const msg = formatApiErrorDetail(e.response?.data?.detail) || e.message;
      setErr(msg); toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background noise-bg grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary flex items-center justify-center">
            <ChartLine size={22} weight="bold" color="#fff" />
          </div>
          <div>
            <div className="font-display font-black text-xl leading-none tracking-tight">FleetCost</div>
            <div className="overline mt-1">Intelligence platform</div>
          </div>
        </div>
        <div>
          <div className="overline mb-4">Operator console</div>
          <h1 className="font-display font-black text-6xl leading-[0.95] tracking-tighter">
            Every dollar,<br/>
            <span className="text-primary">every mile,</span><br/>
            accounted for.
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
          <div className="overline mb-3">Sign in</div>
          <h2 className="font-display font-black text-4xl tracking-tight mb-8">
            Access your fleet
          </h2>
          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div>
              <label className="overline block mb-2">Email</label>
              <input
                data-testid="login-email"
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="overline block mb-2">Password</label>
              <input
                data-testid="login-password"
                type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            {err && <div className="text-sm text-primary border border-primary/40 bg-primary/10 px-3 py-2" data-testid="login-error">{err}</div>}
            <button
              data-testid="login-submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground py-3 text-sm uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading ? "Authenticating…" : "Sign in"}
            </button>
          </form>
          <div className="mt-6 text-xs text-muted-foreground">
            No account?{" "}
            <Link to="/register" className="text-white underline underline-offset-4" data-testid="register-link">Create one</Link>
          </div>
          <div className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
            <div className="overline mb-2">Demo credentials</div>
            <div className="mono">dphiser87@gmail.com / admin123</div>
          </div>
        </div>
      </div>
    </div>
  );
}
