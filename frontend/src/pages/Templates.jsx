import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash, PencilSimple, Copy, ClipboardText, MagnifyingGlass, X } from "@phosphor-icons/react";

const TYPE_BADGE = {
  vehicle: "border-[hsl(var(--chart-4))] text-[hsl(var(--chart-4))]",
  asset: "border-[hsl(var(--chart-3))] text-[hsl(var(--chart-3))]",
  trailer: "border-[hsl(var(--chart-5))] text-[hsl(var(--chart-5))]",
};

const FREQUENCY_LABEL = { daily: "Daily", weekly: "Weekly", each_trip: "Each trip", monthly: "Monthly" };
const FREQUENCY_COLOR = { daily: "#34C759", weekly: "#F0F1F3", each_trip: "#FFCC00", monthly: "hsl(var(--chart-5))" };

const AVATAR_COLORS = ["#34C759", "#3B82F6", "#A855F7", "#14B8A6", "#FF3B30", "#0891b2", "#F97316"];
const initials = (name) => (name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
const avatarColor = (id) => AVATAR_COLORS[[...(id || "")].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

function itemCountOf(t) {
  return (t.sections || []).reduce((s, sec) => s + (sec.items?.length || 0), 0);
}

function vehicleGroupLabel(t, groups) {
  if (t.assignment_scope === "group") {
    return groups.find(g => g.id === t.group_id)?.name || "Unnamed group";
  }
  if (t.assignment_scope === "specific") {
    const n = (t.target_ids || []).length;
    return `${n} specific vehicle${n === 1 ? "" : "s"}`;
  }
  return "All groups";
}

// Read-only preview of a template — opened by clicking anywhere on its row (not the action
// icons). Mirrors the reference design's slide-over: Details / All Items tabs, footer actions.
function DetailPanel({ template, users, groups, onClose, onEdit, onDelete, onDuplicate }) {
  const [tab, setTab] = useState("details");
  const enabledCount = itemCountOf(template);
  const createdByName = users.find(u => u.id === template.created_by)?.name || "—";
  const freq = template.frequency;

  const rows = [
    { label: "Template name", value: template.name },
    { label: "Type", value: (template.type || "vehicle").replace(/^\w/, c => c.toUpperCase()) },
    { label: "Frequency", value: freq ? FREQUENCY_LABEL[freq] : "Not scheduled" },
    { label: "Number of enabled items", value: `${enabledCount}` },
    { label: "Last update", value: template.updated_at ? new Date(template.updated_at).toLocaleString() : new Date(template.created_at).toLocaleDateString() },
    { label: "Created by", value: createdByName },
    { label: "Vehicle group", value: vehicleGroupLabel(template, groups) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose} data-testid="template-detail-panel">
      <div className="ml-auto h-full w-full max-w-md bg-[#0b0b0d] border-l border-border flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center gap-4 flex-shrink-0 border-b border-border">
          <div className="w-11 h-11 flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ background: avatarColor(template.id) }}>
            {initials(template.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="overline text-muted-foreground">{freq ? FREQUENCY_LABEL[freq] : "Not scheduled"} · {enabledCount} steps</p>
            <p className="font-display font-bold text-base uppercase leading-tight truncate">{template.name}</p>
            <p className="text-muted-foreground text-xs mt-0.5 mono">
              Last update: {template.updated_at ? new Date(template.updated_at).toLocaleString() : new Date(template.created_at).toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" data-testid="close-detail-panel">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-border flex-shrink-0">
          {[["details", "Details"], ["items", "All Items"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 -mb-px ${tab === key ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "details" && (
            <div className="divide-y divide-border">
              {rows.map(row => (
                <div key={row.label} className="py-3">
                  <p className="overline text-muted-foreground mb-1">{row.label}</p>
                  <p className="text-sm font-medium">{row.value}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "items" && (
            <div className="space-y-5">
              {(template.sections || []).map(sec => (sec.items || []).length > 0 && (
                <div key={sec.id}>
                  <p className="overline text-muted-foreground mb-2">{sec.title}</p>
                  <div className="space-y-1">
                    {sec.items.map(item => (
                      <div key={item.id} className="flex items-center gap-2.5 py-1.5 px-2">
                        <span className="text-base w-6 text-center">{item.icon?.startsWith("data:") ? <img src={item.icon} alt="" className="w-5 h-5 object-cover rounded-full inline-block" /> : (item.icon || "📋")}</span>
                        <span className="text-sm">{item.label}</span>
                        <span className="ml-auto text-[10px] font-semibold text-primary">ON</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {itemCountOf(template) === 0 && (
                <div className="text-center py-12 text-sm text-muted-foreground">No items in this template yet.</div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border flex-shrink-0">
          <button onClick={() => { onDelete(); onClose(); }} data-testid="detail-delete" className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-widest font-semibold border border-destructive text-destructive hover:bg-destructive/10 transition-colors">
            <Trash size={14} /> Delete
          </button>
          <button onClick={() => { onDuplicate(); onClose(); }} data-testid="detail-duplicate" className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-widest font-semibold border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors">
            <Copy size={14} /> Duplicate
          </button>
          <button onClick={onEdit} data-testid="detail-edit" className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-widest font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <PencilSimple size={14} /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const load = () => api.get("/templates").then(r => setTemplates(r.data));
  useEffect(() => {
    load();
    api.get("/users").then(r => setUsers(r.data || [])).catch(() => {});
    api.get("/vehicle-groups").then(r => setGroups(r.data || [])).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? templates.filter(t => t.name.toLowerCase().includes(q)) : templates;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [templates, search]);

  const del = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    await api.delete(`/templates/${id}`);
    toast.success("Template deleted");
    load();
  };

  const duplicate = async (id) => {
    await api.post(`/templates/${id}/duplicate`);
    toast.success("Template duplicated");
    load();
  };

  return (
    <div className="noise-bg min-h-screen" data-testid="templates-page">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Checklist Templates</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="templates-title">Checklist Templates</h1>
          <div className="text-sm text-muted-foreground mt-2">Configure inspection templates for vehicles, assets, and trailers — sent to drivers via the mobile app.</div>
        </div>
        <Link to="/templates/new" data-testid="new-template-btn" className="flex items-center gap-2 bg-primary px-4 py-2.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
          <Plus size={14} weight="bold" /> Create Template
        </Link>
      </header>

      <div className="px-8 pt-6 flex items-center justify-between">
        <div className="relative w-80">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            data-testid="template-search"
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#121214] border border-border focus:border-primary focus:outline-none"
          />
        </div>
        <div className="text-sm text-muted-foreground">{filtered.length} template{filtered.length !== 1 && "s"}</div>
      </div>

      <div className="p-8">
        <div className="bg-[#121214] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                {["Template Name", "Type", "Frequency", "Enabled Items", "Last Update", ""].map(h => (
                  <th key={h} className="overline px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const itemCount = itemCountOf(t);
                const type = t.type || "vehicle";
                const freq = t.frequency;
                return (
                  <tr
                    key={t.id}
                    data-testid={`template-row-${t.id}`}
                    onClick={() => setSelected(t)}
                    className="border-b border-border/50 hover:bg-white/[0.02] cursor-pointer"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{ background: avatarColor(t.id) }}>
                          {initials(t.name)}
                        </div>
                        <div className="font-display font-semibold">{t.name}</div>
                        {t.version > 1 && <span className="mono text-[10px] text-muted-foreground border border-border px-1.5 py-0.5">v{t.version}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-semibold border ${TYPE_BADGE[type] || TYPE_BADGE.vehicle}`}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-semibold" style={{ color: freq ? FREQUENCY_COLOR[freq] : "#636366" }}>
                      {freq ? FREQUENCY_LABEL[freq] : "Not scheduled"}
                    </td>
                    <td className="px-4 py-3.5 mono">{itemCount}</td>
                    <td className="px-4 py-3.5 mono text-muted-foreground">
                      {t.updated_at ? new Date(t.updated_at).toLocaleString() : new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Link to={`/templates/${t.id}`} data-testid={`edit-template-${t.id}`} title="Edit" className="w-8 h-8 border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary">
                          <PencilSimple size={14} />
                        </Link>
                        <button onClick={() => duplicate(t.id)} data-testid={`duplicate-template-${t.id}`} title="Copy" className="w-8 h-8 border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary">
                          <Copy size={14} />
                        </button>
                        <button onClick={() => del(t.id)} data-testid={`delete-template-${t.id}`} title="Delete" className="w-8 h-8 border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary">
                          <Trash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-20 text-sm text-muted-foreground">
              <ClipboardText size={32} weight="thin" className="mx-auto mb-3" />
              No templates match your search.
            </div>
          )}
        </div>
      </div>

      {selected && (
        <DetailPanel
          template={selected}
          users={users}
          groups={groups}
          onClose={() => setSelected(null)}
          onEdit={() => navigate(`/templates/${selected.id}`)}
          onDelete={() => del(selected.id)}
          onDuplicate={() => duplicate(selected.id)}
        />
      )}
    </div>
  );
}
