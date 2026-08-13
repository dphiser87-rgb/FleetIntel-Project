import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash, PencilSimple, ClipboardText } from "@phosphor-icons/react";

export default function Templates() {
  const [templates, setTemplates] = useState([]);

  const load = () => api.get("/templates").then(r => setTemplates(r.data));
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    await api.delete(`/templates/${id}`);
    toast.success("Template deleted");
    load();
  };

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between">
        <div>
          <div className="overline">Inspection templates</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="templates-title">Checklists</h1>
        </div>
        <Link to="/templates/new" data-testid="new-template-btn" className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus size={14} weight="bold" /> New template
        </Link>
      </header>

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="templates-grid">
          {templates.map(t => {
            const itemCount = (t.sections || []).reduce((s, sec) => s + (sec.items?.length || 0), 0);
            return (
              <div key={t.id} className="bg-[#121214] border border-border p-6 hover:border-primary/60 transition-colors" data-testid={`template-${t.id}`}>
                <div className="flex items-start justify-between">
                  <ClipboardText size={28} weight="thin" className="text-primary" />
                  <div className="overline">{itemCount} items</div>
                </div>
                <h3 className="font-display text-xl font-bold tracking-tight mt-4">{t.name}</h3>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{t.description || "No description"}</p>
                <div className="mt-4 overline">{(t.sections || []).length} sections</div>
                <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                  <Link to={`/templates/${t.id}`} className="flex-1 flex items-center justify-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
                    <PencilSimple size={12} /> Edit
                  </Link>
                  <button onClick={() => del(t.id)} className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid={`delete-template-${t.id}`}>
                    <Trash size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {templates.length === 0 && <div className="text-center text-muted-foreground py-24">No templates yet. Create your first one.</div>}
      </div>
    </div>
  );
}
