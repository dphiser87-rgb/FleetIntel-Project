import React, { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

// Feature 8 — ship-with-defaults templates (Light Vehicle / Truck / Trailer / Yellow Equipment),
// applying one bulk-creates a schedule per template item, all assigned to the picked assets; the
// user then edits individual schedules afterwards exactly like any other (handled server-side).
export default function ApplyTemplatePanel({ open, templates, vehicles, assets, onClose, onApplied }) {
  const [templateId, setTemplateId] = useState("");
  const [vehicleIds, setVehicleIds] = useState([]);
  const [assetIds, setAssetIds] = useState([]);

  const reset = () => { setTemplateId(""); setVehicleIds([]); setAssetIds([]); };
  const close = () => { reset(); onClose(); };

  const toggleVehicle = (id) => setVehicleIds((v) => v.includes(id) ? v.filter((x) => x !== id) : [...v, id]);
  const toggleAsset = (id) => setAssetIds((v) => v.includes(id) ? v.filter((x) => x !== id) : [...v, id]);

  const apply = async () => {
    if (!templateId) { toast.error("Select a template"); return; }
    if (vehicleIds.length === 0 && assetIds.length === 0) { toast.error("Select at least one asset"); return; }
    try {
      const { data } = await api.post(`/maintenance-templates/${templateId}/apply`, { vehicle_ids: vehicleIds, asset_ids: assetIds });
      toast.success(`Created ${data.schedule_ids.length} schedule${data.schedule_ids.length !== 1 ? "s" : ""}`);
      close();
      onApplied();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to apply template"); }
  };

  const selectedTemplate = templates.find((t) => t.id === templateId);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-lg flex flex-col overflow-hidden p-0" data-testid="apply-template-panel">
        <SheetTitle className="sr-only">Apply maintenance template</SheetTitle>
        <SheetDescription className="sr-only">Bulk-create schedules from a maintenance template</SheetDescription>
        <div className="border-b border-border px-6 py-4 shrink-0">
          <div className="overline">Feature 8</div>
          <h2 className="font-display text-xl font-bold mt-0.5">Apply Template</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} data-testid="apply-template-select"
              className="w-full mt-1 bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
              <option value="">Select…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {selectedTemplate && (
            <div className="text-xs text-muted-foreground bg-[#121214] border border-border p-3 space-y-1">
              {selectedTemplate.items.map((i) => (
                <div key={i.id}>{i.maintenance_type_name} · every {i.every_n} {i.unit}</div>
              ))}
            </div>
          )}
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Apply to ({vehicleIds.length + assetIds.length} selected)</label>
            <div className="mt-1 max-h-64 overflow-y-auto border border-border divide-y divide-border" data-testid="apply-template-assets">
              {vehicles.map((v) => (
                <label key={v.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-white/5">
                  <input type="checkbox" checked={vehicleIds.includes(v.id)} onChange={() => toggleVehicle(v.id)} className="accent-primary" />
                  {v.name} <span className="mono text-xs text-muted-foreground">{v.plate}</span>
                </label>
              ))}
              {assets.map((a) => (
                <label key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-white/5">
                  <input type="checkbox" checked={assetIds.includes(a.id)} onChange={() => toggleAsset(a.id)} className="accent-primary" />
                  {a.name} <span className="mono text-xs text-muted-foreground">{a.identifier}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-4 border-t border-border">
            <button onClick={apply} data-testid="apply-template-btn" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Apply Template</button>
            <button onClick={close} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
