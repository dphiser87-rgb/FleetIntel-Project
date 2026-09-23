import React, { useEffect, useMemo, useState } from "react";
import { api, downloadFile } from "@/lib/api";
import { ArrowDown, ArrowUp, ClipboardText, DownloadSimple, Gear, X } from "@phosphor-icons/react";
import InspectionDetailPanel from "@/components/InspectionDetailPanel";

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const COLUMNS = [
  { key: "vehicle", label: "Vehicle" },
  { key: "completed_by", label: "Completed By" },
  { key: "type", label: "Type" },
  { key: "template", label: "Template" },
  { key: "completed", label: "Completed" },
  { key: "location", label: "Location" },
  { key: "roadworthy", label: "Roadworthy" },
  { key: "defects", label: "Defects" },
  { key: "notes", label: "Notes" },
  { key: "duration", label: "Duration" },
];
const DEFAULT_VISIBLE = Object.fromEntries(COLUMNS.map((c) => [c.key, true]));
const COLUMNS_STORAGE_KEY = "fleetintel:vehicle-checklist-columns";

const loadVisibleColumns = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY));
    if (saved && typeof saved === "object") return { ...DEFAULT_VISIBLE, ...saved };
  } catch { /* corrupt or absent — fall back to defaults */ }
  return { ...DEFAULT_VISIBLE };
};

const withinPeriod = (iso, period) => {
  if (period === "all" || !iso) return true;
  const days = { "7d": 7, "30d": 30, "90d": 90 }[period];
  return (Date.now() - new Date(iso).getTime()) / 86400000 <= days;
};

const formatDuration = (startedAt, completedAt) => {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (!(ms > 0)) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "< 1 minute";
  return `${mins} minute${mins !== 1 ? "s" : ""}`;
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
  const [visibleCols, setVisibleCols] = useState(loadVisibleColumns);
  const [showColPicker, setShowColPicker] = useState(false);

  useEffect(() => {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(visibleCols));
  }, [visibleCols]);

  const toggleCol = (key) => setVisibleCols((v) => ({ ...v, [key]: !v[key] }));
  const resetCols = () => setVisibleCols({ ...DEFAULT_VISIBLE });
  const isVisible = (key) => visibleCols[key] !== false;

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

  const exportCsv = () => downloadFile("/export/inspections.csv", "inspections.csv");

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
          <option value="all">All completed by</option>
          {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="filter-period" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} submission{filtered.length !== 1 && "s"}</span>
        <div className="relative">
          <button onClick={() => setShowColPicker((s) => !s)} data-testid="column-settings-btn" title="Choose visible columns"
            className={`flex items-center justify-center w-8 h-8 border transition-colors ${showColPicker ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
            <Gear size={14} />
          </button>
          {showColPicker && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" onClick={() => setShowColPicker(false)} aria-label="Close" />
              <div className="absolute top-full right-0 mt-2 w-56 bg-[#121214] border border-border z-50 shadow-2xl" data-testid="column-picker">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                  <span className="text-xs font-bold uppercase tracking-widest">Columns</span>
                  <button onClick={() => setShowColPicker(false)} className="text-muted-foreground hover:text-primary"><X size={14} /></button>
                </div>
                <div className="max-h-72 overflow-y-auto py-1">
                  {COLUMNS.map((c) => (
                    <label key={c.key} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-white/5" data-testid={`col-toggle-${c.key}`}>
                      <input type="checkbox" checked={isVisible(c.key)} onChange={() => toggleCol(c.key)} className="accent-primary" />
                      {c.label}
                    </label>
                  ))}
                </div>
                <div className="border-t border-border p-2">
                  <button onClick={resetCols} data-testid="reset-columns-btn" className="w-full text-center text-xs uppercase tracking-widest text-muted-foreground hover:text-primary py-1.5">
                    Reset to default
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="p-8">
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading…</div>
        ) : (
          <div className="overflow-x-auto border border-border bg-[#121214]">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left overline">
                  {isVisible("vehicle") && <SortTh label="Vehicle" sortableKey="target_name" testid="sort-vehicle" />}
                  {isVisible("completed_by") && <th className="p-2">Completed By</th>}
                  {isVisible("type") && <th className="p-2">Type</th>}
                  {isVisible("template") && <th className="p-2">Template</th>}
                  {isVisible("completed") && <SortTh label="Completed" sortableKey="completed_at" testid="sort-completed" />}
                  {isVisible("location") && <th className="p-2">Location</th>}
                  {isVisible("roadworthy") && <th className="p-2">Roadworthy</th>}
                  {isVisible("defects") && <SortTh label="Defects" sortableKey="fail_count" testid="sort-defects" />}
                  {isVisible("notes") && <th className="p-2">Notes</th>}
                  {isVisible("duration") && <th className="p-2">Duration</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className="border-b border-border/50 hover:bg-primary/5 cursor-pointer" data-testid={`checklist-row-${r.id}`}>
                    {isVisible("vehicle") && <td className="p-2">{r.target_name} <span className="mono text-xs text-muted-foreground">{r.target_plate}</span></td>}
                    {isVisible("completed_by") && <td className="p-2">{r.inspector_name}</td>}
                    {isVisible("type") && <td className="p-2 text-xs uppercase text-muted-foreground">{r.target_kind}</td>}
                    {isVisible("template") && <td className="p-2">{r.template_name}</td>}
                    {isVisible("completed") && <td className="p-2 mono text-xs">{new Date(r.completed_at || r.created_at).toLocaleString()}</td>}
                    {isVisible("location") && <td className="p-2 text-xs text-muted-foreground truncate max-w-[180px]">{r.address || (r.latitude != null ? `${r.latitude.toFixed(3)}, ${r.longitude.toFixed(3)}` : "—")}</td>}
                    {isVisible("roadworthy") && (
                      <td className="p-2">
                        {r.fail_count > 0
                          ? <span className="text-destructive text-xs uppercase tracking-widest font-bold px-2 py-0.5 border border-destructive/40 bg-destructive/10">No</span>
                          : <span className="text-[#34C759] text-xs uppercase tracking-widest font-bold px-2 py-0.5 border border-[#34C759]/40 bg-[#34C759]/10">Yes</span>}
                      </td>
                    )}
                    {isVisible("defects") && <td className={`p-2 mono font-bold ${r.fail_count > 0 ? "text-destructive" : "text-[#34C759]"}`}>{r.fail_count || 0}</td>}
                    {isVisible("notes") && <td className="p-2 text-xs text-muted-foreground truncate max-w-[220px]" title={r.notes || ""}>{r.notes || "—"}</td>}
                    {isVisible("duration") && <td className="p-2 text-xs text-muted-foreground">{formatDuration(r.started_at, r.completed_at)}</td>}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={COLUMNS.length} className="p-12 text-center text-muted-foreground">
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
