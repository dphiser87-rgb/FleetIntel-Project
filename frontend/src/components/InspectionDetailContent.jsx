import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle, XCircle, MapPin, Wrench } from "@phosphor-icons/react";

export default function InspectionDetailContent({ id, onActioned }) {
  const [insp, setInsp] = useState(null);
  const [template, setTemplate] = useState(null);
  const [target, setTarget] = useState(null);
  const [linkedJob, setLinkedJob] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [showAlloc, setShowAlloc] = useState(false);
  const [mechanics, setMechanics] = useState([]);
  const [alloc, setAlloc] = useState({ title: "", description: "", priority: "medium", assigned_to: "" });

  const load = () => {
    api.get(`/inspections/${id}`).then(async ({ data }) => {
      setInsp(data);
      const [t, v, maint, mech] = await Promise.all([
        // Historical submissions render from their own snapshot rather than the live (possibly since-edited) template.
        data.template_snapshot ? Promise.resolve({ data: data.template_snapshot }) : api.get(`/templates/${data.template_id}`),
        data.vehicle_id ? api.get(`/vehicles/${data.vehicle_id}`) : api.get(`/assets/${data.asset_id}`),
        api.get("/maintenance"),
        api.get("/users/directory").catch(() => ({ data: [] })),
      ]);
      setTemplate(t.data);
      setTarget(v.data);
      setLinkedJob((maint.data || []).find((m) => m.inspection_id === id) || null);
      setMechanics((mech.data || []).filter((u) => u.role === "mechanic"));
      setAlloc((a) => ({ ...a, title: `Repair from checklist · ${v.data?.name || ""}`, description: `${data.fail_count || 0} failed item(s) on ${new Date(data.completed_at || data.created_at).toLocaleDateString()}` }));
    });
  };

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignToMaintenance = async () => {
    try {
      await api.post("/maintenance", {
        ...(insp.vehicle_id ? { vehicle_id: insp.vehicle_id, odometer: insp.odometer || null } : { asset_id: insp.asset_id }),
        inspection_id: insp.id,
        title: alloc.title, description: alloc.description, priority: alloc.priority,
        assigned_to: alloc.assigned_to || null,
      });
      toast.success("Maintenance job created");
      setShowAlloc(false);
      load();
      onActioned?.();
    } catch { toast.error("Failed to create maintenance job"); }
  };

  if (!insp || !template || !target) return <div className="p-12 text-muted-foreground text-sm">Loading…</div>;

  const ans = Object.fromEntries((insp.answers || []).map((a) => [a.item_id, a]));
  const isVehicle = !!insp.vehicle_id;

  return (
    <div className="space-y-6" data-testid="inspection-detail-content">
      <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders">
        {[
          ["Odometer", `${(insp.odometer || 0).toLocaleString()} km`],
          ["Failed items", insp.fail_count || 0],
          ["Total items", (insp.answers || []).length],
          ["Result", (insp.fail_count || 0) > 0 ? "Defects Found" : "Pass"],
        ].map(([l, v]) => (
          <div key={l} className="p-5 bg-[#121214]">
            <div className="overline">{l}</div>
            <div className="mono text-xl font-bold mt-2">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#121214] border border-border p-4">
          <div className="overline mb-2">Location captured</div>
          {insp.latitude != null ? (
            <div>
              <div className="flex items-start gap-2 text-sm" title={`${insp.latitude.toFixed(5)}, ${insp.longitude.toFixed(5)}`}>
                <MapPin size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                <span>{insp.address || <span className="mono">{insp.latitude.toFixed(5)}, {insp.longitude.toFixed(5)}</span>}</span>
              </div>
              <a href={`https://www.google.com/maps?q=${insp.latitude},${insp.longitude}`} target="_blank" rel="noreferrer"
                className="text-xs text-primary hover:underline mt-1 inline-block">View on map</a>
            </div>
          ) : insp.location_status === "denied" ? (
            <div className="text-sm text-primary">Location permission denied</div>
          ) : insp.location_status === "unavailable" ? (
            <div className="text-sm text-primary">GPS unavailable on device</div>
          ) : (
            <div className="text-sm text-muted-foreground">Not captured</div>
          )}
        </div>
        <div className="bg-[#121214] border border-border p-4">
          <div className="overline mb-2">Driver signature</div>
          {insp.signature ? (
            <img src={insp.signature} alt="Signature" className="h-16 bg-[#0b0b0d] border border-border" />
          ) : (
            <div className="text-sm text-muted-foreground">Not captured</div>
          )}
        </div>
      </div>

      {(insp.fail_count || 0) > 0 && (
        <div className="bg-primary/10 border border-primary/40 p-4">
          {linkedJob ? (
            <div className="flex items-center gap-3 text-sm">
              <Wrench size={18} className="text-primary shrink-0" />
              <div>Already routed to maintenance: <span className="font-bold">{linkedJob.title}</span> · <span className="uppercase text-xs">{linkedJob.status}</span></div>
            </div>
          ) : showAlloc ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={alloc.title} onChange={(e) => setAlloc({ ...alloc, title: e.target.value })} placeholder="Job title"
                  className="bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                <select value={alloc.priority} onChange={(e) => setAlloc({ ...alloc, priority: e.target.value })}
                  className="bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  {["low", "medium", "high", "critical"].map((p) => <option key={p}>{p}</option>)}
                </select>
                <select value={alloc.assigned_to} onChange={(e) => setAlloc({ ...alloc, assigned_to: e.target.value })}
                  className="bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none md:col-span-2">
                  <option value="">Unassigned mechanic</option>
                  {mechanics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={assignToMaintenance} data-testid="confirm-assign-maintenance" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Create job</button>
                <button onClick={() => setShowAlloc(false)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAlloc(true)} data-testid="assign-maintenance-btn" className="flex items-center gap-2 text-sm font-bold text-primary">
              <Wrench size={18} /> Assign defects to maintenance
            </button>
          )}
        </div>
      )}

      {template.sections.map((sec, si) => (
        <div key={sec.id} className="bg-[#121214] border border-border">
          <div className="border-b border-border p-4">
            <div className="overline">{sec.title}</div>
          </div>
          <div className="divide-y divide-border">
            {sec.items.map((it) => {
              const a = ans[it.id] || {};
              const v = String(a.value || "").toLowerCase();
              return (
                <div key={it.id} className="p-4 flex items-start gap-4 flex-wrap" data-testid={`detail-item-${it.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{it.label}</div>
                    {v === "fail" && (
                      <div className="mt-2 pl-3 border-l-2 border-primary/40 space-y-1.5">
                        {a.defect_type && (
                          <span className="inline-block text-[10px] uppercase tracking-widest text-primary border border-primary/40 px-2 py-0.5" data-testid={`defect-type-${it.id}`}>
                            {a.defect_type}
                          </span>
                        )}
                        {a.note && <div className="text-xs text-muted-foreground">{a.note}</div>}
                        {a.photo ? (
                          <img src={a.photo} alt="defect evidence" onClick={() => setLightbox(a.photo)}
                            className="mt-1 max-w-xs border border-border cursor-pointer hover:border-primary" />
                        ) : (
                          <div className="text-xs text-muted-foreground italic">No photo attached</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {v === "pass" && <span className="flex items-center gap-1 text-[#34C759] text-xs mono uppercase tracking-widest"><CheckCircle size={12} weight="bold" /> Pass</span>}
                    {v === "fail" && <span className="flex items-center gap-1 text-primary text-xs mono uppercase tracking-widest"><XCircle size={12} weight="bold" /> Fail</span>}
                    {v && v !== "pass" && v !== "fail" && <span className="mono text-sm">{a.value}</span>}
                    {!v && <span className="mono text-xs text-muted-foreground">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {insp.notes && (
        <div className="bg-[#121214] border border-border p-6">
          <div className="overline mb-2">General notes</div>
          <p className="text-sm leading-relaxed">{insp.notes}</p>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Defect full size" className="max-w-full max-h-full" />
        </div>
      )}
    </div>
  );
}
