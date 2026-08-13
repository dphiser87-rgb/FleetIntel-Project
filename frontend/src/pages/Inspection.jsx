import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CaretLeft, CheckCircle, XCircle, Wrench } from "@phosphor-icons/react";

export default function Inspection() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [template, setTemplate] = useState(null);
  const [answers, setAnswers] = useState({});
  const [notes, setNotes] = useState("");
  const [odometer, setOdometer] = useState("");
  const [step, setStep] = useState("inspect"); // inspect -> allocate
  const [inspection, setInspection] = useState(null);
  const [alloc, setAlloc] = useState({ title: "", description: "", priority: "medium", estimated_cost: 0, estimated_hours: 0, parts_cost: 0, labor_cost: 0, assigned_to: "" });
  const [mechanics, setMechanics] = useState([]);

  useEffect(() => {
    api.get(`/vehicles/${vehicleId}`).then(r => { setVehicle(r.data); setOdometer(r.data.odometer || 0); });
    api.get("/templates").then(r => {
      setTemplates(r.data);
      if (r.data[0]) setTemplateId(r.data[0].id);
    });
    api.get("/users").then(r => setMechanics(r.data.filter(u => u.role === "mechanic")));
  }, [vehicleId]);

  useEffect(() => {
    if (templateId) api.get(`/templates/${templateId}`).then(r => setTemplate(r.data));
  }, [templateId]);

  const setAnswer = (itemId, value) => setAnswers({ ...answers, [itemId]: { ...(answers[itemId] || {}), value } });
  const setAnswerNote = (itemId, note) => setAnswers({ ...answers, [itemId]: { ...(answers[itemId] || {}), note } });
  const setAnswerPhoto = (itemId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setAnswers(a => ({ ...a, [itemId]: { ...(a[itemId] || {}), photo: reader.result } }));
    reader.readAsDataURL(file);
  };

  const failCount = Object.values(answers).filter(a => String(a.value).toLowerCase() === "fail").length;

  const submit = async () => {
    if (!template) return;
    const payload = {
      template_id: template.id,
      vehicle_id: vehicleId,
      odometer: Number(odometer) || null,
      notes,
      answers: Object.entries(answers).map(([item_id, a]) => ({ item_id, value: String(a.value || ""), note: a.note || "", photo: a.photo || null })),
    };
    try {
      const { data } = await api.post("/inspections", payload);
      setInspection(data);
      toast.success(`Inspection complete · ${failCount} failed items`);
      setAlloc({ ...alloc, title: `Repair from inspection · ${vehicle?.name}`, description: `${failCount} failed items on ${new Date().toLocaleDateString()}` });
      if (failCount > 0) setStep("allocate");
      else setTimeout(() => navigate(`/fleet/${vehicleId}`), 1000);
    } catch { toast.error("Failed to save inspection"); }
  };

  const allocate = async () => {
    try {
      await api.post("/maintenance", {
        vehicle_id: vehicleId,
        inspection_id: inspection?.id,
        title: alloc.title,
        description: alloc.description,
        priority: alloc.priority,
        estimated_cost: Number(alloc.estimated_cost) || 0,
        estimated_hours: Number(alloc.estimated_hours) || 0,
        parts_cost: Number(alloc.parts_cost) || 0,
        labor_cost: Number(alloc.labor_cost) || 0,
        assigned_to: alloc.assigned_to || null,
      });
      toast.success("Maintenance job created");
      navigate("/maintenance");
    } catch { toast.error("Failed to allocate"); }
  };

  if (!vehicle) return <div className="p-12 text-muted-foreground">Loading…</div>;

  return (
    <div className="noise-bg min-h-screen pb-24">
      <header className="border-b border-border px-8 py-6">
        <Link to={`/fleet/${vehicleId}`} className="overline flex items-center gap-1 mb-3 hover:text-primary"><CaretLeft size={12}/> Back to vehicle</Link>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="overline">{vehicle.plate} · {vehicle.name}</div>
            <h1 className="font-display font-black text-4xl tracking-tight mt-1">{step === "inspect" ? "Digital inspection" : "Allocate for maintenance"}</h1>
          </div>
          <div className="mono text-xs text-muted-foreground">
            {step === "inspect" ? `${Object.keys(answers).length} answered · ${failCount} failed` : `From inspection ${inspection?.id?.slice(0, 8)}`}
          </div>
        </div>
      </header>

      {step === "inspect" && (
      <div className="p-8 max-w-4xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="overline block mb-2">Template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} data-testid="inspection-template"
              className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="overline block mb-2">Odometer (km)</label>
            <input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} data-testid="inspection-odometer"
              className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          </div>
        </div>

        {template && template.sections.map((sec, si) => (
          <div key={sec.id} className="bg-[#121214] border border-border">
            <div className="border-b border-border p-4">
              <div className="overline">Section {si + 1}</div>
              <h3 className="font-display text-xl font-bold tracking-tight mt-1">{sec.title}</h3>
            </div>
            <div className="divide-y divide-border">
              {sec.items.map((it) => {
                const a = answers[it.id] || {};
                return (
                  <div key={it.id} className="p-4 flex items-center gap-4 flex-wrap" data-testid={`answer-${it.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{it.label}{it.required && <span className="text-primary">*</span>}</div>
                    </div>
                    {it.type === "boolean" && (
                      <div className="flex gap-2">
                        <button onClick={() => setAnswer(it.id, "pass")} className={`flex items-center gap-1 px-3 py-1.5 text-xs uppercase tracking-widest border ${a.value === "pass" ? "border-[#34C759] text-[#34C759] bg-[#34C759]/10" : "border-border text-muted-foreground hover:border-[#34C759] hover:text-[#34C759]"}`}>
                          <CheckCircle size={12} weight="bold" /> Pass
                        </button>
                        <button onClick={() => setAnswer(it.id, "fail")} className={`flex items-center gap-1 px-3 py-1.5 text-xs uppercase tracking-widest border ${a.value === "fail" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
                          <XCircle size={12} weight="bold" /> Fail
                        </button>
                      </div>
                    )}
                    {it.type === "rating" && (
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => setAnswer(it.id, String(n))}
                            className={`w-8 h-8 border text-xs mono ${String(a.value) === String(n) ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary"}`}>{n}</button>
                        ))}
                      </div>
                    )}
                    {(it.type === "text" || it.type === "number") && (
                      <input type={it.type === "number" ? "number" : "text"} value={a.value || ""} onChange={(e) => setAnswer(it.id, e.target.value)}
                        className="w-64 bg-[#0b0b0d] border border-border px-2 py-1.5 text-sm focus:border-primary focus:outline-none" />
                    )}
                    <input value={a.note || ""} onChange={(e) => setAnswerNote(it.id, e.target.value)} placeholder="Note…"
                      className="w-full sm:w-56 bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
                    <label className="cursor-pointer border border-border px-2 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary" data-testid={`photo-${it.id}`}>
                      {a.photo ? "Photo ✓" : "+ Photo"}
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setAnswerPhoto(it.id, e.target.files?.[0])} />
                    </label>
                    {a.photo && <img src={a.photo} alt="preview" className="w-16 h-16 object-cover border border-border" />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="bg-[#121214] border border-border p-6">
          <label className="overline block mb-2">General notes</label>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="inspection-notes"
            className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-6">
          <div className="mono text-sm">
            <span className="text-primary text-lg font-bold">{failCount}</span> failed / {Object.keys(answers).length} answered
          </div>
          <button data-testid="submit-inspection" onClick={submit} className="flex items-center gap-2 bg-primary px-6 py-3 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
            Complete inspection{failCount > 0 && " & allocate"}
          </button>
        </div>
      </div>
      )}

      {step === "allocate" && (
      <div className="p-8 max-w-3xl">
        <div className="bg-primary/10 border border-primary/40 p-4 mb-6 flex items-start gap-3">
          <Wrench size={20} className="text-primary shrink-0 mt-0.5" />
          <div>
            <div className="text-sm">Inspection identified <span className="text-primary font-bold">{failCount} failed item{failCount !== 1 && "s"}</span></div>
            <div className="text-xs text-muted-foreground mt-1">Allocate this vehicle to a maintenance job now.</div>
          </div>
        </div>
        <div className="bg-[#121214] border border-border p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="overline block mb-2">Job title</label>
              <input value={alloc.title} onChange={(e) => setAlloc({...alloc, title: e.target.value})} data-testid="alloc-title"
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="overline block mb-2">Description</label>
              <textarea rows={2} value={alloc.description} onChange={(e) => setAlloc({...alloc, description: e.target.value})}
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="overline block mb-2">Priority</label>
              <select value={alloc.priority} onChange={(e) => setAlloc({...alloc, priority: e.target.value})} data-testid="alloc-priority"
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
                {["low","medium","high","critical"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="overline block mb-2">Assign mechanic</label>
              <select value={alloc.assigned_to} onChange={(e) => setAlloc({...alloc, assigned_to: e.target.value})} data-testid="alloc-mechanic"
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
                <option value="">Unassigned</option>
                {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="overline block mb-2">Est. parts cost</label>
              <input type="number" value={alloc.parts_cost} onChange={(e) => setAlloc({...alloc, parts_cost: e.target.value})}
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="overline block mb-2">Est. labor cost</label>
              <input type="number" value={alloc.labor_cost} onChange={(e) => setAlloc({...alloc, labor_cost: e.target.value})}
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="overline block mb-2">Est. hours downtime</label>
              <input type="number" value={alloc.estimated_hours} onChange={(e) => setAlloc({...alloc, estimated_hours: e.target.value})}
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2 pt-4 border-t border-border">
            <button data-testid="allocate-job-btn" onClick={allocate} className="bg-primary px-6 py-3 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Allocate to maintenance</button>
            <button onClick={() => navigate(`/fleet/${vehicleId}`)} className="border border-border px-6 py-3 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Skip</button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
