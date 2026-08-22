import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash, PencilSimple, Copy, ClipboardText, MagnifyingGlass } from "@phosphor-icons/react";

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

export default function Templates() {
  const [templates, setTemplates] = useState([]);
  const [search, setSearch] = useState("");

  const load = () => api.get("/templates").then(r => setTemplates(r.data));
  useEffect(() => { load(); }, []);

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
                const itemCount = (t.sections || []).reduce((s, sec) => s + (sec.items?.length || 0), 0);
                const type = t.type || "vehicle";
                const freq = t.frequency;
                return (
                  <tr key={t.id} data-testid={`template-row-${t.id}`} className="border-b border-border/50 hover:bg-white/[0.02]">
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
                      <div className="flex gap-1.5 justify-end">
                        <Link to={`/templates/${t.id}`} data-testid={`edit-template-${t.id}`} className="w-8 h-8 border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary">
                          <PencilSimple size={14} />
                        </Link>
                        <button onClick={() => duplicate(t.id)} data-testid={`duplicate-template-${t.id}`} className="w-8 h-8 border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary">
                          <Copy size={14} />
                        </button>
                        <button onClick={() => del(t.id)} data-testid={`delete-template-${t.id}`} className="w-8 h-8 border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary">
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
    </div>
  );
}
