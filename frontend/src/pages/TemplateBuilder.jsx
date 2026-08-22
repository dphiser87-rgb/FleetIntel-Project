import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash, FloppyDisk, ClipboardText, Car, Package, Truck } from "@phosphor-icons/react";

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const SECTIONS = [
  { key: "details", label: "Details" },
  { key: "vehicles", label: "Vehicles" },
  { key: "items", label: "Items" },
];

const TYPE_OPTIONS = [
  { value: "vehicle", label: "Vehicle", icon: Truck },
  { value: "asset", label: "Asset", icon: Package },
  { value: "trailer", label: "Trailer", icon: Car },
];

const FREQUENCY_OPTIONS = [
  { value: "", label: "Not scheduled" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "each_trip", label: "Each trip" },
  { value: "monthly", label: "Monthly" },
];

const DEFAULT_SECTIONS = () => [
  { id: uid(), title: "External", items: [] },
  { id: uid(), title: "Internal", items: [] },
];

export default function TemplateBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const [activeSection, setActiveSection] = useState("details");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("vehicle");
  const [frequency, setFrequency] = useState("");
  const [assignmentScope, setAssignmentScope] = useState("all");
  const [groupId, setGroupId] = useState("");
  const [targetIds, setTargetIds] = useState([]);
  const [sections, setSections] = useState(DEFAULT_SECTIONS());
  const [updatedAt, setUpdatedAt] = useState(null);
  const [version, setVersion] = useState(1);

  const [groups, setGroups] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    api.get("/vehicle-groups").then(r => setGroups(r.data || [])).catch(() => {});
    api.get("/vehicles").then(r => setVehicles(r.data || [])).catch(() => {});
    api.get("/assets").then(r => setAssets(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isNew) {
      api.get(`/templates/${id}`).then(r => {
        const t = r.data;
        setName(t.name);
        setDescription(t.description || "");
        setSections(t.sections || []);
        setType(t.type || "vehicle");
        setFrequency(t.frequency || "");
        setAssignmentScope(t.assignment_scope || "all");
        setGroupId(t.group_id || "");
        setTargetIds(t.target_ids || []);
        setUpdatedAt(t.updated_at);
        setVersion(t.version || 1);
      });
    }
  }, [id, isNew]);

  const targetOptions = type === "vehicle" ? vehicles : assets.filter(a => a.kind === type);

  const addSection = () => setSections([...sections, { id: uid(), title: "New section", items: [] }]);
  const removeSection = (sid) => setSections(sections.filter(s => s.id !== sid));
  const updateSection = (sid, field, value) => setSections(sections.map(s => s.id === sid ? { ...s, [field]: value } : s));

  const addItem = (sid) => setSections(sections.map(s => s.id === sid ? { ...s, items: [...s.items, { id: uid(), label: "New item", type: "boolean", required: true, photo_required: false }] } : s));
  const removeItem = (sid, iid) => setSections(sections.map(s => s.id === sid ? { ...s, items: s.items.filter(i => i.id !== iid) } : s));
  const updateItem = (sid, iid, field, value) => setSections(sections.map(s => s.id === sid ? { ...s, items: s.items.map(i => i.id === iid ? { ...i, [field]: value } : i) } : s));

  const toggleTarget = (tid) => setTargetIds(ids => ids.includes(tid) ? ids.filter(x => x !== tid) : [...ids, tid]);

  const itemCount = sections.reduce((s, sec) => s + (sec.items?.length || 0), 0);

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required");
    try {
      const payload = {
        name, description, sections, type,
        frequency: frequency || null,
        assignment_scope: assignmentScope,
        group_id: assignmentScope === "group" ? (groupId || null) : null,
        target_ids: assignmentScope === "specific" ? targetIds : [],
        active: true,
      };
      if (isNew) await api.post("/templates", payload);
      else {
        const { data } = await api.patch(`/templates/${id}`, payload);
        if (data.id !== id) toast.info(`Saved as v${data.version} — existing submissions stay linked to the version they were filled in against.`);
      }
      toast.success("Template saved");
      navigate("/templates");
    } catch { toast.error("Save failed"); }
  };

  const del = async () => {
    if (isNew) { navigate("/templates"); return; }
    if (!window.confirm("Delete this template?")) return;
    await api.delete(`/templates/${id}`);
    toast.success("Template deleted");
    navigate("/templates");
  };

  return (
    <div className="noise-bg min-h-screen" data-testid="builder-page">
      <div className="border-b border-border px-8 py-6 flex items-center gap-4">
        <Link to="/templates" className="w-12 h-12 shrink-0 bg-primary/10 border border-primary/40 flex items-center justify-center" data-testid="builder-back">
          <ClipboardText size={22} weight="bold" className="text-primary" />
        </Link>
        <div>
          <div className="overline">
            {frequency ? FREQUENCY_OPTIONS.find(f => f.value === frequency)?.label : "Not scheduled"} · {itemCount} step{itemCount !== 1 && "s"}
            {version > 1 && <> · v{version}</>}
          </div>
          <div className="font-display font-bold text-xl my-0.5" data-testid="builder-title">{name || (isNew ? "New Template" : "Untitled")}</div>
          <div className="overline">
            {updatedAt ? `Last update: ${new Date(updatedAt).toLocaleDateString()}` : "Not yet saved"}
          </div>
        </div>
      </div>

      <div className="flex" style={{ minHeight: "calc(100vh - 200px)" }}>
        <div className="w-[220px] shrink-0 border-r border-border py-6 px-4">
          <div className="overline px-3 mb-2">Sections</div>
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setActiveSection(s.key)}
              data-testid={`section-nav-${s.key}`}
              className={`w-full text-left px-3 py-2.5 text-sm mb-0.5 border-l-2 ${activeSection === s.key ? "bg-primary/10 border-primary text-primary font-bold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex-1 px-10 py-8 max-w-3xl">
          {activeSection === "details" && (
            <>
              <div className="overline font-bold">Details</div>
              <div className="border-b border-border my-2" />
              <div className="text-sm text-muted-foreground mb-6">Configure the checklist according to your needs</div>

              <div className="space-y-5 max-w-lg">
                <div>
                  <label className="text-sm font-semibold block mb-1.5">Template name *</label>
                  <input data-testid="template-name" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Daily Vehicle Checklist"
                    className="w-full px-3 py-2.5 text-sm bg-[#121214] border border-border focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1.5">Description</label>
                  <textarea data-testid="template-desc" value={description} onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2.5 text-sm bg-[#121214] border border-border focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1.5">Type</label>
                  <div className="flex gap-2">
                    {TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setType(opt.value); setTargetIds([]); }}
                        data-testid={`type-${opt.value}`}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border ${type === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                      >
                        <opt.icon size={14} /> {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1.5">Frequency</label>
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value)} data-testid="template-frequency"
                    className="w-full px-3 py-2.5 text-sm bg-[#121214] border border-border focus:border-primary focus:outline-none">
                    {FREQUENCY_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  {frequency && frequency !== "each_trip" && (
                    <div className="text-xs text-muted-foreground mt-1.5">An alert fires (in-app + email) if a checklist isn't completed within this window.</div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeSection === "vehicles" && (
            <>
              <div className="overline font-bold">Vehicles</div>
              <div className="border-b border-border my-2" />
              <div className="text-sm text-muted-foreground mb-6">Choose which {type === "vehicle" ? "vehicles" : type + "s"} this checklist applies to.</div>

              <div className="space-y-2 max-w-lg">
                {[
                  ["all", `All ${type === "vehicle" ? "vehicles" : type + "s"}`],
                  ...(type === "vehicle" ? [["group", "By group"]] : []),
                  ["specific", "Specific " + (type === "vehicle" ? "vehicles" : type + "s")],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setAssignmentScope(val)}
                    data-testid={`scope-${val}`}
                    className={`w-full text-left flex items-center gap-3 px-4 py-3 border ${assignmentScope === val ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${assignmentScope === val ? "border-primary" : "border-border"}`}>
                      {assignmentScope === val && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </span>
                    <span className="text-sm font-semibold">{label}</span>
                  </button>
                ))}

                {assignmentScope === "group" && (
                  <select value={groupId} onChange={(e) => setGroupId(e.target.value)} data-testid="scope-group-select"
                    className="w-full px-3 py-2.5 text-sm bg-[#121214] border border-border mt-2 focus:border-primary focus:outline-none">
                    <option value="">Select a group…</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                )}

                {assignmentScope === "specific" && (
                  <div className="border border-border mt-2 max-h-64 overflow-y-auto" data-testid="scope-specific-list">
                    {targetOptions.length === 0 && <div className="text-sm text-muted-foreground p-4">No {type}s yet.</div>}
                    {targetOptions.map(v => (
                      <label key={v.id} className="flex items-center gap-3 px-4 py-2.5 text-sm border-b border-border/50 last:border-b-0">
                        <input type="checkbox" checked={targetIds.includes(v.id)} onChange={() => toggleTarget(v.id)} />
                        {v.name} {v.plate ? `· ${v.plate}` : v.identifier ? `· ${v.identifier}` : ""}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeSection === "items" && (
            <>
              <div className="overline font-bold">Items</div>
              <div className="border-b border-border my-2" />
              <div className="text-sm text-muted-foreground mb-6">Build the checklist as sections of items drivers complete in the mobile app — vehicle/trailer templates typically use "External" and "Internal" groups.</div>

              <div className="space-y-4">
                {sections.map((sec, si) => (
                  <div key={sec.id} className="border border-border">
                    <div className="border-b border-border p-3 flex items-center gap-3">
                      <div className="mono text-xs w-6 text-muted-foreground">{String(si + 1).padStart(2, "0")}</div>
                      <input value={sec.title} onChange={(e) => updateSection(sec.id, "title", e.target.value)}
                        data-testid={`section-title-${si}`}
                        className="flex-1 bg-transparent border-b border-transparent focus:border-primary focus:outline-none text-base font-display font-bold py-1" />
                      <button onClick={() => removeSection(sec.id)} data-testid={`remove-section-${si}`} className="text-muted-foreground hover:text-primary"><Trash size={15} /></button>
                    </div>
                    <div className="p-3 space-y-2">
                      {sec.items.map((it, ii) => (
                        <div key={it.id} className="flex items-center gap-2 border border-border/50 p-2 flex-wrap" data-testid={`item-${si}-${ii}`}>
                          <input value={it.label} onChange={(e) => updateItem(sec.id, it.id, "label", e.target.value)}
                            className="flex-1 min-w-[140px] px-2 py-1.5 text-sm bg-[#0b0b0d] border border-border focus:border-primary focus:outline-none" />
                          <select value={it.type} onChange={(e) => updateItem(sec.id, it.id, "type", e.target.value)}
                            className="px-2 py-1.5 text-sm bg-[#0b0b0d] border border-border focus:border-primary focus:outline-none">
                            <option value="boolean">Pass/Fail</option>
                            <option value="rating">Rating</option>
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                          </select>
                          <label className="text-xs flex items-center gap-1 text-muted-foreground">
                            <input type="checkbox" checked={it.required} onChange={(e) => updateItem(sec.id, it.id, "required", e.target.checked)} />
                            Required
                          </label>
                          <label className="text-xs flex items-center gap-1 text-muted-foreground" data-testid={`photo-required-${si}-${ii}`}>
                            <input type="checkbox" checked={!!it.photo_required} onChange={(e) => updateItem(sec.id, it.id, "photo_required", e.target.checked)} />
                            Photo required on defect
                          </label>
                          <button onClick={() => removeItem(sec.id, it.id)} className="text-muted-foreground hover:text-primary"><Trash size={14} /></button>
                        </div>
                      ))}
                      <button onClick={() => addItem(sec.id)} data-testid={`add-item-${si}`} className="flex items-center gap-1 text-xs uppercase tracking-widest font-semibold text-primary hover:text-primary/80">
                        <Plus size={12} /> Add item
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={addSection} data-testid="add-section" className="w-full py-3 text-xs uppercase tracking-widest font-semibold border border-dashed border-border text-muted-foreground flex items-center justify-center gap-2 hover:border-primary hover:text-primary">
                  <Plus size={14} /> Add section
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-border px-8 py-4 flex justify-between gap-3">
        {isNew ? <span /> : (
          <button onClick={del} data-testid="delete-template-btn" className="px-5 py-2.5 text-sm font-bold border border-border text-muted-foreground hover:border-primary hover:text-primary">
            Delete
          </button>
        )}
        <div className="flex gap-3">
          <Link to="/templates" data-testid="cancel-template" className="px-5 py-2.5 text-sm font-bold border border-border hover:border-primary hover:text-primary">
            Cancel
          </Link>
          <button onClick={save} data-testid="save-template" className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90">
            <FloppyDisk size={14} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
