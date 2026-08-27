import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Plus, Trash } from "@phosphor-icons/react";

const SECTIONS = [
  { key: "details", label: "Schedule Details" },
  { key: "intervals", label: "Intervals" },
  { key: "reminders", label: "Reminders" },
];

const TIME_UNITS = ["days", "weeks", "months", "years"];
const DISTANCE_UNITS = ["km", "mi"];

const emptyForm = {
  name: "", maintenance_type_id: "", asset_type_id: "", description: "", priority: "medium",
  vehicle_ids: [], asset_ids: [], intervals: [], reminders: [],
};

export default function ScheduleFormPanel({ schedule, vehicles, assets, maintenanceTypes, assetTypes, onClose, onSaved }) {
  const isNew = schedule === "new";
  const isOpen = !!schedule;
  const [section, setSection] = useState("details");
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!isOpen) return;
    setSection("details");
    if (isNew) {
      setForm(emptyForm);
    } else {
      setForm({
        name: schedule.name, maintenance_type_id: schedule.maintenance_type_id || "",
        asset_type_id: schedule.asset_type_id || "", description: schedule.description || "",
        priority: schedule.priority, status: schedule.status,
        vehicle_ids: schedule.assets.filter((a) => a.kind === "vehicle").map((a) => a.id),
        asset_ids: schedule.assets.filter((a) => a.kind === "asset").map((a) => a.id),
        intervals: schedule.intervals.map((i) => ({ trigger_type: i.trigger_type, every_n: i.every_n, unit: i.unit })),
        reminders: schedule.reminders.map((r) => ({ trigger_type: r.trigger_type, threshold_n: r.threshold_n })),
      });
    }
  }, [schedule, isOpen, isNew]);

  const addInterval = (trigger_type) => setForm((f) => ({
    ...f, intervals: [...f.intervals, { trigger_type, every_n: trigger_type === "time" ? 6 : trigger_type === "distance" ? 10000 : 500, unit: trigger_type === "time" ? "months" : trigger_type === "distance" ? "km" : "hours" }],
  }));
  const updateInterval = (i, field, value) => setForm((f) => ({ ...f, intervals: f.intervals.map((iv, ix) => ix === i ? { ...iv, [field]: value } : iv) }));
  const removeInterval = (i) => setForm((f) => ({ ...f, intervals: f.intervals.filter((_, ix) => ix !== i) }));

  const TIME_THRESHOLDS = [90, 60, 30, 14, 7, 3, 1];
  const toggleTimeReminder = (days) => setForm((f) => {
    const exists = f.reminders.some((r) => r.trigger_type === "time" && r.threshold_n === days);
    return { ...f, reminders: exists ? f.reminders.filter((r) => !(r.trigger_type === "time" && r.threshold_n === days)) : [...f.reminders, { trigger_type: "time", threshold_n: days }] };
  });

  const toggleVehicle = (id) => setForm((f) => ({ ...f, vehicle_ids: f.vehicle_ids.includes(id) ? f.vehicle_ids.filter((x) => x !== id) : [...f.vehicle_ids, id] }));
  const toggleAsset = (id) => setForm((f) => ({ ...f, asset_ids: f.asset_ids.includes(id) ? f.asset_ids.filter((x) => x !== id) : [...f.asset_ids, id] }));

  const save = async () => {
    if (!form.name.trim()) { toast.error("Schedule name is required"); setSection("details"); return; }
    if (!form.maintenance_type_id) { toast.error("Maintenance type is required"); setSection("details"); return; }
    if (form.vehicle_ids.length === 0 && form.asset_ids.length === 0) { toast.error("Select at least one asset"); setSection("details"); return; }
    if (form.intervals.length === 0) { toast.error("Add at least one interval trigger"); setSection("intervals"); return; }
    const payload = {
      name: form.name, maintenance_type_id: form.maintenance_type_id, asset_type_id: form.asset_type_id || null,
      description: form.description, priority: form.priority,
      vehicle_ids: form.vehicle_ids, asset_ids: form.asset_ids,
      intervals: form.intervals.map((i) => ({ trigger_type: i.trigger_type, every_n: Number(i.every_n), unit: i.unit })),
      reminders: form.reminders.map((r) => ({ trigger_type: r.trigger_type, threshold_n: Number(r.threshold_n) })),
    };
    try {
      if (isNew) await api.post("/maintenance-schedules", payload);
      else await api.patch(`/maintenance-schedules/${schedule.id}`, payload);
      toast.success(isNew ? "Schedule created" : "Schedule updated");
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to save schedule"); }
  };

  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-2xl flex flex-col overflow-hidden p-0" data-testid="schedule-form-panel">
        <SheetTitle className="sr-only">{isNew ? "New maintenance schedule" : form.name}</SheetTitle>
        <SheetDescription className="sr-only">Create or edit a preventative maintenance schedule</SheetDescription>
        <div className="border-b border-border px-6 py-4 shrink-0">
          <div className="overline">{isNew ? "New Schedule" : "Edit Schedule"}</div>
          <h2 className="font-display text-xl font-bold mt-0.5">{form.name || "Untitled schedule"}</h2>
        </div>
        <div className="flex-1 overflow-hidden flex">
          <div className="w-[180px] shrink-0 border-r border-border py-4 px-3 overflow-y-auto">
            {SECTIONS.map((s) => (
              <button key={s.key} onClick={() => setSection(s.key)} data-testid={`schedule-section-${s.key}`}
                className={`w-full text-left px-2 py-2 text-sm border-l-2 mb-0.5 ${section === s.key ? "border-primary text-primary bg-primary/10 font-bold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {section === "details" && (
              <>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Schedule Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="schedule-name"
                    className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Maintenance Type *</label>
                  <select value={form.maintenance_type_id} onChange={(e) => setForm({ ...form, maintenance_type_id: e.target.value })} data-testid="schedule-maintenance-type"
                    className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="">Select…</option>
                    {maintenanceTypes.map((t) => <option key={t.id} value={t.id}>{t.category} · {t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Asset Type</label>
                  <select value={form.asset_type_id} onChange={(e) => setForm({ ...form, asset_type_id: e.target.value })} data-testid="schedule-asset-type"
                    className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="">Not set</option>
                    {assetTypes.map((t) => <option key={t.id} value={t.id}>{t.category} · {t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Asset Selection * ({form.vehicle_ids.length + form.asset_ids.length} selected)</label>
                  <div className="mt-1 max-h-48 overflow-y-auto border border-border divide-y divide-border" data-testid="schedule-asset-selection">
                    {vehicles.map((v) => (
                      <label key={v.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-white/5">
                        <input type="checkbox" checked={form.vehicle_ids.includes(v.id)} onChange={() => toggleVehicle(v.id)} className="accent-primary" />
                        {v.name} <span className="mono text-xs text-muted-foreground">{v.plate}</span>
                      </label>
                    ))}
                    {assets.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-white/5">
                        <input type="checkbox" checked={form.asset_ids.includes(a.id)} onChange={() => toggleAsset(a.id)} className="accent-primary" />
                        {a.name} <span className="mono text-xs text-muted-foreground">{a.identifier}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Description</label>
                  <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} data-testid="schedule-priority"
                    className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    {["low", "medium", "high", "critical"].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </>
            )}

            {section === "intervals" && (
              <>
                <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 px-3 py-2">
                  Add one or more triggers — whichever is met first makes the maintenance due.
                </div>
                <div className="flex gap-2">
                  <button onClick={() => addInterval("time")} data-testid="add-time-interval" className="flex items-center gap-1 text-xs uppercase tracking-widest border border-border px-2 py-1.5 hover:border-primary hover:text-primary"><Plus size={12} /> Time</button>
                  <button onClick={() => addInterval("distance")} data-testid="add-distance-interval" className="flex items-center gap-1 text-xs uppercase tracking-widest border border-border px-2 py-1.5 hover:border-primary hover:text-primary"><Plus size={12} /> Distance</button>
                  <button onClick={() => addInterval("engine_hours")} data-testid="add-engine-hours-interval" className="flex items-center gap-1 text-xs uppercase tracking-widest border border-border px-2 py-1.5 hover:border-primary hover:text-primary"><Plus size={12} /> Engine Hours</button>
                </div>
                <div className="space-y-2">
                  {form.intervals.map((iv, i) => (
                    <div key={i} className="border border-border p-3 flex items-center gap-2" data-testid={`interval-row-${i}`}>
                      <span className="text-xs uppercase tracking-widest text-muted-foreground w-24 shrink-0">{iv.trigger_type.replace("_", " ")}</span>
                      <span className="text-sm text-muted-foreground">Every</span>
                      <input type="number" value={iv.every_n} onChange={(e) => updateInterval(i, "every_n", e.target.value)}
                        className="w-24 bg-[#0b0b0d] border border-border px-2 py-1.5 text-sm focus:border-primary focus:outline-none" />
                      <select value={iv.unit} onChange={(e) => updateInterval(i, "unit", e.target.value)}
                        className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-sm focus:border-primary focus:outline-none">
                        {iv.trigger_type === "time" && TIME_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        {iv.trigger_type === "distance" && DISTANCE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                        {iv.trigger_type === "engine_hours" && <option value="hours">hours</option>}
                      </select>
                      <button onClick={() => removeInterval(i)} className="ml-auto text-muted-foreground hover:text-primary"><Trash size={14} /></button>
                    </div>
                  ))}
                  {form.intervals.length === 0 && <div className="text-xs text-muted-foreground">No intervals configured yet.</div>}
                </div>
              </>
            )}

            {section === "reminders" && (
              <>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Time-based alerts (days before due)</label>
                  <div className="flex flex-wrap gap-2" data-testid="time-reminder-thresholds">
                    {TIME_THRESHOLDS.map((d) => {
                      const active = form.reminders.some((r) => r.trigger_type === "time" && r.threshold_n === d);
                      return (
                        <button key={d} onClick={() => toggleTimeReminder(d)} data-testid={`reminder-${d}`}
                          className={`px-3 py-1.5 text-xs uppercase tracking-widest border ${active ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
                          {d}d
                        </button>
                      );
                    })}
                  </div>
                </div>
                {form.intervals.some((i) => i.trigger_type === "distance" || i.trigger_type === "engine_hours") && (
                  <div className="text-xs text-muted-foreground bg-[#121214] border border-border p-3">
                    Distance and engine-hours triggers are configured on this schedule but won't fire
                    reminders yet — those meters only get manual/inspection-time readings today, not a
                    live feed. They'll activate automatically once a telematics integration supplies
                    continuous odometer/engine-hour data.
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2 pt-4 border-t border-border">
              <button onClick={save} data-testid="save-schedule-panel" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Save</button>
              <button onClick={onClose} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
