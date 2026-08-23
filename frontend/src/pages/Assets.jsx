import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Truck, Car, Package, FolderSimple } from "@phosphor-icons/react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import GroupManager from "@/components/GroupManager";

const StatusBadge = ({ status }) => {
  const map = {
    active: { c: "border-[#34C759] text-[#34C759] bg-[#34C759]/10", l: "Active" },
    maintenance: { c: "border-[#FFCC00] text-[#FFCC00] bg-[#FFCC00]/10", l: "In maintenance" },
    idle: { c: "border-muted-foreground text-muted-foreground bg-white/5", l: "Idle" },
  };
  const s = map[status] || map.idle;
  return <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${s.c}`}>{s.l}</span>;
};

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [filter, setFilter] = useState("all"); // all | asset | trailer
  const [groups, setGroups] = useState([]);
  const [groupFilter, setGroupFilter] = useState("all");
  const [showGroups, setShowGroups] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ kind: "asset", name: "", identifier: "", category: "", status: "active", group_id: "" });

  const load = () => api.get("/assets").then(r => setAssets(r.data || []));
  const loadGroups = () => api.get("/asset-groups").then(r => setGroups(r.data || []));
  useEffect(() => { load(); loadGroups(); }, []);

  const groupMap = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g])), [groups]);
  const filtered = useMemo(() => {
    let list = filter === "all" ? assets : assets.filter(a => a.kind === filter);
    if (groupFilter !== "all") list = list.filter(a => a.group_id === groupFilter);
    return list;
  }, [assets, filter, groupFilter]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/assets", { ...form, group_id: form.group_id || null });
      toast.success("Added");
      setShowAdd(false);
      setForm({ kind: "asset", name: "", identifier: "", category: "", status: "active", group_id: "" });
      load();
    } catch { toast.error("Failed to add"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this asset?")) return;
    await api.delete(`/assets/${id}`);
    toast.success("Deleted");
    load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4" data-testid="assets-header">
        <div>
          <div className="overline">Assets</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="assets-title">Assets &amp; Trailers</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="assets-filter" className="bg-[#121214] border border-border px-2 py-2 text-xs uppercase tracking-widest">
            <option value="all">All</option>
            <option value="asset">Assets only</option>
            <option value="trailer">Trailers only</option>
          </select>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} data-testid="asset-group-filter" className="bg-[#121214] border border-border px-2 py-2 text-xs uppercase tracking-widest">
            <option value="all">All groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => setShowGroups(true)} data-testid="manage-asset-groups-btn" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
            <FolderSimple size={14} /> Manage groups
          </button>
          <button data-testid="add-asset-btn" onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus size={14} weight="bold" /> Add asset
          </button>
        </div>
      </header>

      {showAdd && (
        <form onSubmit={save} className="border-b border-border bg-[#0d0d0f] p-6 grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="add-asset-form">
          <div>
            <label className="overline block mb-1">Kind</label>
            <select value={form.kind} onChange={set("kind")} className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
              <option value="asset">Asset</option>
              <option value="trailer">Trailer</option>
            </select>
          </div>
          <div>
            <label className="overline block mb-1">Name</label>
            <input required value={form.name} onChange={set("name")} data-testid="asset-name" className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="overline block mb-1">Identifier</label>
            <input value={form.identifier} onChange={set("identifier")} placeholder="Tag / unit no." data-testid="asset-identifier" className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="overline block mb-1">Category</label>
            <input value={form.category} onChange={set("category")} placeholder="e.g. forklift, flatbed" data-testid="asset-category" className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="overline block mb-1">Status</label>
            <select value={form.status} onChange={set("status")} className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
              <option value="idle">Idle</option>
            </select>
          </div>
          <div>
            <label className="overline block mb-1">Group</label>
            <select value={form.group_id} onChange={set("group_id")} data-testid="asset-group" className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
              <option value="">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="col-span-2 lg:col-span-5 flex gap-2">
            <button type="submit" data-testid="save-asset" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Save</button>
            <button type="button" onClick={() => setShowAdd(false)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
          </div>
        </form>
      )}

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" data-testid="asset-grid">
          {filtered.map(a => (
            <div key={a.id} className="bg-[#121214] border border-border overflow-hidden hover:border-primary/60 transition-colors group" data-testid={`asset-${a.id}`}>
              <div className="aspect-video bg-[#0b0b0d] relative overflow-hidden flex items-center justify-center">
                {a.kind === "trailer"
                  ? <Truck size={56} weight="thin" className="text-muted-foreground" />
                  : <Package size={56} weight="thin" className="text-muted-foreground" />}
                <div className="absolute top-3 right-3"><StatusBadge status={a.status} /></div>
                {a.identifier && <div className="absolute bottom-3 left-3 overline text-white">{a.identifier}</div>}
              </div>
              <div className="p-5 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="font-display text-xl font-bold tracking-tight">{a.name}</div>
                  {groupMap[a.group_id] && (
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: groupMap[a.group_id].color || "#3B82F6" }} />
                      <span className="text-[10px] mono uppercase tracking-widest" style={{ color: groupMap[a.group_id].color || "#3B82F6" }}>{groupMap[a.group_id].name}</span>
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{a.category || "—"} · <span className="capitalize">{a.kind}</span></div>
                <div className="flex gap-2 pt-3">
                  <Link to={`/inspection/asset/${a.id}`} className="flex-1 border border-border px-3 py-2 text-xs uppercase tracking-widest text-center hover:border-primary hover:text-primary transition-colors" data-testid={`inspect-asset-${a.id}`}>
                    Inspect
                  </Link>
                  <button onClick={() => del(a.id)} className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid={`delete-asset-${a.id}`}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {filtered.length === 0 && <div className="text-center text-muted-foreground py-24">No assets{groupFilter !== "all" ? " in this group" : ""}. Add one to get started.</div>}
      </div>

      <Sheet open={showGroups} onOpenChange={setShowGroups}>
        <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-md flex flex-col" data-testid="asset-groups-sheet">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Asset groups</SheetTitle>
            <SheetDescription>Organize assets and trailers into groups — e.g. Yard equipment, Long-haul trailers.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 overflow-y-auto pr-1">
            <GroupManager
              groups={groups}
              onChange={() => { loadGroups(); load(); }}
              endpoint="/asset-groups"
              emptyHint="No groups yet. Create one to organize your assets."
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
