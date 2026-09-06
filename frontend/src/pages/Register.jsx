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

  if (!inviteCode) {
    // Public self-serve workspace creation was removed -- new workspaces are set up by the
    // FleetIntel team directly (see backend/server.py's /admin/workspaces), matching how the
    // product is actually sold (a booked call, not a signup form). Invited teammates never land
    // here without a code, since their invite link always carries one.
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="overline mb-3">Get started</div>
          <h2 className="font-display font-black text-4xl tracking-tight mb-4">
            New workspaces are set up by our team
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Contact us at{" "}
            <a href="mailto:hello@fleetintel.africa" className="text-white underline underline-offset-4">
              hello@fleetintel.africa
            </a>{" "}
            to get your fleet set up. Already have an invite? Use the link from your invite email
            instead of this page.
          </p>
          <Link to="/login" className="text-white underline underline-offset-4 text-sm">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="overline mb-3">Join workspace</div>
        <h2 className="font-display font-black text-4xl tracking-tight mb-2">
          Accept your invite
        </h2>
        <div className="text-sm text-muted-foreground mb-6">
          You're joining with invite code <span className="mono text-primary">{inviteCode.slice(0, 12)}…</span>
        </div>
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
          {err && <div className="text-sm text-primary border border-primary/40 bg-primary/10 px-3 py-2">{err}</div>}
          <button data-testid="register-submit" disabled={loading}
            className="w-full bg-primary text-primary-foreground py-3 text-sm uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {loading ? "Joining…" : "Join workspace"}
          </button>
        </form>
        <div className="mt-6 text-xs text-muted-foreground">
          Already have an account? <Link to="/login" className="text-white underline underline-offset-4">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
