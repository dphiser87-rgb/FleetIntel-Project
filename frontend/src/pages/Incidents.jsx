import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Warning, DownloadSimple, Trash, PencilSimple, X as XIcon, MagnifyingGlass, CaretLeft, CaretRight, Image as ImageIcon } from "@phosphor-icons/react";

const SEVERITY_STYLES = {
  severe: "border-primary text-primary bg-primary/10",
  moderate: "border-[#FFCC00] text-[#FFCC00] bg-[#FFCC00]/10",
  minor: "border-muted-foreground text-muted-foreground bg-white/5",
};

const money = (n) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const toCsv = (rows) => {
  if (!rows.length) return "";
  const headers = ["occurred_at", "vehicle_name", "vehicle_plate", "driver_name", "kind", "severity", "location", "description", "reported_cost", "resolved"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
};

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [severity, setSeverity] = useState("all");
  const [kind, setKind] = useState("all");
  const [driverId, setDriverId] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { photos: [], index: 0, incident: {} }
  const lightboxRef = useRef(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-focus only when the open incident changes, not on every lightbox field (e.g. photo index navigation)
  useEffect(() => { if (lightbox && lightboxRef.current) lightboxRef.current.focus(); }, [lightbox?.incident?.id]);

  const load = async () => {
    const [i, d] = await Promise.all([api.get("/incidents"), api.get("/drivers")]);
    setIncidents(i.data); setDrivers(d.data);
  };
  useEffect(() => { load(); }, []);

  const driverMap = useMemo(() => Object.fromEntries(drivers.map(d => [d.id, d])), [drivers]);

  const filtered = useMemo(() => incidents.filter(i => {
    if (severity !== "all" && i.severity !== severity) return false;
    if (kind !== "all" && i.kind !== kind) return false;
    if (driverId !== "all" && (i.driver_id || "") !== driverId) return false;
    if (search && !(`${i.description} ${i.vehicle_name} ${i.vehicle_plate} ${i.location || ""}`).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [incidents, severity, kind, driverId, search]);

  const breakdown = useMemo(() => {
    const map = {};
    filtered.forEach(i => {
      const key = i.driver_id || "unassigned";
      if (!map[key]) map[key] = { name: i.driver_name || "Unassigned", count: 0, cost: 0, severe: 0 };
      map[key].count += 1;
      map[key].cost += i.reported_cost || 0;
      if (i.severity === "severe") map[key].severe += 1;
    });
    return Object.entries(map).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count);
  }, [filtered]);

  const totals = useMemo(() => ({
    total: filtered.length,
    severe: filtered.filter(i => i.severity === "severe").length,
    moderate: filtered.filter(i => i.severity === "moderate").length,
    minor: filtered.filter(i => i.severity === "minor").length,
    cost: filtered.reduce((s, i) => s + (i.reported_cost || 0), 0),
  }), [filtered]);

  const exportCsv = () => {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} incident${filtered.length !== 1 ? "s" : ""}`);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this incident?")) return;
    try { await api.delete(`/incidents/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Failed to delete"); }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        severity: editing.severity,
        kind: editing.kind,
        description: editing.description,
        location: editing.location,
        resolution_notes: editing.resolution_notes || "",
        resolved: !!editing.resolved,
        reported_cost: Number(editing.reported_cost) || 0,
        driver_id: editing.driver_id || null,
      };
      const { data } = await api.patch(`/incidents/${editing.id}`, payload);
      // Optimistically merge the patched row so the list reflects the change immediately
      setIncidents(prev => prev.map(i => i.id === editing.id ? { ...i, ...data } : i));
      toast.success("Incident updated");
      setEditing(null);
      // Also refetch to pick up any enrichment (vehicle_name, driver_name) changes
      load();
    } catch { toast.error("Failed to update"); }
  };

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4" data-testid="incidents-header">
        <div>
          <div className="overline">Risk & compliance</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="incidents-title">Incidents</h1>
          <div className="text-sm text-muted-foreground mt-2">Fleet-wide accident, damage, breakdown, and citation log</div>
        </div>
        <button onClick={exportCsv} data-testid="export-csv-btn" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
          <DownloadSimple size={14} /> Export CSV
        </button>
      </header>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 border border-border grid-borders" data-testid="incidents-stats">
          {[
            ["Total", totals.total, "text-foreground"],
            ["Severe", totals.severe, "text-primary"],
            ["Moderate", totals.moderate, "text-[#FFCC00]"],
            ["Minor", totals.minor, "text-muted-foreground"],
            ["Reported cost", money(totals.cost), "text-foreground"],
          ].map(([l, val, cls]) => (
            <div key={l} className="p-5 bg-[#121214]">
              <div className="overline">{l}</div>
              <div className={`mono text-xl font-bold mt-2 ${cls}`}>{val}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#121214] border border-border">
            <div className="p-4 border-b border-border flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <MagnifyingGlass size={14} className="text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, vehicle, location…" data-testid="search-input"
                  className="flex-1 bg-transparent border-b border-border/50 px-2 py-1 text-sm focus:border-primary focus:outline-none" />
              </div>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} data-testid="filter-severity" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs">
                <option value="all">All severity</option>
                <option value="severe">Severe</option>
                <option value="moderate">Moderate</option>
                <option value="minor">Minor</option>
              </select>
              <select value={kind} onChange={(e) => setKind(e.target.value)} data-testid="filter-kind" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs">
                <option value="all">All kinds</option>
                {["accident", "damage", "breakdown", "citation", "other"].map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)} data-testid="filter-driver" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs">
                <option value="all">All drivers</option>
                <option value="">Unassigned</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto" data-testid="incidents-list">
              {filtered.map(i => (
                <div key={i.id} className="p-4 hover:bg-[#141416] group" data-testid={`incident-row-${i.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] mono uppercase tracking-widest px-2 py-0.5 border ${SEVERITY_STYLES[i.severity]}`} data-testid={`severity-${i.id}`}>{i.severity}</span>
                        <span className="text-[10px] mono uppercase tracking-widest text-muted-foreground">{i.kind}</span>
                        {i.resolved && <span className="text-[10px] mono uppercase tracking-widest px-2 py-0.5 border border-[#34C759] text-[#34C759] bg-[#34C759]/10">Resolved</span>}
                        <span className="text-xs mono text-muted-foreground">{(i.occurred_at || "").slice(0, 16).replace("T", " ")}</span>
                      </div>
                      <div className="mt-2 text-sm">{i.description}</div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {i.vehicle_id && <Link to={`/fleet/${i.vehicle_id}`} className="hover:text-primary">{i.vehicle_name || "Vehicle"} · {i.vehicle_plate}</Link>}
                        {i.driver_name && <span>Driver: <span className="text-foreground">{i.driver_name}</span></span>}
                        {i.location && <span>· {i.location}</span>}
                        {i.reported_cost > 0 && <span className="mono">· {money(i.reported_cost)}</span>}
                      </div>
                      {i.resolution_notes && <div className="mt-2 text-xs text-muted-foreground italic border-l-2 border-primary/40 pl-2">Resolution: {i.resolution_notes}</div>}
                      {(i.photos || []).length > 0 && (
                        <div className="mt-2 flex gap-2 flex-wrap" data-testid={`incident-photos-${i.id}`}>
                          {i.photos.slice(0, 4).map((p, pi) => (
                            <button key={pi} type="button" onClick={() => setLightbox({ photos: i.photos, index: pi, incident: i })} className="relative w-14 h-14 border border-border hover:border-primary overflow-hidden group" data-testid={`photo-thumb-${i.id}-${pi}`}>
                              <img src={p} alt="" className="w-full h-full object-cover" />
                              {pi === 3 && i.photos.length > 4 && (
                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-xs mono text-white">+{i.photos.length - 4}</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditing({ ...i, driver_id: i.driver_id || "", resolution_notes: i.resolution_notes || "" })} data-testid={`edit-incident-${i.id}`} className="text-muted-foreground hover:text-primary p-1"><PencilSimple size={14} /></button>
                      <button onClick={() => del(i.id)} data-testid={`delete-incident-${i.id}`} className="text-muted-foreground hover:text-primary p-1"><Trash size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div className="text-sm text-muted-foreground py-12 text-center">No incidents match the current filters.</div>}
            </div>
          </div>

          <div className="bg-[#121214] border border-border p-6" data-testid="driver-breakdown">
            <div className="flex items-center gap-2 mb-4">
              <Warning size={18} className="text-primary" />
              <div>
                <div className="overline">Attribution</div>
                <h3 className="font-display text-xl font-bold">Breakdown by driver</h3>
              </div>
            </div>
            <div className="space-y-2 max-h-[540px] overflow-y-auto">
              {breakdown.map(b => (
                <div key={b.id} className="border border-border p-3 hover:border-primary/60 transition-colors" data-testid={`driver-bd-${b.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold">{b.name}</div>
                    <div className="mono text-primary text-sm">{b.count}</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {b.severe > 0 && <span className="text-primary mono">{b.severe} severe · </span>}
                    <span className="mono">{money(b.cost)}</span> total
                  </div>
                </div>
              ))}
              {breakdown.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">No data.</div>}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="bg-[#121214] border border-border max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="edit-incident-form">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="overline">Editing incident</div>
                <h3 className="font-display font-bold text-2xl mt-1">Update details</h3>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="text-muted-foreground hover:text-primary"><XIcon size={20} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="overline block mb-1">Kind</label>
                <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })} data-testid="edit-kind" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {["accident", "damage", "breakdown", "citation", "other"].map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label className="overline block mb-1">Severity</label>
                <select value={editing.severity} onChange={(e) => setEditing({ ...editing, severity: e.target.value })} data-testid="edit-severity" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {["minor", "moderate", "severe"].map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <label className="overline block mb-1">Driver</label>
                <select value={editing.driver_id || ""} onChange={(e) => setEditing({ ...editing, driver_id: e.target.value })} data-testid="edit-driver" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">Unassigned</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="overline block mb-1">Reported cost</label>
                <input type="number" value={editing.reported_cost || 0} onChange={(e) => setEditing({ ...editing, reported_cost: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="overline block mb-1">Location</label>
                <input value={editing.location || ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="overline block mb-1">Description</label>
                <textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} data-testid="edit-desc" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="overline block mb-1">Resolution notes</label>
                <textarea rows={2} value={editing.resolution_notes || ""} onChange={(e) => setEditing({ ...editing, resolution_notes: e.target.value })} data-testid="edit-resolution" placeholder="What was done to resolve or close this out…" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!editing.resolved} onChange={(e) => setEditing({ ...editing, resolved: e.target.checked })} data-testid="edit-resolved" className="accent-primary" />
                Mark as resolved
              </label>
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              <button type="submit" data-testid="save-incident-edit" className="bg-primary text-primary-foreground px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90">Save changes</button>
              <button type="button" onClick={() => setEditing(null)} className="border border-border px-4 py-2.5 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
            </div>
          </form>
        </div>
      )}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-6" onClick={() => setLightbox(null)} data-testid="photo-lightbox" onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setLightbox(l => l && ({ ...l, index: (l.index - 1 + l.photos.length) % l.photos.length }));
          if (e.key === "ArrowRight") setLightbox(l => l && ({ ...l, index: (l.index + 1) % l.photos.length }));
          if (e.key === "Escape") setLightbox(null);
        }} tabIndex={0} ref={lightboxRef}>
          <button onClick={(e) => { e.stopPropagation(); setLightbox(null); }} className="absolute top-6 right-6 text-white hover:text-primary z-10" data-testid="lightbox-close"><XIcon size={28} /></button>
          <button onClick={(e) => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index - 1 + l.photos.length) % l.photos.length })); }} className="absolute left-4 md:left-8 text-white hover:text-primary p-3 bg-black/50 rounded-full disabled:opacity-30" disabled={lightbox.photos.length < 2} data-testid="lightbox-prev">
            <CaretLeft size={28} weight="bold" />
          </button>
          <div className="max-w-5xl w-full max-h-full flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.photos[lightbox.index]} alt="" className="max-h-[80vh] max-w-full object-contain border border-border" data-testid="lightbox-image" />
            <div className="text-center text-white space-y-1">
              <div className="overline text-white/70">
                <span className={`px-2 py-0.5 border ${SEVERITY_STYLES[lightbox.incident.severity]}`}>{lightbox.incident.severity}</span>
                <span className="ml-2">{lightbox.incident.kind}</span>
                <span className="ml-2 mono">{(lightbox.incident.occurred_at || "").slice(0, 16).replace("T", " ")}</span>
              </div>
              <div className="text-sm max-w-2xl mx-auto">{lightbox.incident.description}</div>
              <div className="mono text-xs text-white/60" data-testid="lightbox-counter">{lightbox.index + 1} / {lightbox.photos.length}</div>
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setLightbox(l => ({ ...l, index: (l.index + 1) % l.photos.length })); }} className="absolute right-4 md:right-8 text-white hover:text-primary p-3 bg-black/50 rounded-full disabled:opacity-30" disabled={lightbox.photos.length < 2} data-testid="lightbox-next">
            <CaretRight size={28} weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}
