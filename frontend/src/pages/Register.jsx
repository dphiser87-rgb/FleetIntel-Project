import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/api";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteCode = params.get("invite") || "";
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "manager",
    workspace_name: "", invite_code: inviteCode
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (inviteCode) setForm(f => ({ ...f, invite_code: inviteCode }));
  }, [inviteCode]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await register(form);
      toast.success(inviteCode ? "Welcome to the team!" : "Workspace created");
      navigate("/");
    } catch (e) {
      const msg = formatApiErrorDetail(e.response?.data?.detail) || e.message;
      setErr(msg); toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="overline mb-3">{inviteCode ? "Join workspace" : "Create workspace"}</div>
        <h2 className="font-display font-black text-4xl tracking-tight mb-2">
          {inviteCode ? "Accept your invite" : "Join FleetCost"}
        </h2>
        {inviteCode && (
          <div className="text-sm text-muted-foreground mb-6">
            You're joining with invite code <span className="mono text-primary">{inviteCode.slice(0, 12)}…</span>
          </div>
        )}
        <form onSubmit={submit} className="space-y-4" data-testid="register-form">
          <div>
            <label className="overline block mb-2">Full name</label>
            <input data-testid="register-name" required value={form.name} onChange={set("name")}
              className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="overline block mb-2">Email</label>
            <input data-testid="register-email" required type="email" value={form.email} onChange={set("email")}
              className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="overline block mb-2">Password</label>
            <input data-testid="register-password" required type="password" minLength={6} value={form.password} onChange={set("password")}
              className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          </div>
          {!inviteCode && (
            <>
              <div>
                <label className="overline block mb-2">Workspace / company name</label>
                <input data-testid="register-workspace" value={form.workspace_name} onChange={set("workspace_name")}
                  placeholder="Acme Trucking Co."
                  className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div>
                <label className="overline block mb-2">Role</label>
                <select data-testid="register-role" value={form.role} onChange={set("role")}
                  className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
                  <option value="admin">Admin (workspace owner)</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </>
          )}
          {err && <div className="text-sm text-primary border border-primary/40 bg-primary/10 px-3 py-2">{err}</div>}
          <button data-testid="register-submit" disabled={loading}
            className="w-full bg-primary text-primary-foreground py-3 text-sm uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {loading ? "Creating…" : (inviteCode ? "Join workspace" : "Create account")}
          </button>
        </form>
        <div className="mt-6 text-xs text-muted-foreground">
          Already have an account? <Link to="/login" className="text-white underline underline-offset-4">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
