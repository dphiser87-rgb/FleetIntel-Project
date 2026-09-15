import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Truck, ClipboardText, UploadSimple, Heartbeat, FolderSimple, PencilSimple, SquaresFour, ListBullets } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import GroupManager from "@/components/GroupManager";
import VehiclePanel from "@/components/VehiclePanel";

const StatusBadge = ({ status }) => {
  const map = {
    active: { c: "border-[#34C759] text-[#34C759] bg-[#34C759]/10", l: "Active" },
    maintenance: { c: "border-[#FFCC00] text-[#FFCC00] bg-[#FFCC00]/10", l: "In maintenance" },
    idle: { c: "border-muted-foreground text-muted-foreground bg-white/5", l: "Idle" },
  };
  const s = map[status] || map.idle;
  return <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${s.c}`}>{s.l}</span>;
};

const HealthPill = ({ score, status }) => {
  const color = status === "healthy" ? "border-[#34C759] text-[#34C759] bg-[#34C759]/10" : status === "watch" ? "border-[#FFCC00] text-[#FFCC00] bg-[#FFCC00]/10" : "border-primary text-primary bg-primary/10";
  const label = status === "healthy" ? "Healthy" : status === "watch" ? "Watch" : "At risk";
  return (
    <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border flex items-center gap-1 ${color}`}>
      <Heartbeat size={11} weight="bold" /> {label} · {score}
    </span>
  );
};

export default function Fleet() {
  const [vehicles, setVehicles] = useState([]);
  const [health, setHealth] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupFilter, setGroupFilter] = useState("all");
  const [showGroups, setShowGroups] = useState(false);
  const [panelVehicle, setPanelVehicle] = useState(null); // vehicle object | "new" | null
  const [sortBy, setSortBy] = useState("health");
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"

  const loadGroups = () => api.get("/vehicle-groups").then(r => setGroups(r.data || []));
  const load = async () => {
    const [v, h] = await Promise.all([
      api.get("/vehicles"),
      api.get("/analytics/fleet-health").catch(() => ({ data: [] })),
    ]);
    setVehicles(v.data); setHealth(h.data || []);
    setPanelVehicle((prev) => (prev && prev !== "new" ? v.data.find((x) => x.id === prev.id) || null : prev));
  };
  useEffect(() => { load(); loadGroups(); }, []);

  const groupMap = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g])), [groups]);

  const healthMap = useMemo(() => Object.fromEntries(health.map(h => [h.vehicle_id, h])), [health]);
  const sortedVehicles = useMemo(() => {
    const visible = groupFilter === "all" ? vehicles : vehicles.filter(v => v.group_id === groupFilter);
    if (sortBy !== "health") return visible;
    return [...visible].sort((a, b) => {
      const sa = healthMap[a.id]?.score ?? 100;
      const sb = healthMap[b.id]?.score ?? 100;
      return sa - sb; // worst first
    });
  }, [vehicles, healthMap, sortBy, groupFilter]);

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4" data-testid="fleet-header">
        <div>
          <div className="overline">Assets</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="fleet-title">Fleet</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} data-testid="fleet-sort" className="bg-[#121214] border border-border px-2 py-2 text-xs uppercase tracking-widest">
          <option value="health">Sort · Health (worst first)</option>
          <option value="default">Sort · Default</option>
        </select>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} data-testid="vehicle-group-filter" className="bg-[#121214] border border-border px-2 py-2 text-xs uppercase tracking-widest">
          <option value="all">All groups</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button onClick={() => setShowGroups(true)} data-testid="manage-vehicle-groups-btn" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
          <FolderSimple size={14} /> Manage groups
        </button>
        <button data-testid="add-vehicle-btn" onClick={() => setPanelVehicle("new")} className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus size={14} weight="bold" /> Add vehicle
        </button>
        <label className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary cursor-pointer" data-testid="import-vehicles-csv">
          <UploadSimple size={14} /> Import CSV
          <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const text = await file.text();
            try {
              const { data } = await api.post("/import/vehicles", { csv: text });
              toast.success(`Imported ${data.created} vehicle${data.created !== 1 ? "s" : ""}${data.errors.length ? ` · ${data.errors.length} error(s)` : ""}`);
              if (data.errors.length) console.warn(data.errors);
              load();
            } catch { toast.error("Import failed"); }
            e.target.value = "";
          }} />
        </label>
        <a href={`${API}/import/vehicles/template.csv`} className="text-xs text-muted-foreground hover:text-primary underline" data-testid="download-vehicle-template">
          Download template
        </a>
        </div>
      </header>

      <div className="p-8">
        <div className="flex justify-end mb-4">
          <div className="flex border border-border" data-testid="fleet-view-toggle">
            <button onClick={() => setViewMode("grid")} data-testid="fleet-view-grid" title="Grid view"
              className={`p-2 ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}>
              <SquaresFour size={16} />
            </button>
            <button onClick={() => setViewMode("list")} data-testid="fleet-view-list" title="List view"
              className={`p-2 border-l border-border ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}>
              <ListBullets size={16} />
            </button>
          </div>
        </div>
        {viewMode === "list" ? (
        <div className="overflow-x-auto border border-border" data-testid="vehicle-list">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-[#121214]">
              <tr className="text-left overline">
                <th className="p-3">Vehicle</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Health</th>
                <th className="p-3">Odometer</th>
                <th className="p-3">Group</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedVehicles.map(v => {
                const h = healthMap[v.id];
                return (
                  <tr key={v.id} className="border-b border-border/50 hover:bg-[#121214]" data-testid={`vehicle-row-${v.plate}`}>
                    <td className="p-3">
                      <div className="font-display font-bold tracking-tight">{v.name}</div>
                      <div className="text-xs text-muted-foreground">{v.plate} · {v.year} {v.make} {v.model}</div>
                    </td>
                    <td className="p-3 overline">{v.type}</td>
                    <td className="p-3"><StatusBadge status={v.status} /></td>
                    <td className="p-3">{h ? <HealthPill score={h.score} status={h.status} /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-3 mono">{(v.odometer || 0).toLocaleString()} km</td>
                    <td className="p-3">
                      {groupMap[v.group_id] ? (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: groupMap[v.group_id].color || "#3B82F6" }} />
                          <span className="text-[10px] mono uppercase tracking-widest" style={{ color: groupMap[v.group_id].color || "#3B82F6" }}>{groupMap[v.group_id].name}</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Link to={`/fleet/${v.id}`} className="border border-border px-2 py-1.5 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors" data-testid={`view-${v.plate}`}>View</Link>
                        <Link to={`/inspection/${v.id}`} className="flex items-center gap-1 bg-primary/10 border border-primary/40 text-primary px-2 py-1.5 text-xs uppercase tracking-widest hover:bg-primary hover:text-primary-foreground transition-colors" data-testid={`inspect-${v.plate}`}>
                          <ClipboardText size={12} /> Inspect
                        </Link>
                        <button onClick={() => setPanelVehicle(v)} data-testid={`edit-vehicle-${v.plate}`} className="border border-border px-2 py-1.5 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors" title="Edit vehicle">
                          <PencilSimple size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedVehicles.length === 0 && (
                <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">No vehicles{groupFilter !== "all" ? " in this group" : ""}. Add one to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" data-testid="vehicle-grid">
          {sortedVehicles.map(v => {
            const h = healthMap[v.id];
            return (
            <div key={v.id} className="bg-[#121214] border border-border overflow-hidden hover:border-primary/60 transition-colors group" data-testid={`vehicle-${v.plate}`}>
              <div className="aspect-video bg-[#0b0b0d] relative overflow-hidden">
                {v.image_url ? (
                  <img src={v.image_url} alt={v.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Truck size={64} weight="thin" className="text-muted-foreground" />
                  </div>
                )}
                <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
                  <StatusBadge status={v.status} />
                  {h && <HealthPill score={h.score} status={h.status} />}
                </div>
                <div className="absolute bottom-3 left-3 overline text-white">{v.plate}</div>
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display text-xl font-bold tracking-tight">{v.name}</div>
                    <div className="text-xs text-muted-foreground">{v.year} · {v.make} {v.model}</div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-sm">{(v.odometer || 0).toLocaleString()} km</div>
                    <div className="overline mt-1">{v.type}</div>
                    {groupMap[v.group_id] && (
                      <div className="flex items-center gap-1 justify-end mt-1">
                        <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: groupMap[v.group_id].color || "#3B82F6" }} />
                        <span className="text-[10px] mono uppercase tracking-widest" style={{ color: groupMap[v.group_id].color || "#3B82F6" }}>{groupMap[v.group_id].name}</span>
                      </div>
                    )}
                  </div>
                </div>
                {h && h.factors.length > 0 && (
                  <div className="border-l-2 border-primary/40 pl-2 space-y-1" data-testid={`health-factors-${v.plate}`}>
                    {h.factors.slice(0, 2).map((f, i) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                        <span className="truncate">{f.label}</span>
                        <span className="mono text-primary shrink-0">{f.impact}</span>
                      </div>
                    ))}
                    {h.factors.length > 2 && <div className="text-[10px] mono text-muted-foreground">+{h.factors.length - 2} more</div>}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Link to={`/fleet/${v.id}`} className="flex-1 border border-border px-3 py-2 text-xs uppercase tracking-widest text-center hover:border-primary hover:text-primary transition-colors" data-testid={`view-${v.plate}`}>View</Link>
                  <Link to={`/inspection/${v.id}`} className="flex-1 flex items-center justify-center gap-1 bg-primary/10 border border-primary/40 text-primary px-3 py-2 text-xs uppercase tracking-widest hover:bg-primary hover:text-primary-foreground transition-colors" data-testid={`inspect-${v.plate}`}>
                    <ClipboardText size={12} /> Inspect
                  </Link>
                  <button onClick={() => setPanelVehicle(v)} data-testid={`edit-vehicle-${v.plate}`} className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors" title="Edit vehicle">
                    <PencilSimple size={12} />
                  </button>
                </div>
              </div>
            </div>
          )})}
        </div>
        )}
        {viewMode === "grid" && sortedVehicles.length === 0 && <div className="text-center text-muted-foreground py-24">No vehicles{groupFilter !== "all" ? " in this group" : ""}. Add one to get started.</div>}
      </div>

      <Sheet open={showGroups} onOpenChange={setShowGroups}>
        <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-md flex flex-col" data-testid="fleet-groups-sheet">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Vehicle groups</SheetTitle>
            <SheetDescription>Organize vehicles into fleets like Regional or Long-haul.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 overflow-y-auto pr-1">
            <GroupManager
              groups={groups}
              onChange={() => { loadGroups(); load(); }}
              endpoint="/vehicle-groups"
              emptyHint="No groups yet. Create one to organize vehicles for &quot;view by group&quot; tiles."
            />
          </div>
        </SheetContent>
      </Sheet>

      <VehiclePanel vehicle={panelVehicle} groups={groups}
        onClose={() => setPanelVehicle(null)} onSaved={() => { setPanelVehicle(null); load(); }} />
    </div>
  );
}
