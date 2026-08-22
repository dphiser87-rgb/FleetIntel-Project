import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Plus, Trash, Warning } from "@phosphor-icons/react";

const REGULATIONS = ["EU 561/2006", "US FMCSA HOS", "South Africa NRTA", "Not tracked"];
const COUNTRY_CODES = ["+1", "+27", "+44", "+31", "+49", "+33", "+61", "+91"];

const SECTIONS = [
  { key: "driver", label: "Driver" },
  { key: "vehicle", label: "Vehicle assignment" },
  { key: "app_access", label: "App Access" },
  { key: "rules", label: "Working & driving time" },
  { key: "identification", label: "Driver identification" },
  { key: "license", label: "Driver's licence" },
  { key: "address", label: "Address" },
  { key: "group", label: "Group" },
];

const emptyForm = {
  name: "", number: "", company_department: "", email: "", phone: "", cell_country_code: "+27", private: false, additional_info: "",
  assigned_vehicle_id: "", app_access: { vehicle_checklist: false }, regulation: "",
  identification_method: "vehicle_assignment",
  has_license_detail: false, license_number: "", license_expiry: "", license_issuing_country: "",
  license_issuing_authority: "", license_issue_date: "", license_categories: [],
  address_country: "", address_street: "", address_zip: "", address_city: "", status: "active",
  group_id: "",
};

export default function DriverPanel({ driver, vehicles, drivers, groups, onClose, onSaved }) {
  const isNew = driver === "new";
  const isOpen = !!driver;
  const [section, setSection] = useState("driver");
  const [form, setForm] = useState(emptyForm);
  const [initialSnapshot, setInitialSnapshot] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSection("driver");
    if (isNew) {
      setForm(emptyForm);
      setInitialSnapshot(JSON.stringify(emptyForm));
    } else {
      // DB columns default to null, not "" — coalesce every null to "" so inputs stay controlled.
      const nullsToEmpty = Object.fromEntries(Object.entries(driver).map(([k, v]) => [k, v === null ? "" : v]));
      const f = {
        ...emptyForm,
        ...nullsToEmpty,
        app_access: driver.app_access || { vehicle_checklist: false },
        license_categories: driver.license_categories || [],
        has_license_detail: !!(driver.license_issuing_country || (driver.license_categories || []).length > 0),
        group_id: driver.group_id || "",
        assigned_vehicle_id: driver.assigned_vehicle_id || "",
        cell_country_code: driver.cell_country_code || "+27",
      };
      setForm(f);
      setInitialSnapshot(JSON.stringify(f));
    }
  }, [driver, isOpen, isNew]);

  const isDirty = () => JSON.stringify(form) !== initialSnapshot;
  const requestClose = () => {
    if (isDirty() && !window.confirm("You have unsaved changes. Discard them?")) return;
    onClose();
  };

  // Only vehicles not already assigned to another driver — plus this driver's own current vehicle.
  const availableVehicles = vehicles.filter((v) =>
    !drivers.some((d) => d.id !== driver?.id && d.assigned_vehicle_id === v.id) || v.id === form.assigned_vehicle_id
  );

  const addCategory = () => setForm((f) => ({ ...f, license_categories: [...f.license_categories, { category: "", codes: "", issue_date: "", expiration_date: "" }] }));
  const updateCategory = (i, field, value) => setForm((f) => ({ ...f, license_categories: f.license_categories.map((c, ci) => ci === i ? { ...c, [field]: value } : c) }));
  const removeCategory = (i) => setForm((f) => ({ ...f, license_categories: f.license_categories.filter((_, ci) => ci !== i) }));

  const appAccessBlocked = form.app_access.vehicle_checklist && !form.email;

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (appAccessBlocked) { toast.error("Vehicle Checklist app access requires an email — add one in the Driver section"); setSection("driver"); return; }
    if (form.has_license_detail) {
      if (!form.license_issuing_country) { toast.error("Issuing country is required for licence detail"); setSection("license"); return; }
      if (!form.license_issue_date) { toast.error("Issue date is required for licence detail"); setSection("license"); return; }
      for (const c of form.license_categories) {
        if (!c.category || !c.issue_date) { toast.error("Each licence category needs a category and issue date"); setSection("license"); return; }
      }
    }
    const payload = {
      name: form.name, number: form.number || null, company_department: form.company_department || null,
      email: form.email || null, phone: form.phone || null, cell_country_code: form.cell_country_code,
      private: form.private, additional_info: form.additional_info || null,
      assigned_vehicle_id: form.assigned_vehicle_id || null, app_access: form.app_access,
      regulation: form.regulation || null, identification_method: form.identification_method,
      license_number: form.license_number, license_expiry: form.license_expiry || null,
      license_issuing_country: form.has_license_detail ? form.license_issuing_country : null,
      license_issuing_authority: form.has_license_detail ? form.license_issuing_authority : null,
      license_issue_date: form.has_license_detail ? form.license_issue_date : null,
      license_categories: form.has_license_detail ? form.license_categories : [],
      address_country: form.address_country || null, address_street: form.address_street || null,
      address_zip: form.address_zip || null, address_city: form.address_city || null,
      status: form.status, group_id: form.group_id || null,
      hire_date: driver?.hire_date || "",
    };
    try {
      if (isNew) await api.post("/drivers", payload);
      else await api.patch(`/drivers/${driver.id}`, payload);
      toast.success(isNew ? "Driver added" : "Driver updated");
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to save"); }
  };

  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && requestClose()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-2xl flex flex-col overflow-hidden p-0" data-testid="driver-panel">
        <SheetTitle className="sr-only">{isNew ? "New driver" : form.name}</SheetTitle>
        <SheetDescription className="sr-only">Driver profile, vehicle assignment, app access, and compliance detail</SheetDescription>
        <div className="border-b border-border px-6 py-4 shrink-0">
          <div className="overline">{isNew ? "New driver" : "Edit driver"}</div>
          <h2 className="font-display text-xl font-bold mt-0.5">{form.name || "Untitled driver"}</h2>
        </div>
        <div className="flex-1 overflow-hidden flex">
          <div className="w-[180px] shrink-0 border-r border-border py-4 px-3 overflow-y-auto">
            {SECTIONS.map((s) => (
              <button key={s.key} onClick={() => setSection(s.key)} data-testid={`driver-section-${s.key}`}
                className={`w-full text-left px-2 py-2 text-sm border-l-2 mb-0.5 ${section === s.key ? "border-primary text-primary bg-primary/10 font-bold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {section === "driver" && (
              <>
                <Field label="Name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                <Field label="Number" value={form.number} onChange={(v) => setForm({ ...form, number: v })} />
                <Field label="Company / department" value={form.company_department} onChange={(v) => setForm({ ...form, company_department: v })} />
                <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Cell</label>
                  <div className="flex gap-2 mt-1">
                    <select value={form.cell_country_code} onChange={(e) => setForm({ ...form, cell_country_code: e.target.value })}
                      className="bg-[#121214] border border-border px-2 py-2 text-sm focus:border-primary focus:outline-none">
                      {COUNTRY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="flex-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.private} onChange={(e) => setForm({ ...form, private: e.target.checked })} /> Private
                </label>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Additional information</label>
                  <textarea rows={2} value={form.additional_info} onChange={(e) => setForm({ ...form, additional_info: e.target.value })}
                    className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="on_leave">On leave</option>
                  </select>
                </div>
              </>
            )}

            {section === "vehicle" && (
              <>
                <div className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 px-3 py-2">
                  Only vehicles not already assigned to another driver are selectable here. If in-cab
                  driver identification already paired this driver to a vehicle, that pairing can't be
                  overridden from this panel.
                </div>
                <select value={form.assigned_vehicle_id} onChange={(e) => setForm({ ...form, assigned_vehicle_id: e.target.value })} data-testid="driver-vehicle-select"
                  className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">Unassigned</option>
                  {availableVehicles.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.plate}</option>)}
                </select>
              </>
            )}

            {section === "app_access" && (
              <>
                <label className="flex items-center gap-2 text-sm bg-[#121214] border border-border p-3" data-testid="app-access-checklist">
                  <input type="checkbox" checked={form.app_access.vehicle_checklist}
                    onChange={(e) => setForm({ ...form, app_access: { ...form.app_access, vehicle_checklist: e.target.checked } })} />
                  Vehicle Checklist app
                </label>
                {appAccessBlocked && (
                  <div className="flex items-start gap-2 text-xs text-primary bg-primary/10 border border-primary/30 px-3 py-2">
                    <Warning size={14} className="mt-0.5 shrink-0" />
                    This driver needs an email on file to log into any app — add one in the Driver section.
                  </div>
                )}
              </>
            )}

            {section === "rules" && (
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Applicable regulation</label>
                <select value={form.regulation} onChange={(e) => setForm({ ...form, regulation: e.target.value })}
                  className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">Not set</option>
                  {REGULATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}

            {section === "identification" && (
              <div className="text-sm text-muted-foreground bg-[#121214] border border-border p-4">
                Determined by vehicle assignment — this driver is identified as whoever is assigned to
                the vehicle above. Direct identification (PIN, RFID, telemetry) isn't available yet; this
                field is ready to switch over without a data-model change once it is.
              </div>
            )}

            {section === "license" && (
              <>
                <Field label="Licence number *" value={form.license_number} onChange={(v) => setForm({ ...form, license_number: v })} />
                <Field label="Licence expiry" type="date" value={form.license_expiry} onChange={(v) => setForm({ ...form, license_expiry: v })} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.has_license_detail} onChange={(e) => setForm({ ...form, has_license_detail: e.target.checked })} data-testid="toggle-license-detail" />
                  Define additional licence information
                </label>
                {form.has_license_detail && (
                  <div className="space-y-3 pl-3 border-l-2 border-primary/40">
                    <Field label="Issuing country *" value={form.license_issuing_country} onChange={(v) => setForm({ ...form, license_issuing_country: v })} />
                    <Field label="Issuing authority" value={form.license_issuing_authority} onChange={(v) => setForm({ ...form, license_issuing_authority: v })} />
                    <Field label="Issue date *" type="date" value={form.license_issue_date} onChange={(v) => setForm({ ...form, license_issue_date: v })} />
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs uppercase tracking-widest text-muted-foreground">Categories</label>
                        <button onClick={addCategory} data-testid="add-license-category" className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus size={12} /> Add new category</button>
                      </div>
                      <div className="space-y-2">
                        {form.license_categories.map((c, i) => (
                          <div key={i} className="border border-border p-2 grid grid-cols-2 gap-2" data-testid={`license-category-${i}`}>
                            <input placeholder="Category * (e.g. Code 10)" value={c.category} onChange={(e) => updateCategory(i, "category", e.target.value)}
                              className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
                            <input placeholder="Codes" value={c.codes} onChange={(e) => updateCategory(i, "codes", e.target.value)}
                              className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
                            <input type="date" placeholder="Issue date *" value={c.issue_date || ""} onChange={(e) => updateCategory(i, "issue_date", e.target.value)}
                              className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
                            <div className="flex gap-2">
                              <input type="date" placeholder="Expiration" value={c.expiration_date || ""} onChange={(e) => updateCategory(i, "expiration_date", e.target.value)}
                                className="flex-1 bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
                              <button onClick={() => removeCategory(i)} className="text-muted-foreground hover:text-primary"><Trash size={14} /></button>
                            </div>
                          </div>
                        ))}
                        {form.license_categories.length === 0 && <div className="text-xs text-muted-foreground">No categories added.</div>}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {section === "address" && (
              <>
                <Field label="Country" value={form.address_country} onChange={(v) => setForm({ ...form, address_country: v })} />
                <Field label="Street" value={form.address_street} onChange={(v) => setForm({ ...form, address_street: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="ZIP / postal code" value={form.address_zip} onChange={(v) => setForm({ ...form, address_zip: v })} />
                  <Field label="City" value={form.address_city} onChange={(v) => setForm({ ...form, address_city: v })} />
                </div>
              </>
            )}

            {section === "group" && (
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Group</label>
                <select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })} data-testid="driver-group-select"
                  className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">No group</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t border-border">
              <button onClick={save} data-testid="save-driver-panel" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Save</button>
              <button onClick={requestClose} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</label>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
    </div>
  );
}
