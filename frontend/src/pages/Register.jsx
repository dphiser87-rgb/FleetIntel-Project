import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/api";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "manager" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await register(form);
      toast.success("Account created");
      navigate("/");
    } catch (e) {
      const msg = formatApiErrorDetail(e.response?.data?.detail) || e.message;
      setErr(msg); toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="overline mb-3">Create account</div>
        <h2 className="font-display font-black text-4xl tracking-tight mb-8">Join FleetCost</h2>
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
          <div>
            <label className="overline block mb-2">Role</label>
            <select data-testid="register-role" value={form.role} onChange={set("role")}
              className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
              <option value="manager">Manager</option>
              <option value="inspector">Inspector</option>
              <option value="mechanic">Mechanic</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {err && <div className="text-sm text-primary border border-primary/40 bg-primary/10 px-3 py-2">{err}</div>}
          <button data-testid="register-submit" disabled={loading}
            className="w-full bg-primary text-primary-foreground py-3 text-sm uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <div className="mt-6 text-xs text-muted-foreground">
          Already have an account? <Link to="/login" className="text-white underline underline-offset-4">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
