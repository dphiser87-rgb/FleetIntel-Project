import React, { useEffect, useMemo, useState } from "react";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Plus, UserCircle, Truck, X, FolderSimple, UploadSimple, DownloadSimple, ArrowUp, ArrowDown } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import GroupManager from "@/components/GroupManager";
import DriverPanel from "@/components/DriverPanel";
import LicenseExpiryBadge from "@/components/LicenseExpiryBadge";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";

const STATUS_COLOR = {
  active: "border-primary text-primary",
  inactive: "border-muted-foreground text-muted-foreground",
  on_leave: "border-[#FFCC00] text-[#FFCC00]",
};

const daysUntil = (iso) => {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
};

export default function Drivers() {
  const { currency } = useCurrency();
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [tripLogs, setTripLogs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [warningDays, setWarningDays] = useState(30);
  const [groupFilter, setGroupFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [showGroups, setShowGroups] = useState(false);
  const [panelDriver, setPanelDriver] = useState(null); // driver object | "new" | null
  const [detail, setDetail] = useState(null);

  const loadGroups = () => api.get("/driver-groups").then(r => setGroups(r.data || []));

  const load = async () => {
    const [d, v, t, ws] = await Promise.all([
      api.get("/drivers"), api.get("/vehicles"), api.get("/trip-logs"), api.get("/workspace"),
    ]);
    setDrivers(d.data); setVehicles(v.data); setTripLogs(t.data || []);
    setWarningDays(ws.data?.workspace?.license_warning_days ?? 30);
    // Keep an open panel's driver in sync with the reload — see the identical fix in Team.jsx.
    setPanelDriver((prev) => (prev && prev !== "new" ? d.data.find((x) => x.id === prev.id) || null : prev));
  };
  useEffect(() => { load(); loadGroups(); }, []);

  const vName = (id) => vehicles.find(v => v.id === id)?.name || null;
  const groupMap = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g])), [groups]);
  const trips30dByDriver = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const counts = {};
    for (const t of tripLogs) {
      if (!t.driver_id || new Date(t.occurred_at).getTime() < cutoff) continue;
      counts[t.driver_id] = (counts[t.driver_id] || 0) + 1;
    }
    return counts;
  }, [tripLogs]);
  const lastUpdateByDriver = useMemo(() => {
    const out = {};
    for (const t of tripLogs) {
      if (!t.driver_id) continue;
      const ts = new Date(t.occurred_at).getTime();
      if (!out[t.driver_id] || ts > out[t.driver_id]) out[t.driver_id] = ts;
    }
    return out;
  }, [tripLogs]);

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const visibleDrivers = useMemo(() => {
    let list = drivers;
    if (groupFilter !== "all") list = list.filter(d => d.group_id === groupFilter);
    if (statusFilter !== "all") list = list.filter(d => d.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d => d.name?.toLowerCase().includes(q) || d.number?.toLowerCase().includes(q));
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "vehicle") return String(vName(a.assigned_vehicle_id) || "").localeCompare(vName(b.assigned_vehicle_id) || "") * dir;
      if (sortKey === "license_expiry") return String(a.license_expiry || "").localeCompare(b.license_expiry || "") * dir;
      if (sortKey === "trips30d") return ((trips30dByDriver[a.id] || 0) - (trips30dByDriver[b.id] || 0)) * dir;
      return String(a[sortKey] || "").localeCompare(String(b[sortKey] || "")) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, groupFilter, statusFilter, search, sortKey, sortDir, vehicles, trips30dByDriver]);

  const del = async (id) => {
    if (!window.confirm("Delete this driver?")) return;
    await api.delete(`/drivers/${id}`);
    toast.success("Deleted"); load();
  };

  const openDetail = async (id) => {
    const { data } = await api.get(`/drivers/${id}/history`);
    setDetail(data);
  };

  const exportCsv = () => {
    const token = localStorage.getItem("token");
    const params = new URLSearchParams({ token });
    if (groupFilter !== "all") params.set("group_id", groupFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    window.open(`${API}/export/drivers.csv?${params.toString()}`, "_blank");
  };

  const expiringSoon = drivers.filter(d => {
    const days = daysUntil(d.license_expiry);
    return days !== null && days <= warningDays;
  });

  const SortTh = ({ label, k }) => (
    <th className="p-3 cursor-pointer hover:text-primary" onClick={() => toggleSort(k)}>
      <span className="flex items-center gap-1">{label}{sortKey === k && (sortDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}</span>
    </th>
  );

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">People</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="drivers-title">Drivers</h1>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <div className="overline">Total</div>
            <div className="mono text-xl font-bold mt-1">{drivers.length}</div>
          </div>
          <div>
            <div className="overline">Expiring &lt;{warningDays}d</div>
            <div className={`mono text-xl font-bold mt-1 ${expiringSoon.length ? "text-primary" : ""}`}>{expiringSoon.length}</div>
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" data-testid="driver-search"
            className="bg-[#121214] border border-border px-2 py-2 text-xs focus:border-primary focus:outline-none" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="driver-status-filter" className="bg-[#121214] border border-border px-2 py-2 text-xs uppercase tracking-widest">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_leave">On leave</option>
          </select>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} data-testid="driver-group-filter" className="bg-[#121214] border border-border px-2 py-2 text-xs uppercase tracking-widest">
            <option value="all">All groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => setShowGroups(true)} data-testid="manage-driver-groups-btn" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
            <FolderSimple size={14} /> Manage groups
          </button>
          <button onClick={exportCsv} data-testid="download-drivers-csv" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
            <DownloadSimple size={14} /> Download
          </button>
          <label className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary cursor-pointer" data-testid="import-drivers-csv">
            <UploadSimple size={14} /> Import drivers
            <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const text = await file.text();
              try {
                const { data } = await api.post("/import/driver-records", { csv: text });
                toast.success(`Imported ${data.created} driver${data.created !== 1 ? "s" : ""}${data.errors.length ? ` · ${data.errors.length} error(s)` : ""}`);
                if (data.errors.length) console.warn(data.errors);
                load();
              } catch { toast.error("Import failed"); }
              e.target.value = "";
            }} />
          </label>
          <a href={`${API}/import/driver-records/template.csv`} className="text-xs text-muted-foreground hover:text-primary underline" data-testid="download-driver-template">
            Template
          </a>
          <button data-testid="add-driver-btn" onClick={() => setPanelDriver("new")} className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
            <Plus size={14} weight="bold" /> New driver
          </button>
        </div>
      </header>

      <div className="p-8">
        <div className="bg-[#121214] border border-border overflow-x-auto" data-testid="drivers-table">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left overline">
                <SortTh label="Name" k="name" />
                <SortTh label="No." k="number" />
                <th className="p-3">Group</th>
                <SortTh label="Vehicle" k="vehicle" />
                <SortTh label="Trips (30d)" k="trips30d" />
                <SortTh label="Licence expiry" k="license_expiry" />
                <SortTh label="Status" k="status" />
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleDrivers.map(d => (
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
                  <td className="p-3 mono text-xs">{d.number || "—"}</td>
                  <td className="p-3">
                    {groupMap[d.group_id]
                      ? <span className="text-[10px] mono uppercase tracking-widest px-2 py-1 border" style={{ borderColor: groupMap[d.group_id].color || "#636366", color: groupMap[d.group_id].color || "#636366" }}>{groupMap[d.group_id].name}</span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="p-3 text-sm">{vName(d.assigned_vehicle_id) || <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-3 mono text-xs">{trips30dByDriver[d.id] || 0}</td>
                  <td className="p-3"><LicenseExpiryBadge expiry={d.license_expiry} warningDays={warningDays} /></td>
                  <td className="p-3">
                    <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${STATUS_COLOR[d.status] || ""}`}>{(d.status || "").replace("_", " ")}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => setPanelDriver(d)} data-testid={`edit-driver-${d.id}`} className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:border-primary hover:text-primary">Edit</button>
                      <button onClick={() => del(d.id)} className="border border-border px-2 py-1 text-[10px] uppercase tracking-widest hover:border-primary hover:text-primary">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleDrivers.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No drivers match these filters.</td></tr>}
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
                ["Total cost", formatMoneyFull(detail.total_cost, currency)],
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
                    <div className="mono">{formatMoneyFull(m.actual_cost || m.estimated_cost, currency)}</div>
                  </div>
                ))}
                {detail.maintenance.length === 0 && <div className="text-sm text-muted-foreground">No records.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      <Sheet open={showGroups} onOpenChange={setShowGroups}>
        <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-md flex flex-col" data-testid="driver-groups-sheet">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Driver groups</SheetTitle>
            <SheetDescription>Organize drivers into groups — e.g. Regional, Long-haul, Night shift.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 overflow-y-auto pr-1">
            <GroupManager
              groups={groups}
              onChange={() => { loadGroups(); load(); }}
              endpoint="/driver-groups"
              emptyHint="No groups yet. Create one to organize your drivers."
            />
          </div>
        </SheetContent>
      </Sheet>

      <DriverPanel driver={panelDriver} vehicles={vehicles} drivers={drivers} groups={groups}
        onClose={() => setPanelDriver(null)} onSaved={() => { setPanelDriver(null); load(); }} />
    </div>
  );
}
