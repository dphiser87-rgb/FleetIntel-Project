import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, UserCircle, Warning, Truck, PencilSimple, Trash, X } from "@phosphor-icons/react";

const STATUS_COLOR = {
  active: "border-primary text-primary",
  inactive: "border-muted-foreground text-muted-foreground",
  on_leave: "border-[#FFCC00] text-[#FFCC00]",
};

const daysUntil = (iso) => {
  if (!iso) return null;
  const diff = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  return diff;
};

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", license_number: "", license_expiry: "", hire_date: "", assigned_vehicle_id: "", status: "active" });

  const load = async () => {
    const [d, v] = await Promise.all([api.get("/drivers"), api.get("/vehicles")]);
    setDrivers(d.data); setVehicles(v.data);
  };
  useEffect(() => { load(); }, []);

  const vName = (id) => vehicles.find(v => v.id === id)?.name || null;
  const resetForm = () => setForm({ name: "", email: "", phone: "", license_number: "", license_expiry: "", hire_date: "", assigned_vehicle_id: "", status: "active" });

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing) await api.patch(`/drivers/${editing}`, { ...form, email: form.email || null });
      else await api.post("/drivers", { ...form, email: form.email || null, assigned_vehicle_id: form.assigned_vehicle_id || null });
      toast.success(editing ? "Driver updated" : "Driver added");
      setShowAdd(false); setEditing(null); resetForm(); load();
    } catch { toast.error("Failed"); }
  };

  const startEdit = (d) => {
    setEditing(d.id);
    setForm({
      name: d.name || "", email: d.email || "", phone: d.phone || "",
      license_number: d.license_number || "", license_expiry: d.license_expiry || "",
      hire_date: d.hire_date || "", assigned_vehicle_id: d.assigned_vehicle_id || "",
      status: d.status || "active",
    });
    setShowAdd(true);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this driver?")) return;
    await api.delete(`/drivers/${id}`);
    toast.success("Deleted"); load();
  };

  const openDetail = async (id) => {
    const { data } = await api.get(`/drivers/${id}/history`);
    setDetail(data);
  };

  const expiringSoon = drivers.filter(d => {
    const days = daysUntil(d.license_expiry);
    return days !== null && days <= 30;
  });

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">People</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="drivers-title">Drivers</h1>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <div className="overline">Total</div>
            <div className="mono text-xl font-bold mt-1">{drivers.length}</div>
          </div>
          <div>
            <div className="overline">Expiring &lt;30d</div>
            <div className={`mono text-xl font-bold mt-1 ${expiringSoon.length ? "text-primary" : ""}`}>{expiringSoon.length}</div>
          </div>
          <button data-testid="add-driver-btn" onClick={() => { setEditing(null); resetForm(); setShowAdd(!showAdd); }} className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
            <Plus size={14} weight="bold" /> Add driver
          </button>
        </div>
      </header>

      {showAdd && (
        <form onSubmit={save} className="border-b border-border bg-[#0d0d0f] p-6 grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="driver-form">
          {[
            ["name", "Full name", "text"],
            ["email", "Email", "email"],
            ["phone", "Phone", "tel"],
            ["license_number", "License #", "text"],
            ["license_expiry", "License expiry", "date"],
            ["hire_date", "Hire date", "date"],
          ].map(([k, l, t]) => (
            <div key={k}>
              <label className="overline block mb-1">{l}</label>
              <input required={k === "name" || k === "license_number" || k === "license_expiry"} type={t} value={form[k]} onChange={(e) => setForm({...form, [k]: e.target.value})}
                data-testid={`d-${k}`}
                className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </div>
          ))}
          <div>
            <label className="overline block mb-1">Assigned vehicle</label>
            <select value={form.assigned_vehicle_id} onChange={(e) => setForm({...form, assigned_vehicle_id: e.target.value})} data-testid="d-vehicle"
              className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
              <option value="">Unassigned</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} · {v.plate}</option>)}
            </select>
          </div>
          <div>
            <label className="overline block mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})} className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On leave</option>
            </select>
          </div>
          <div className="col-span-2 lg:col-span-4 flex gap-2">
            <button type="submit" data-testid="save-driver" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">{editing ? "Update" : "Save"} driver</button>
            <button type="button" onClick={() => { setShowAdd(false); setEditing(null); resetForm(); }} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
          </div>
        </form>
      )}

      <div className="p-8">
        <div className="bg-[#121214] border border-border" data-testid="drivers-table">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left overline">
                <th className="p-3">Driver</th>
                <th className="p-3">License</th>
                <th className="p-3">Expiry</th>
                <th className="p-3">Assigned</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map(d => {
                const days = daysUntil(d.license_expiry);
                const critical = days !== null && days <= 30;
                return (
                  <tr key={d.id} className="border-b border-border/50 hover:bg-[#141416]" data-testid={`driver-${d.id}`}>
                    <td className="p-3">
                      <button onClick={() => openDetail(d.id)} className="flex items-center gap-2 hover:text-primary text-left" data-testid={`view-driver-${d.id}`}>
                        <UserCircle size={20} weight="thin" />
                        <div>
                          <div>{d.name}</div>
                          <div className="text-xs text-muted-foreground mono">{d.email}</div>
                        </div>
                      </button>
                    </td>
                    <td className="p-3 mono text-xs">{d.license_number}</td>
                    <td className="p-3">
                      <div className={`text-xs mono ${critical ? "text-primary" : ""}`}>{d.license_expiry}</div>
                      {critical && <div className="flex items-center gap-1 text-[10px] mono uppercase tracking-widest text-primary mt-0.5"><Warning size={10} /> {days} days</div>}
                    </td>
                    <td className="p-3 text-sm">{vName(d.assigned_vehicle_id) || <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3">
                      <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${STATUS_COLOR[d.status] || ""}`}>{(d.status || "").replace("_", " ")}</span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(d)} className="border border-border p-1 hover:border-primary hover:text-primary"><PencilSimple size={12} /></button>
                        <button onClick={() => del(d.id)} className="border border-border p-1 hover:border-primary hover:text-primary"><Trash size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {drivers.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No drivers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setDetail(null)}>
          <div className="bg-[#121214] border border-border max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="driver-detail">
            <div className="border-b border-border p-4 flex items-start justify-between">
              <div>
                <div className="overline">Driver profile</div>
                <h3 className="font-display font-bold text-2xl mt-1">{detail.driver.name}</h3>
                <div className="text-sm text-muted-foreground mt-1">{detail.driver.email} · {detail.driver.phone}</div>
              </div>
              <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-primary"><X size={20} /></button>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 border border-border/50 grid-borders mt-4 mx-4">
              {[
                ["License", detail.driver.license_number],
                ["Expiry", detail.driver.license_expiry],
                ["Assigned", detail.vehicle?.name || "—"],
                ["Total cost", `$${detail.total_cost.toLocaleString()}`],
              ].map(([l, v]) => (
                <div key={l} className="p-4 bg-[#0b0b0d]">
                  <div className="overline">{l}</div>
                  <div className="mono font-bold mt-2">{v}</div>
                </div>
              ))}
            </div>
            {detail.vehicle && (
              <div className="p-4">
                <div className="overline mb-2">Assigned vehicle</div>
                <div className="flex items-center gap-3 border border-border p-3">
                  <Truck size={22} className="text-muted-foreground" />
                  <div>
                    <div className="font-bold">{detail.vehicle.name}</div>
                    <div className="text-xs text-muted-foreground mono">{detail.vehicle.plate} · {detail.vehicle.make} {detail.vehicle.model}</div>
                  </div>
                </div>
              </div>
            )}
            <div className="p-4">
              <div className="overline mb-2">Maintenance history ({detail.maintenance.length})</div>
              <div className="space-y-2">
                {detail.maintenance.slice(0, 10).map(m => (
                  <div key={m.id} className="flex items-center justify-between border-b border-border/50 py-2 text-sm">
                    <div>{m.title} <span className="overline ml-2">{m.status}</span></div>
                    <div className="mono">${(m.actual_cost || m.estimated_cost || 0).toLocaleString()}</div>
                  </div>
                ))}
                {detail.maintenance.length === 0 && <div className="text-sm text-muted-foreground">No records.</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
