import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Camera } from "@phosphor-icons/react";

const SECTIONS = [
  { key: "vehicle", label: "Vehicle" },
  { key: "odometer", label: "Odometer & Costs" },
  { key: "group", label: "Group" },
];

const emptyForm = {
  name: "", plate: "", make: "", model: "", year: 2023, type: "truck", status: "active",
  odometer: 0, fuel_cost_per_km: 0.35, downtime_cost_per_hour: 0, group_id: "",
};

export default function VehiclePanel({ vehicle, groups, onClose, onSaved }) {
  const isNew = vehicle === "new";
  const isOpen = !!vehicle;
  const [section, setSection] = useState("vehicle");
  const [form, setForm] = useState(emptyForm);
  const [initialSnapshot, setInitialSnapshot] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSection("vehicle");
    if (isNew) {
      setForm(emptyForm);
      setInitialSnapshot(JSON.stringify(emptyForm));
    } else {
      const f = {
        ...emptyForm,
        ...vehicle,
        group_id: vehicle.group_id || "",
      };
      setForm(f);
      setInitialSnapshot(JSON.stringify(f));
    }
  }, [vehicle, isOpen, isNew]);

  const isDirty = () => JSON.stringify(form) !== initialSnapshot;
  const requestClose = () => {
    if (isDirty() && !window.confirm("You have unsaved changes. Discard them?")) return;
    onClose();
  };

  const scan = (field, mode) => (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const { data } = await api.post("/ocr", { image_base64: reader.result, mode });
        setForm((f) => ({ ...f, [field]: data.value }));
        toast.success(`Scanned: ${data.value}`);
      } catch { toast.error("OCR failed"); }
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); setSection("vehicle"); return; }
    if (!form.plate.trim()) { toast.error("Licence plate is required"); setSection("vehicle"); return; }
    const payload = {
      name: form.name, plate: form.plate, make: form.make, model: form.model,
      year: Number(form.year), type: form.type, status: form.status,
      odometer: Number(form.odometer), fuel_cost_per_km: Number(form.fuel_cost_per_km),
      downtime_cost_per_hour: Number(form.downtime_cost_per_hour), group_id: form.group_id || null,
    };
    try {
      if (isNew) await api.post("/vehicles", payload);
      else await api.patch(`/vehicles/${vehicle.id}`, payload);
      toast.success(isNew ? "Vehicle added" : "Vehicle updated");
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to save"); }
  };

  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && requestClose()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-2xl flex flex-col overflow-hidden p-0" data-testid="vehicle-panel">
        <SheetTitle className="sr-only">{isNew ? "New vehicle" : form.name}</SheetTitle>
        <SheetDescription className="sr-only">Vehicle details, odometer, costs, and group</SheetDescription>
        <div className="border-b border-border px-6 py-4 shrink-0">
          <div className="overline">{isNew ? "New vehicle" : "Edit vehicle"}</div>
          <h2 className="font-display text-xl font-bold mt-0.5">{form.name || "Untitled vehicle"}</h2>
        </div>
        <div className="flex-1 overflow-hidden flex">
          <div className="w-[180px] shrink-0 border-r border-border py-4 px-3 overflow-y-auto">
            {SECTIONS.map((s) => (
              <button key={s.key} onClick={() => setSection(s.key)} data-testid={`vehicle-section-${s.key}`}
                className={`w-full text-left px-2 py-2 text-sm border-l-2 mb-0.5 ${section === s.key ? "border-primary text-primary bg-primary/10 font-bold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {section === "vehicle" && (
              <>
                <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testid="v-name" />
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Licence plate *</label>
                  <div className="flex gap-1 mt-1">
                    <input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} data-testid="v-plate"
                      className="flex-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                    <label className="cursor-pointer border border-border px-2 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary flex items-center" data-testid="ocr-plate" title="Scan licence plate from photo">
                      <Camera size={14} />
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={scan("plate", "plate")} />
                    </label>
                  </div>
                </div>
                <Field label="Make" value={form.make} onChange={(v) => setForm({ ...form, make: v })} testid="v-make" />
                <Field label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} testid="v-model" />
                <Field label="Year" type="number" value={form.year} onChange={(v) => setForm({ ...form, year: v })} testid="v-year" />
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} data-testid="v-type"
                    className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    {["truck", "van", "car", "bus", "trailer"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                {!isNew && (
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground">Status</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} data-testid="v-status"
                      className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                      <option value="active">Active</option>
                      <option value="maintenance">In maintenance</option>
                      <option value="idle">Idle</option>
                    </select>
                  </div>
                )}
              </>
            )}

            {section === "odometer" && (
              <>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Odometer (km)</label>
                  <div className="flex gap-1 mt-1">
                    <input type="number" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value })} data-testid="v-odometer"
                      className="flex-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                    <label className="cursor-pointer border border-border px-2 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary flex items-center" data-testid="ocr-odometer" title="Scan odometer from photo">
                      <Camera size={14} />
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={scan("odometer", "odometer")} />
                    </label>
                  </div>
                </div>
                <Field label="Fuel $/km" type="number" value={form.fuel_cost_per_km} onChange={(v) => setForm({ ...form, fuel_cost_per_km: v })} testid="v-fuel_cost_per_km" />
                <Field label="Downtime cost/hour" type="number" value={form.downtime_cost_per_hour} onChange={(v) => setForm({ ...form, downtime_cost_per_hour: v })} testid="v-downtime_cost_per_hour" />
              </>
            )}

            {section === "group" && (
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Group</label>
                <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })} data-testid="v-group"
                  className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">No group</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t border-border">
              <button onClick={save} data-testid="save-vehicle-panel" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Save</button>
              <button onClick={requestClose} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, onChange, type = "text", testid }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</label>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={testid}
        className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
    </div>
  );
}
