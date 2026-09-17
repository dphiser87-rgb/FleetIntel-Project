import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, MagnifyingGlass, X as XIcon, Wrench } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { hasAccess } from "@/lib/access";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";

const CATEGORIES = ["tyres", "engine", "brakes", "electrical", "bodywork", "general"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["open", "in_progress", "resolved"];

const SEVERITY_STYLES = {
  critical: "border-primary text-primary bg-primary/10",
  high: "border-[#FFCC00] text-[#FFCC00] bg-[#FFCC00]/10",
  medium: "border-[#3B82F6] text-[#3B82F6] bg-[#3B82F6]/10",
  low: "border-muted-foreground text-muted-foreground bg-white/5",
};
const STATUS_STYLES = {
  open: "border-primary text-primary",
  in_progress: "border-[#FFCC00] text-[#FFCC00]",
  resolved: "border-[#34C759] text-[#34C759]",
};

const PRICING_ROLES = ["workshop_manager", "operations_manager", "finance", "admin"];

export default function DefectReporting() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const canManage = hasAccess(user, "defects", "full");
  const canConvert = hasAccess(user, "maintenance", "full");
  const canPrice = PRICING_ROLES.includes(user?.role);
  const [defects, setDefects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ vehicle_id: "", category: "general", severity: "medium", description: "", location: "", assigned_to: "", estimated_cost: "" });

  const load = async () => {
    const [d, v, u] = await Promise.all([api.get("/defects"), api.get("/vehicles"), api.get("/users")]);
    setDefects(d.data || []);
    setVehicles(v.data || []);
    setTechnicians((u.data || []).filter(x => ["mechanic", "workshop_manager"].includes(x.role)));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => defects.filter(d => {
    if (status !== "all" && d.status !== status) return false;
    if (severity !== "all" && d.severity !== severity) return false;
    if (search && !(`${d.description} ${d.vehicle_name || ""} ${d.location || ""}`).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [defects, status, severity, search]);

  const totals = useMemo(() => ({
    open: defects.filter(d => d.status === "open").length,
    critical: defects.filter(d => d.severity === "critical" && d.status !== "resolved").length,
    in_progress: defects.filter(d => d.status === "in_progress").length,
    resolved: defects.filter(d => d.status === "resolved").length,
  }), [defects]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/defects", {
        ...form, vehicle_id: form.vehicle_id || null, assigned_to: form.assigned_to || null,
        estimated_cost: canPrice ? (Number(form.estimated_cost) || 0) : 0,
      });
      toast.success("Defect reported");
      setShowNew(false);
      setForm({ vehicle_id: "", category: "general", severity: "medium", description: "", location: "", assigned_to: "", estimated_cost: "" });
      load();
    } catch { toast.error("Failed to report defect"); }
  };

  const convertToMaintenance = async (id) => {
    try {
      await api.post(`/defects/${id}/convert-to-maintenance`);
      toast.success("Maintenance work order created — completing it will auto-resolve this defect");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to convert defect"); }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        status: editing.status, severity: editing.severity, category: editing.category,
        assigned_to: editing.assigned_to || null, resolution_notes: editing.resolution_notes || "",
      };
      if (canPrice) payload.estimated_cost = Number(editing.estimated_cost) || 0;
      await api.patch(`/defects/${editing.id}`, payload);
      toast.success("Defect updated");
      setEditing(null);
      load();
    } catch { toast.error("Failed to update"); }
  };

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Workshop</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="defects-title">Defect Reporting</h1>
          <div className="text-sm text-muted-foreground mt-2">Report and track vehicle defects submitted by drivers and technicians</div>
        </div>
        {canManage && (
          <button onClick={() => setShowNew(true)} data-testid="new-defect-btn" className="flex items-center gap-2 bg-primary px-4 py-2.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
            <Plus size={14} weight="bold" /> Report Defect
          </button>
        )}
      </header>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders" data-testid="defect-stats">
          {[["Open Defects", totals.open, "text-primary"], ["Critical", totals.critical, "text-primary"],
            ["In Progress", totals.in_progress, "text-[#FFCC00]"], ["Resolved", totals.resolved, "text-[#34C759]"]].map(([l, v, cls]) => (
            <div key={l} className="p-5 bg-[#121214]">
              <div className="overline">{l}</div>
              <div className={`mono text-xl font-bold mt-2 ${cls}`}>{v}</div>
            </div>
          ))}
        </div>

        <div className="bg-[#121214] border border-border">
          <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <MagnifyingGlass size={14} className="text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, vehicle, location…" data-testid="defect-search"
                className="flex-1 bg-transparent border-b border-border/50 px-2 py-1 text-sm focus:border-primary focus:outline-none" />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="filter-status" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs">
              <option value="all">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} data-testid="filter-severity" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs">
              <option value="all">All Severities</option>
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="divide-y divide-border" data-testid="defects-list">
            {filtered.map(d => (
              <div key={d.id} className="p-4 hover:bg-[#141416] group" data-testid={`defect-row-${d.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] mono uppercase tracking-widest px-2 py-0.5 border ${SEVERITY_STYLES[d.severity]}`}>{d.severity}</span>
                      <span className={`text-[10px] mono uppercase tracking-widest px-2 py-0.5 border ${STATUS_STYLES[d.status]}`}>{d.status.replace("_", " ")}</span>
                      <span className="text-[10px] mono uppercase tracking-widest text-muted-foreground">{d.category}</span>
                      <span className="text-xs mono text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="mt-2 text-sm">{d.description}</div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {d.vehicle_id && <Link to={`/fleet/${d.vehicle_id}`} className="hover:text-primary">{d.vehicle_name || "Vehicle"} · {d.vehicle_plate}</Link>}
                      {d.location && <span>· {d.location}</span>}
                      {d.reported_by_name && <span>By: <span className="text-foreground">{d.reported_by_name}</span></span>}
                      {d.assigned_to_name && <span>Assigned: <span className="text-foreground">{d.assigned_to_name}</span></span>}
                      {canPrice && d.estimated_cost > 0 && <span className="mono">· {formatMoneyFull(d.estimated_cost, currency, 2)}</span>}
                    </div>
                    {d.resolution_notes && <div className="mt-2 text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-2">{d.resolution_notes}</div>}
                    {d.maintenance_id && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-primary" data-testid={`defect-linked-job-${d.id}`}>
                        <Wrench size={12} /> Linked to a maintenance work order — resolves automatically on completion
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canConvert && d.status !== "resolved" && !d.maintenance_id && d.vehicle_id && (
                      <button onClick={() => convertToMaintenance(d.id)} data-testid={`convert-defect-${d.id}`}
                        className="opacity-60 group-hover:opacity-100 flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary border border-border px-2 py-1">
                        <Wrench size={12} /> Convert to Work Order
                      </button>
                    )}
                    {canManage && (
                      <button onClick={() => setEditing({ ...d, assigned_to: d.assigned_to || "", estimated_cost: d.estimated_cost || "" })} data-testid={`edit-defect-${d.id}`}
                        className="opacity-60 group-hover:opacity-100 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary border border-border px-2 py-1">
                        Update
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-sm text-muted-foreground py-12 text-center">No defects match the current filters.</div>}
          </div>
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setShowNew(false)}>
          <form onSubmit={create} className="bg-[#121214] border border-border max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="new-defect-form">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="overline">New defect</div>
                <h3 className="font-display font-bold text-2xl mt-1">Report defect</h3>
              </div>
              <button type="button" onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-primary"><XIcon size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="overline block mb-1">Vehicle</label>
                <select value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">Select vehicle…</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} · {v.plate}</option>)}
                </select>
              </div>
              <div>
                <label className="overline block mb-1">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="overline block mb-1">Severity</label>
                <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="overline block mb-1">Assign to technician</label>
                <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">Unassigned</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {canPrice && (
                <div>
                  <label className="overline block mb-1">Estimated cost</label>
                  <input type="number" min="0" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} data-testid="new-defect-cost" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
              )}
              <div className={canPrice ? "" : "col-span-2"}>
                <label className="overline block mb-1">Location</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="overline block mb-1">Description</label>
                <textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              <button type="submit" data-testid="submit-defect-btn" className="bg-primary text-primary-foreground px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90">Report defect</button>
              <button type="button" onClick={() => setShowNew(false)} className="border border-border px-4 py-2.5 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="bg-[#121214] border border-border max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="edit-defect-form">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="overline">Editing defect</div>
                <h3 className="font-display font-bold text-2xl mt-1">Update status</h3>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="text-muted-foreground hover:text-primary"><XIcon size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="overline block mb-1">Status</label>
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} data-testid="edit-status" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="overline block mb-1">Severity</label>
                <select value={editing.severity} onChange={(e) => setEditing({ ...editing, severity: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className={canPrice ? "" : "col-span-2"}>
                <label className="overline block mb-1">Assign to technician</label>
                <select value={editing.assigned_to} onChange={(e) => setEditing({ ...editing, assigned_to: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">Unassigned</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {canPrice && (
                <div>
                  <label className="overline block mb-1">Estimated cost</label>
                  <input type="number" min="0" value={editing.estimated_cost} onChange={(e) => setEditing({ ...editing, estimated_cost: e.target.value })} data-testid="edit-defect-cost" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
              )}
              <div className="col-span-2">
                <label className="overline block mb-1">Resolution notes</label>
                <textarea rows={2} value={editing.resolution_notes || ""} onChange={(e) => setEditing({ ...editing, resolution_notes: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              <button type="submit" data-testid="save-defect-edit" className="bg-primary text-primary-foreground px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90">Save changes</button>
              <button type="button" onClick={() => setEditing(null)} className="border border-border px-4 py-2.5 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
