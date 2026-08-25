import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CaretLeft, CheckCircle, XCircle, Wrench, Camera, MapPin, Warning } from "@phosphor-icons/react";
import SignaturePad from "@/components/SignaturePad";

// Mirrors maintenance.category — reused so a defect type maps directly onto the existing
// maintenance taxonomy instead of inventing a second, unrelated one.
const DEFECT_TYPES = ["tyres", "engine", "brakes", "electrical", "bodywork", "general"];

export default function Inspection() {
  const { targetType = "vehicle", vehicleId: routeVehicleId, id: routeId } = useParams();
  const vehicleId = routeVehicleId || routeId; // both route shapes resolve to the same param name inside this component
  const isVehicle = targetType === "vehicle";
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
  const [signature, setSignature] = useState(null);
  const [location, setLocation] = useState({ status: "idle", latitude: null, longitude: null });
  const clientSubmissionId = React.useRef(crypto.randomUUID()).current;
  const startedAt = React.useRef(new Date().toISOString()).current;

  const captureLocation = () => {
    if (!navigator.geolocation) { setLocation({ status: "unavailable" }); return; }
    setLocation({ status: "capturing" });
    // getCurrentPosition triggers the browser's native "Allow location access?" prompt itself.
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ status: "captured", latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => setLocation({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { timeout: 8000 }
    );
  };

  useEffect(() => {
    const fetchTarget = isVehicle ? api.get(`/vehicles/${vehicleId}`) : api.get(`/assets/${vehicleId}`);
    fetchTarget.then(r => { setVehicle(r.data); setOdometer(r.data.odometer || 0); });
    api.get("/templates").then(r => {
      const matching = r.data.filter(t => (t.type || "vehicle") === targetType);
      setTemplates(matching);
      if (matching[0]) setTemplateId(matching[0].id);
    });
    api.get("/users").then(r => setMechanics(r.data.filter(u => u.role === "mechanic")));
  }, [vehicleId, targetType, isVehicle]);

  useEffect(() => {
    if (templateId) api.get(`/templates/${templateId}`).then(r => setTemplate(r.data));
  }, [templateId]);

  const setAnswer = (itemId, value) => setAnswers({ ...answers, [itemId]: { ...(answers[itemId] || {}), value } });
  const setAnswerNote = (itemId, note) => setAnswers({ ...answers, [itemId]: { ...(answers[itemId] || {}), note } });
  const setAnswerDefectType = (itemId, defect_type) => setAnswers({ ...answers, [itemId]: { ...(answers[itemId] || {}), defect_type } });
  const setAnswerPhoto = (itemId, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setAnswers(a => ({ ...a, [itemId]: { ...(a[itemId] || {}), photo: reader.result } }));
    reader.readAsDataURL(file);
  };

  const failCount = Object.values(answers).filter(a => String(a.value).toLowerCase() === "fail").length;

  // Every defect is a hard stop until type, photo, and note are all present — not a soft warning.
  const defectValidationErrors = template
    ? template.sections.flatMap(s => s.items)
        .filter(it => String((answers[it.id] || {}).value).toLowerCase() === "fail")
        .map(it => {
          const a = answers[it.id] || {};
          const missing = [];
          if (!a.defect_type) missing.push("defect type");
          if (!a.photo) missing.push("photo");
          if (!a.note || !a.note.trim()) missing.push("note");
          return missing.length ? { item: it, missing } : null;
        })
        .filter(Boolean)
    : [];

  const odometerMissing = isVehicle && (odometer === "" || odometer === null || Number(odometer) <= 0);

  const submit = async () => {
    if (!template) return;
    if (odometerMissing) { toast.error("Odometer reading is required before submitting"); return; }
    if (!signature) { toast.error("Signature is required before submitting"); return; }
    if (defectValidationErrors.length > 0) {
      const first = defectValidationErrors[0];
      toast.error(`"${first.item.label}" is marked as a defect but is missing ${first.missing.join(", ")}`);
      return;
    }
    const payload = {
      template_id: template.id,
      ...(isVehicle ? { vehicle_id: vehicleId } : { asset_id: vehicleId }),
      odometer: isVehicle ? (Number(odometer) || null) : null,
      notes,
      answers: Object.entries(answers).map(([item_id, a]) => ({ item_id, value: String(a.value || ""), note: a.note || "", photo: a.photo || null, defect_type: a.defect_type || null })),
      completed_at: new Date().toISOString(),
      started_at: startedAt,
      signature,
      latitude: location.latitude,
      longitude: location.longitude,
      location_status: location.status === "captured" ? "captured" : location.status === "denied" ? "denied" : location.status === "unavailable" ? "unavailable" : "not_attempted",
      client_submission_id: clientSubmissionId,
    };
    try {
      const { data } = await api.post("/inspections", payload);
      setInspection(data);
      toast.success(`Inspection complete · ${failCount} failed items`);
      if (failCount > 0) {
        setAlloc({ ...alloc, title: `Repair from inspection · ${vehicle?.name}`, description: `${failCount} failed items on ${new Date().toLocaleDateString()}` });
        setStep("allocate");
      } else {
        setTimeout(() => navigate(isVehicle ? `/fleet/${vehicleId}` : "/assets"), 1000);
      }
    } catch { toast.error("Failed to save inspection — retry is safe, it won't create a duplicate"); }
  };

  const allocate = async () => {
    try {
      await api.post("/maintenance", {
        ...(isVehicle ? { vehicle_id: vehicleId, odometer: Number(odometer) || null } : { asset_id: vehicleId }),
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
        <Link to={isVehicle ? `/fleet/${vehicleId}` : "/assets"} className="overline flex items-center gap-1 mb-3 hover:text-primary"><CaretLeft size={12}/> Back to {isVehicle ? "vehicle" : "assets"}</Link>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="overline">{isVehicle ? `${vehicle.plate} · ${vehicle.name}` : `${vehicle.identifier || vehicle.kind} · ${vehicle.name}`}</div>
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
          {isVehicle && (
            <div>
              <label className="overline block mb-2">Odometer (km) <span className="text-primary">*</span></label>
              <div className="flex gap-1">
                <input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} data-testid="inspection-odometer"
                  className={`flex-1 bg-[#121214] border px-3 py-2.5 text-sm focus:outline-none ${odometerMissing ? "border-primary" : "border-border focus:border-primary"}`} />
                <label className="cursor-pointer border border-border px-3 py-2.5 text-xs text-muted-foreground hover:border-primary hover:text-primary flex items-center gap-1" data-testid="scan-odometer" title="Scan odometer from photo">
                  <Camera size={14} /> Scan
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                      try {
                        const { data } = await api.post("/ocr", { image_base64: reader.result, mode: "odometer" });
                        setOdometer(data.value);
                        toast.success(`Odometer: ${data.value}`);
                      } catch { toast.error("OCR failed"); }
                    };
                    reader.readAsDataURL(file);
                  }} />
                </label>
              </div>
            </div>
          )}
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
                const isFail = String(a.value).toLowerCase() === "fail";
                return (
                  <div key={it.id} className="p-4" data-testid={`answer-${it.id}`}>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{it.label}{it.required && <span className="text-primary">*</span>}</div>
                      </div>
                      {it.type === "boolean" && (
                        <div className="flex gap-2">
                          <button onClick={() => setAnswer(it.id, "pass")} className={`flex items-center gap-1 px-3 py-1.5 text-xs uppercase tracking-widest border ${a.value === "pass" ? "border-[#34C759] text-[#34C759] bg-[#34C759]/10" : "border-border text-muted-foreground hover:border-[#34C759] hover:text-[#34C759]"}`}>
                            <CheckCircle size={12} weight="bold" /> Pass
                          </button>
                          <button onClick={() => setAnswer(it.id, "fail")} className={`flex items-center gap-1 px-3 py-1.5 text-xs uppercase tracking-widest border ${isFail ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
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
                      {!isFail && (
                        <input value={a.note || ""} onChange={(e) => setAnswerNote(it.id, e.target.value)} placeholder="Note…"
                          className="w-full sm:w-56 bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
                      )}
                    </div>

                    {isFail && (
                      <div className="mt-3 pl-0 sm:pl-4 border-l-2 border-primary/40 flex flex-wrap items-start gap-2" data-testid={`defect-capture-${it.id}`}>
                        <select value={a.defect_type || ""} onChange={(e) => setAnswerDefectType(it.id, e.target.value)}
                          className={`px-2 py-1.5 text-xs uppercase tracking-widest bg-[#0b0b0d] border focus:outline-none ${!a.defect_type ? "border-primary text-primary" : "border-border"}`}
                          data-testid={`defect-type-${it.id}`}>
                          <option value="">Defect type *</option>
                          {DEFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input value={a.note || ""} onChange={(e) => setAnswerNote(it.id, e.target.value)} placeholder="Describe the defect… *"
                          className={`flex-1 min-w-[180px] bg-[#0b0b0d] border px-2 py-1.5 text-xs focus:outline-none ${!(a.note && a.note.trim()) ? "border-primary" : "border-border"}`} />
                        <label className={`cursor-pointer border px-2 py-1.5 text-xs ${!a.photo ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`} data-testid={`photo-${it.id}`}>
                          {a.photo ? "Photo ✓" : "+ Photo (required)"}
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setAnswerPhoto(it.id, e.target.files?.[0])} />
                        </label>
                        {a.photo && <img src={a.photo} alt="defect preview" className="w-16 h-16 object-cover border border-border" />}
                      </div>
                    )}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#121214] border border-border p-6">
            <label className="overline block mb-2">Location captured</label>
            {location.status === "captured" ? (
              <div className="flex items-center gap-2 text-sm mono text-[#34C759]">
                <MapPin size={14} weight="bold" /> {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              </div>
            ) : (
              <div>
                <button type="button" onClick={captureLocation} data-testid="capture-location" className="flex items-center gap-2 text-xs uppercase tracking-widest border border-border px-3 py-2 hover:border-primary hover:text-primary">
                  <MapPin size={14} /> {location.status === "capturing" ? "Capturing…" : location.status === "denied" || location.status === "unavailable" ? "Retry" : "Capture location"}
                </button>
                {location.status === "denied" && <div className="text-xs text-primary mt-2">Location permission denied</div>}
                {location.status === "unavailable" && <div className="text-xs text-primary mt-2">GPS unavailable on this device</div>}
              </div>
            )}
          </div>
          <div className="bg-[#121214] border border-border p-6">
            <label className="overline block mb-2">Signature *</label>
            <SignaturePad onChange={setSignature} />
          </div>
        </div>

        {(odometerMissing || !signature || defectValidationErrors.length > 0) && (
          <div className="flex items-start gap-2 text-xs text-primary bg-primary/10 border border-primary/30 px-3 py-2">
            <Warning size={14} className="mt-0.5 shrink-0" />
            <span>
              Before you can submit: {[
                odometerMissing && "odometer reading",
                !signature && "signature",
                defectValidationErrors.length > 0 && "defect type/photo/note on every failed item",
              ].filter(Boolean).join(", ")}.
              {defectValidationErrors.length > 0 && (
                <> {defectValidationErrors.map(({ item, missing }) => `"${item.label}" is missing ${missing.join(", ")}`).join("; ")}.</>
              )}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-6">
          <div className="mono text-sm">
            <span className="text-primary text-lg font-bold">{failCount}</span> failed / {Object.keys(answers).length} answered
          </div>
          <button data-testid="submit-inspection" onClick={submit} disabled={odometerMissing || !signature || defectValidationErrors.length > 0}
            className="flex items-center gap-2 bg-primary px-6 py-3 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
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
            <div className="text-xs text-muted-foreground mt-1">Allocate this {isVehicle ? "vehicle" : "asset"} to a maintenance job now.</div>
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
