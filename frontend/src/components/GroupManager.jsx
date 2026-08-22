import React, { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Trash, PencilSimple, Plus, X as XIcon, MagnifyingGlass, ArrowLeft,
} from "@phosphor-icons/react";
import GroupColorPicker from "@/components/GroupColorPicker";
import { DEFAULT_GROUP_COLOR } from "@/lib/color";

const emptyMeta = {
  vehicle: { fleet_type: "", branch: "", region: "", cost_centre: "" },
  driver: { description: "", department: "", region: "", cost_centre: "" },
  asset: { category: "", branch: "", region: "", cost_centre: "" },
};
const KIND_BY_ENDPOINT = { "/driver-groups": "driver", "/asset-groups": "asset", "/vehicle-groups": "vehicle" };
const ENTITY_ENDPOINT = { driver: "/drivers", asset: "/assets", vehicle: "/vehicles" };
const ENTITY_LABEL = { driver: "Drivers", asset: "Assets", vehicle: "Vehicles" };
const KIND_LABEL = { driver: "Driver", asset: "Asset", vehicle: "Vehicle" };

export default function GroupManager({
  groups, onChange, endpoint = "/vehicle-groups",
  emptyHint = "No groups yet. Create one to organize vehicles for \"view by group\" tiles.",
}) {
  const kind = KIND_BY_ENDPOINT[endpoint] || "vehicle";
  const entityEndpoint = ENTITY_ENDPOINT[kind];
  const entityLabel = ENTITY_LABEL[kind];

  const [view, setView] = useState("list"); // 'list' | 'form'
  const [editingGroup, setEditingGroup] = useState(null); // null = creating

  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_GROUP_COLOR);
  const [meta, setMeta] = useState(emptyMeta[kind]);
  const [initialSnapshot, setInitialSnapshot] = useState("");

  const [allEntities, setAllEntities] = useState([]); // full list, for member resolution + client stats
  const [health, setHealth] = useState([]); // /analytics/fleet-health or /analytics/driver-performance
  const [maintenance, setMaintenance] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);

  const [availSearch, setAvailSearch] = useState("");
  const [availStatus, setAvailStatus] = useState("");
  const [availType, setAvailType] = useState(""); // vehicle-only
  const [selectedAdd, setSelectedAdd] = useState(new Set());
  const [selectedRemove, setSelectedRemove] = useState(new Set());

  const isDirty = () => {
    const snapshot = JSON.stringify({ name, color, meta });
    return snapshot !== initialSnapshot;
  };

  const loadSupportingData = useCallback(async () => {
    try {
      if (kind === "asset") {
        // Assets have no cost/health scoring — just the entity list for member resolution + basic counts.
        const entRes = await api.get(entityEndpoint);
        setAllEntities(entRes.data);
        setHealth([]); setMaintenance([]); setFuelLogs([]);
        return;
      }
      const [entRes, healthRes] = await Promise.all([
        api.get(entityEndpoint),
        api.get(kind === "driver" ? "/analytics/driver-performance" : "/analytics/fleet-health"),
      ]);
      setAllEntities(entRes.data);
      setHealth(healthRes.data);
      const [maintRes, fuelRes] = await Promise.all([
        api.get("/maintenance"),
        kind === "vehicle" ? api.get("/fuel-logs") : Promise.resolve({ data: [] }),
      ]);
      setMaintenance(maintRes.data);
      setFuelLogs(fuelRes.data);
    } catch { /* summary stats are a nice-to-have; form still works without them */ }
  }, [entityEndpoint, kind]);

  const openCreate = () => {
    setEditingGroup(null);
    setName("");
    setColor(DEFAULT_GROUP_COLOR);
    setMeta(emptyMeta[kind]);
    setInitialSnapshot(JSON.stringify({ name: "", color: DEFAULT_GROUP_COLOR, meta: emptyMeta[kind] }));
    setSelectedAdd(new Set());
    setSelectedRemove(new Set());
    setAvailSearch(""); setAvailStatus(""); setAvailType("");
    setView("form");
    loadSupportingData();
  };

  const openEdit = (g) => {
    const m = kind === "driver"
      ? { description: g.description || "", department: g.department || "", region: g.region || "", cost_centre: g.cost_centre || "" }
      : kind === "asset"
      ? { category: g.category || "", branch: g.branch || "", region: g.region || "", cost_centre: g.cost_centre || "" }
      : { fleet_type: g.fleet_type || "", branch: g.branch || "", region: g.region || "", cost_centre: g.cost_centre || "" };
    setEditingGroup(g);
    setName(g.name);
    setColor(g.color || DEFAULT_GROUP_COLOR);
    setMeta(m);
    setInitialSnapshot(JSON.stringify({ name: g.name, color: g.color || DEFAULT_GROUP_COLOR, meta: m }));
    setSelectedAdd(new Set());
    setSelectedRemove(new Set());
    setAvailSearch(""); setAvailStatus(""); setAvailType("");
    setView("form");
    loadSupportingData();
  };

  const closeForm = () => {
    if (isDirty() && !window.confirm("You have unsaved changes. Discard them?")) return;
    setView("list");
    setEditingGroup(null);
  };

  const saveGroupInfo = async () => {
    if (!name.trim()) { toast.error("Group name is required"); return; }
    try {
      const payload = { name: name.trim(), color, ...meta };
      if (editingGroup) {
        const { data } = await api.patch(`${endpoint}/${editingGroup.id}`, payload);
        setEditingGroup(data);
        setInitialSnapshot(JSON.stringify({ name, color, meta }));
        toast.success("Group updated");
        onChange();
      } else {
        const { data } = await api.post(endpoint, payload);
        setEditingGroup(data);
        setInitialSnapshot(JSON.stringify({ name, color, meta }));
        toast.success("Group created");
        onChange();
      }
    } catch { toast.error("Failed to save group"); }
  };

  const removeGroup = async (id) => {
    if (!window.confirm("Delete this group? Members will become unassigned.")) return;
    try {
      await api.delete(`${endpoint}/${id}`);
      toast.success("Group deleted");
      onChange();
    } catch { toast.error("Failed to delete group"); }
  };

  const members = useMemo(
    () => editingGroup ? allEntities.filter((e) => e.group_id === editingGroup.id) : [],
    [allEntities, editingGroup]
  );
  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const available = useMemo(() => {
    let list = allEntities.filter((e) => !memberIds.has(e.id));
    if (availSearch.trim()) {
      const q = availSearch.trim().toLowerCase();
      list = list.filter((e) => (e.name || "").toLowerCase().includes(q) || (e.plate || "").toLowerCase().includes(q));
    }
    if (availStatus) list = list.filter((e) => e.status === availStatus);
    if (kind === "vehicle" && availType) list = list.filter((e) => e.type === availType);
    if (kind === "asset" && availType) list = list.filter((e) => e.kind === availType);
    return list.slice(0, 50); // scale guard: server-side search/limit is available via entityEndpoint?search=&limit= for larger fleets
  }, [allEntities, memberIds, availSearch, availStatus, availType, kind]);

  const toggleAdd = (id) => setSelectedAdd((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleRemove = (id) => setSelectedRemove((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const applyAdd = async () => {
    if (!editingGroup || selectedAdd.size === 0) return;
    try {
      await api.post(`${endpoint}/${editingGroup.id}/assign`, { add_ids: Array.from(selectedAdd) });
      setSelectedAdd(new Set());
      await loadSupportingData();
      onChange();
      toast.success(`Added ${selectedAdd.size} ${entityLabel.toLowerCase()}`);
    } catch { toast.error("Failed to add members"); }
  };

  const applyRemove = async () => {
    if (!editingGroup || selectedRemove.size === 0) return;
    try {
      await api.post(`${endpoint}/${editingGroup.id}/assign`, { remove_ids: Array.from(selectedRemove) });
      setSelectedRemove(new Set());
      await loadSupportingData();
      onChange();
      toast.success(`Removed ${selectedRemove.size} ${entityLabel.toLowerCase()}`);
    } catch { toast.error("Failed to remove members"); }
  };

  // Live summary strip
  const summary = useMemo(() => {
    if (!editingGroup) return null;
    if (kind === "driver") {
      const scoreMap = new Map(health.map((h) => [h.driver_id, h.score]));
      const scores = members.map((m) => scoreMap.get(m.id)).filter((s) => s !== undefined);
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      const memberIdSet = new Set(members.map((m) => m.id));
      const openDefects = maintenance.filter((m) => memberIdSet.has(m.driver_id) && !["completed", "cancelled"].includes(m.status)).length;
      return [
        { label: "Total drivers", value: members.length },
        { label: "Avg driver score", value: avgScore !== null ? avgScore : "—" },
        { label: "Open defects", value: openDefects },
      ];
    }
    if (kind === "asset") {
      const active = members.filter((m) => m.status === "active").length;
      const inMaintenance = members.filter((m) => m.status === "maintenance").length;
      return [
        { label: "Total assets", value: members.length },
        { label: "Active", value: active },
        { label: "In maintenance", value: inMaintenance },
      ];
    }
    const scoreMap = new Map(health.map((h) => [h.vehicle_id, h.score]));
    const scores = members.map((m) => scoreMap.get(m.id)).filter((s) => s !== undefined);
    const avgHealth = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const memberIdSet = new Set(members.map((m) => m.id));
    const openDefects = maintenance.filter((m) => memberIdSet.has(m.vehicle_id) && !["completed", "cancelled"].includes(m.status)).length;
    const maintCost = maintenance.filter((m) => memberIdSet.has(m.vehicle_id) && m.status === "completed").reduce((s, m) => s + Number(m.actual_cost || 0), 0);
    const fuelCost = fuelLogs.filter((f) => memberIdSet.has(f.vehicle_id)).reduce((s, f) => s + Number(f.cost || 0), 0);
    const avgCostPerKm = members.length
      ? (members.reduce((s, m) => s + Number(m.fuel_cost_per_km || 0), 0) / members.length)
      : 0;
    return [
      { label: "Vehicles selected", value: members.length },
      { label: "Avg fleet health", value: avgHealth !== null ? `${avgHealth}` : "—" },
      { label: "Open defects", value: openDefects },
      { label: "Monthly cost", value: `$${Math.round(maintCost + fuelCost).toLocaleString()}` },
      { label: "Cost per km", value: `$${avgCostPerKm.toFixed(2)}` },
    ];
  }, [editingGroup, kind, members, health, maintenance, fuelLogs]);

  if (view === "form") {
    return (
      <div className="space-y-5" data-testid="group-form">
        <div className="flex items-center gap-2">
          <button onClick={closeForm} className="text-muted-foreground hover:text-primary" data-testid="group-form-back">
            <ArrowLeft size={18} />
          </button>
          <h3 className="font-display text-lg font-bold flex-1">
            {editingGroup ? `Edit ${editingGroup.name}` : `New ${KIND_LABEL[kind]} Group`}
          </h3>
          <button onClick={closeForm} className="text-muted-foreground hover:text-primary" data-testid="group-form-close">
            <XIcon size={18} />
          </button>
        </div>

        {/* Section 1: group info */}
        <div className="border border-border p-4 space-y-3">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Group name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="group-form-name"
              className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>

          {kind === "driver" ? (
            <>
              <Field label="Description" value={meta.description} onChange={(v) => setMeta({ ...meta, description: v })} />
              <div className="grid grid-cols-3 gap-2">
                <Field label="Department" value={meta.department} onChange={(v) => setMeta({ ...meta, department: v })} />
                <Field label="Region" value={meta.region} onChange={(v) => setMeta({ ...meta, region: v })} />
                <Field label="Cost centre" value={meta.cost_centre} onChange={(v) => setMeta({ ...meta, cost_centre: v })} />
              </div>
            </>
          ) : kind === "asset" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Category" value={meta.category} onChange={(v) => setMeta({ ...meta, category: v })} />
              <Field label="Branch" value={meta.branch} onChange={(v) => setMeta({ ...meta, branch: v })} />
              <Field label="Region" value={meta.region} onChange={(v) => setMeta({ ...meta, region: v })} />
              <Field label="Cost centre" value={meta.cost_centre} onChange={(v) => setMeta({ ...meta, cost_centre: v })} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fleet type" value={meta.fleet_type} onChange={(v) => setMeta({ ...meta, fleet_type: v })} />
              <Field label="Branch" value={meta.branch} onChange={(v) => setMeta({ ...meta, branch: v })} />
              <Field label="Region" value={meta.region} onChange={(v) => setMeta({ ...meta, region: v })} />
              <Field label="Cost centre" value={meta.cost_centre} onChange={(v) => setMeta({ ...meta, cost_centre: v })} />
            </div>
          )}

          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Color</label>
            <GroupColorPicker value={color} onChange={setColor} groupName={name} />
            {editingGroup && (
              <div className="text-[11px] text-muted-foreground mt-2">
                Used on {members.length} {entityLabel.toLowerCase()}, and wherever this group appears in tile breakdowns and rows.
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={saveGroupInfo} className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90" data-testid="group-form-save">
              {editingGroup ? "Save changes" : "Create group"}
            </button>
            <button onClick={closeForm} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
              Cancel
            </button>
          </div>
        </div>

        {editingGroup && (
          <>
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="group-summary-strip">
                {summary.map((s) => (
                  <div key={s.label} className="border border-border p-2.5">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</div>
                    <div className="text-base font-display font-bold mt-0.5">{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Section 3: members in group */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs uppercase tracking-widest text-muted-foreground">{entityLabel} in group ({members.length})</h4>
                {selectedRemove.size > 0 && (
                  <button onClick={applyRemove} className="text-xs text-primary hover:underline" data-testid="apply-remove">
                    Remove {selectedRemove.size} selected
                  </button>
                )}
              </div>
              <div className="border border-border max-h-40 overflow-y-auto">
                {members.length === 0 && <div className="text-sm text-muted-foreground p-3">No members yet — add some below.</div>}
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/60 last:border-b-0" data-testid={`member-row-${m.id}`}>
                    <input type="checkbox" checked={selectedRemove.has(m.id)} onChange={() => toggleRemove(m.id)} aria-label={`Select ${m.name} to remove`} />
                    <span className="flex-1 text-sm truncate">{m.name}{m.plate ? ` · ${m.plate}` : ""}</span>
                    <button onClick={() => { setSelectedRemove(new Set([m.id])); applyRemove(); }} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${m.name}`}>
                      <Trash size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 2: available members */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs uppercase tracking-widest text-muted-foreground">Available {entityLabel.toLowerCase()}</h4>
                {selectedAdd.size > 0 && (
                  <button onClick={applyAdd} className="text-xs text-primary hover:underline" data-testid="apply-add">
                    Add {selectedAdd.size} selected
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                  <MagnifyingGlass size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={availSearch} onChange={(e) => setAvailSearch(e.target.value)} placeholder="Search…" data-testid="avail-search"
                    className="w-full pl-7 pr-2 py-1.5 bg-[#121214] border border-border text-sm focus:border-primary focus:outline-none" />
                </div>
                <select value={availStatus} onChange={(e) => setAvailStatus(e.target.value)} className="bg-[#121214] border border-border px-2 py-1.5 text-sm" data-testid="avail-status-filter">
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  {kind === "driver" ? (
                    <>
                      <option value="on_leave">On leave</option>
                      <option value="inactive">Inactive</option>
                    </>
                  ) : (
                    <option value="maintenance">Maintenance</option>
                  )}
                  <option value="idle">Idle</option>
                </select>
                {kind === "vehicle" && (
                  <select value={availType} onChange={(e) => setAvailType(e.target.value)} className="bg-[#121214] border border-border px-2 py-1.5 text-sm" data-testid="avail-type-filter">
                    <option value="">All types</option>
                    <option value="truck">Truck</option>
                    <option value="van">Van</option>
                    <option value="car">Car</option>
                    <option value="bus">Bus</option>
                    <option value="trailer">Trailer</option>
                  </select>
                )}
                {kind === "asset" && (
                  <select value={availType} onChange={(e) => setAvailType(e.target.value)} className="bg-[#121214] border border-border px-2 py-1.5 text-sm" data-testid="avail-type-filter">
                    <option value="">All kinds</option>
                    <option value="asset">Asset</option>
                    <option value="trailer">Trailer</option>
                  </select>
                )}
              </div>
              <div className="border border-border max-h-52 overflow-y-auto">
                {available.length === 0 && <div className="text-sm text-muted-foreground p-3">No matching {entityLabel.toLowerCase()}.</div>}
                {available.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/60 last:border-b-0" data-testid={`avail-row-${e.id}`}>
                    <input type="checkbox" checked={selectedAdd.has(e.id)} onChange={() => toggleAdd(e.id)} aria-label={`Select ${e.name} to add`} />
                    <span className="flex-1 text-sm truncate">{e.name}{e.plate ? ` · ${e.plate}` : ""}</span>
                    <span className="text-[10px] uppercase text-muted-foreground">{e.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="group-manager">
      <button onClick={openCreate} data-testid="new-group-btn"
        className="w-full flex items-center justify-center gap-1 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
        <Plus size={14} weight="bold" /> New {KIND_LABEL[kind].toLowerCase()} group
      </button>

      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.id} className="flex items-center gap-3 border border-border p-3" data-testid={`group-row-${g.id}`}>
            <span className="w-3 h-3 shrink-0 rounded-sm" style={{ background: g.color || "#636366" }} />
            <span className="flex-1 text-sm truncate">{g.name}</span>
            <button onClick={() => openEdit(g)} className="text-muted-foreground hover:text-primary" data-testid={`edit-group-${g.id}`}><PencilSimple size={16} /></button>
            <button onClick={() => removeGroup(g.id)} className="text-muted-foreground hover:text-destructive" data-testid={`delete-group-${g.id}`}><Trash size={16} /></button>
          </div>
        ))}
        {groups.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">{emptyHint}</div>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
    </div>
  );
}
