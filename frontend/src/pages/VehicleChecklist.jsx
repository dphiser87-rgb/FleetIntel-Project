import React, { useEffect, useMemo, useState } from "react";
import { api, API } from "@/lib/api";
import { ArrowDown, ArrowUp, ClipboardText, DownloadSimple } from "@phosphor-icons/react";
import InspectionDetailPanel from "@/components/InspectionDetailPanel";

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const withinPeriod = (iso, period) => {
  if (period === "all" || !iso) return true;
  const days = { "7d": 7, "30d": 30, "90d": 90 }[period];
  return (Date.now() - new Date(iso).getTime()) / 86400000 <= days;
};

export default function VehicleChecklist() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all"); // all | pass | defects
  const [typeFilter, setTypeFilter] = useState("all"); // all | vehicle | trailer | asset
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [period, setPeriod] = useState("all");
  const [sortKey, setSortKey] = useState("completed_at");
  const [sortDir, setSortDir] = useState("desc");
  const [selected, setSelected] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/inspections").then((r) => setRows(r.data || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const vehicles = useMemo(() => [...new Map(rows.filter(r => r.vehicle_id).map(r => [r.vehicle_id, r.target_name])).entries()], [rows]);
  const drivers = useMemo(() => [...new Set(rows.map(r => r.inspector_name).filter(Boolean))], [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter === "pass") list = list.filter(r => !(r.fail_count > 0));
    if (statusFilter === "defects") list = list.filter(r => r.fail_count > 0);
    if (typeFilter !== "all") list = list.filter(r => r.target_kind === typeFilter);
    if (vehicleFilter !== "all") list = list.filter(r => r.vehicle_id === vehicleFilter);
    if (driverFilter !== "all") list = list.filter(r => r.inspector_name === driverFilter);
    list = list.filter(r => withinPeriod(r.completed_at || r.created_at, period));
    const dir = sortDir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (sortKey === "fail_count") return ((av || 0) - (bv || 0)) * dir;
      if (sortKey === "completed_at") return (new Date(a.completed_at || a.created_at) - new Date(b.completed_at || b.created_at)) * dir;
      return String(av || "").localeCompare(String(bv || "")) * dir;
    });
  }, [rows, statusFilter, typeFilter, vehicleFilter, driverFilter, period, sortKey, sortDir]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const exportCsv = () => {
    const token = localStorage.getItem("token");
    window.open(`${API}/export/inspections.csv?token=${encodeURIComponent(token)}`, "_blank");
  };

  const SortTh = ({ label, sortableKey, testid }) => (
    <th className="p-2 cursor-pointer hover:text-primary" onClick={() => toggleSort(sortableKey)} data-testid={testid}>
      <span className="flex items-center gap-1">
        {label}
        {sortKey === sortableKey && (sortDir === "desc" ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
      </span>
    </th>
  );

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Operational inbox</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="vehicle-checklist-title">Vehicle Checklist</h1>
          <div className="text-sm text-muted-foreground mt-2">Every checklist completed on the driver mobile app lands here.</div>
        </div>
        <button onClick={exportCsv} data-testid="export-register-csv" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
          <DownloadSimple size={14} /> Export register (CSV)
        </button>
      </header>

      <div className="flex items-center gap-3 flex-wrap border-b border-border bg-[#121214] px-8 py-3" data-testid="checklist-filters">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="filter-status" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
          <option value="all">All results</option>
          <option value="pass">Pass</option>
          <option value="defects">Defects found</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} data-testid="filter-type" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
          <option value="all">Vehicle & trailer</option>
          <option value="vehicle">Vehicle only</option>
          <option value="trailer">Trailer only</option>
          <option value="asset">Asset only</option>
        </select>
        <select value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} data-testid="filter-vehicle" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
          <option value="all">All vehicles</option>
          {vehicles.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} data-testid="filter-driver" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
          <option value="all">All drivers</option>
          {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="filter-period" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} submission{filtered.length !== 1 && "s"}</span>
      </div>

      <div className="p-8">
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto border border-border bg-[#121214]">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left overline">
                  <SortTh label="Vehicle" sortableKey="target_name" testid="sort-vehicle" />
                  <th className="p-2">Driver</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Template</th>
                  <SortTh label="Completed" sortableKey="completed_at" testid="sort-completed" />
                  <th className="p-2">Location</th>
                  <th className="p-2">Result</th>
                  <SortTh label="Defects" sortableKey="fail_count" testid="sort-defects" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className="border-b border-border/50 hover:bg-primary/5 cursor-pointer" data-testid={`checklist-row-${r.id}`}>
                    <td className="p-2">{r.target_name} <span className="mono text-xs text-muted-foreground">{r.target_plate}</span></td>
                    <td className="p-2">{r.inspector_name}</td>
                    <td className="p-2 text-xs uppercase text-muted-foreground">{r.target_kind}</td>
                    <td className="p-2">{r.template_name}</td>
                    <td className="p-2 mono text-xs">{new Date(r.completed_at || r.created_at).toLocaleString()}</td>
                    <td className="p-2 text-xs text-muted-foreground truncate max-w-[180px]">{r.address || (r.latitude != null ? `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}` : "—")}</td>
                    <td className="p-2">
                      {r.fail_count > 0
                        ? <span className="text-primary text-xs uppercase tracking-widest font-bold">Defects Found</span>
                        : <span className="text-[#34C759] text-xs uppercase tracking-widest font-bold">Pass</span>}
                    </td>
                    <td className="p-2 mono">{r.fail_count || 0}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">
                    <ClipboardText size={32} weight="thin" className="mx-auto mb-3" />
                    No checklist submissions match these filters.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InspectionDetailPanel inspection={selected} onClose={() => setSelected(null)} onActioned={load} />
    </div>
  );
}
