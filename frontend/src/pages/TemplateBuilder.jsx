import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash, FloppyDisk, CaretLeft } from "@phosphor-icons/react";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function TemplateBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState([{ id: uid(), title: "New section", items: [] }]);

  useEffect(() => {
    if (!isNew) {
      api.get(`/templates/${id}`).then(r => {
        setName(r.data.name);
        setDescription(r.data.description || "");
        setSections(r.data.sections || []);
      });
    }
  }, [id, isNew]);

  const addSection = () => setSections([...sections, { id: uid(), title: "New section", items: [] }]);
  const removeSection = (sid) => setSections(sections.filter(s => s.id !== sid));
  const updateSection = (sid, field, value) => setSections(sections.map(s => s.id === sid ? { ...s, [field]: value } : s));

  const addItem = (sid) => setSections(sections.map(s => s.id === sid ? { ...s, items: [...s.items, { id: uid(), label: "New item", type: "boolean", required: true }] } : s));
  const removeItem = (sid, iid) => setSections(sections.map(s => s.id === sid ? { ...s, items: s.items.filter(i => i.id !== iid) } : s));
  const updateItem = (sid, iid, field, value) => setSections(sections.map(s => s.id === sid ? { ...s, items: s.items.map(i => i.id === iid ? { ...i, [field]: value } : i) } : s));

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    try {
      const payload = { name, description, sections };
      if (isNew) await api.post("/templates", payload);
      else await api.patch(`/templates/${id}`, payload);
      toast.success("Template saved");
      navigate("/templates");
    } catch { toast.error("Save failed"); }
  };

  return (
    <div className="noise-bg min-h-screen pb-24">
      <header className="border-b border-border px-8 py-6">
        <Link to="/templates" className="overline flex items-center gap-1 mb-3 hover:text-primary"><CaretLeft size={12}/> Back</Link>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="overline">Template builder</div>
            <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="builder-title">{isNew ? "New" : "Edit"} checklist</h1>
          </div>
          <button data-testid="save-template" onClick={save} className="flex items-center gap-2 bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
            <FloppyDisk size={14} /> Save template
          </button>
        </div>
      </header>

      <div className="p-8 max-w-4xl">
        <div className="bg-[#121214] border border-border p-6 space-y-4">
          <div>
            <label className="overline block mb-2">Template name</label>
            <input data-testid="template-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly Truck Inspection"
              className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="overline block mb-2">Description</label>
            <textarea data-testid="template-desc" value={description} onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {sections.map((sec, si) => (
            <div key={sec.id} className="bg-[#121214] border border-border">
              <div className="border-b border-border p-4 flex items-center gap-3">
                <div className="mono text-xs text-muted-foreground w-8">{String(si + 1).padStart(2, "0")}</div>
                <input value={sec.title} onChange={(e) => updateSection(sec.id, "title", e.target.value)}
                  data-testid={`section-title-${si}`}
                  className="flex-1 bg-transparent border-b border-transparent focus:border-primary focus:outline-none text-lg font-display font-bold py-1" />
                <button onClick={() => removeSection(sec.id)} className="text-muted-foreground hover:text-primary" data-testid={`remove-section-${si}`}><Trash size={16} /></button>
              </div>
              <div className="p-4 space-y-2">
                {sec.items.map((it, ii) => (
                  <div key={it.id} className="flex items-center gap-2 border border-border/60 p-2" data-testid={`item-${si}-${ii}`}>
                    <input value={it.label} onChange={(e) => updateItem(sec.id, it.id, "label", e.target.value)}
                      className="flex-1 bg-[#0b0b0d] border border-border px-2 py-1.5 text-sm focus:border-primary focus:outline-none" />
                    <select value={it.type} onChange={(e) => updateItem(sec.id, it.id, "type", e.target.value)}
                      className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-sm focus:border-primary focus:outline-none">
                      <option value="boolean">Pass/Fail</option>
                      <option value="rating">Rating</option>
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                    </select>
                    <label className="text-xs flex items-center gap-1">
                      <input type="checkbox" checked={it.required} onChange={(e) => updateItem(sec.id, it.id, "required", e.target.checked)} />
                      Required
                    </label>
                    <button onClick={() => removeItem(sec.id, it.id)} className="text-muted-foreground hover:text-primary"><Trash size={14} /></button>
                  </div>
                ))}
                <button onClick={() => addItem(sec.id)} className="flex items-center gap-1 text-xs uppercase tracking-widest text-primary hover:text-white" data-testid={`add-item-${si}`}>
                  <Plus size={12} /> Add item
                </button>
              </div>
            </div>
          ))}
          <button onClick={addSection} data-testid="add-section" className="border border-dashed border-border w-full py-3 text-xs uppercase tracking-widest text-muted-foreground hover:text-primary hover:border-primary flex items-center justify-center gap-2">
            <Plus size={14} /> Add section
          </button>
        </div>
      </div>
    </div>
  );
}
