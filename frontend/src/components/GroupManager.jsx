import React, { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Trash, PencilSimple, Check, X as XIcon, Plus } from "@phosphor-icons/react";

const SWATCHES = ["#34C759", "#FF3B30", "#FFCC00", "#3B82F6", "#A855F7"];

export default function GroupManager({ groups, onChange }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[3]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.post("/vehicle-groups", { name: name.trim(), color });
      setName("");
      toast.success("Group created");
      onChange();
    } catch { toast.error("Failed to create group"); }
  };

  const rename = async (id) => {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      await api.patch(`/vehicle-groups/${id}`, { name: editName.trim() });
      setEditingId(null);
      onChange();
    } catch { toast.error("Failed to rename group"); }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/vehicle-groups/${id}`);
      toast.success("Group deleted");
      onChange();
    } catch { toast.error("Failed to delete group"); }
  };

  return (
    <div className="space-y-4" data-testid="group-manager">
      <form onSubmit={create} className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Long-haul, Regional, City fleet"
          data-testid="new-group-name"
          className="flex-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <div className="flex items-center gap-1">
          {SWATCHES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setColor(s)}
              className="w-5 h-5 border"
              style={{ background: s, borderColor: color === s ? "#fff" : "transparent" }}
              aria-label={`Choose color ${s}`}
            />
          ))}
        </div>
        <button type="submit" data-testid="create-group" className="flex items-center gap-1 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
          <Plus size={14} weight="bold" /> Add
        </button>
      </form>

      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.id} className="flex items-center gap-3 border border-border p-3" data-testid={`group-row-${g.id}`}>
            <span className="w-3 h-3 shrink-0" style={{ background: g.color || "#636366" }} />
            {editingId === g.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") rename(g.id); if (e.key === "Escape") setEditingId(null); }}
                  className="flex-1 bg-[#0b0b0d] border border-primary px-2 py-1 text-sm focus:outline-none"
                />
                <button onClick={() => rename(g.id)} className="text-primary hover:text-primary/80" data-testid={`save-group-${g.id}`}><Check size={16} /></button>
                <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-primary"><XIcon size={16} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm truncate">{g.name}</span>
                <button onClick={() => { setEditingId(g.id); setEditName(g.name); }} className="text-muted-foreground hover:text-primary" data-testid={`edit-group-${g.id}`}><PencilSimple size={16} /></button>
                <button onClick={() => remove(g.id)} className="text-muted-foreground hover:text-destructive" data-testid={`delete-group-${g.id}`}><Trash size={16} /></button>
              </>
            )}
          </div>
        ))}
        {groups.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No groups yet. Create one to organize vehicles for "view by group" tiles.</div>}
      </div>
    </div>
  );
}
