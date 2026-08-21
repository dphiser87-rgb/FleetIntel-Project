import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const Field = ({ label, value }) => (
  <div>
    <div className="overline">{label}</div>
    <div className="text-sm mt-1">{value ?? <span className="text-muted-foreground">—</span>}</div>
  </div>
);

function FuelDetail({ id }) {
  const [rec, setRec] = useState(null);
  useEffect(() => { api.get(`/fuel-logs/${id}`).then((r) => setRec(r.data)).catch(() => toast.error("Unable to load fuel transaction")); }, [id]);
  if (!rec) return <div className="text-muted-foreground text-sm p-6">Loading…</div>;
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Vehicle" value={`${rec.vehicle_name} (${rec.vehicle_plate})`} />
      <Field label="Driver" value={rec.driver_name} />
      <Field label="Litres purchased" value={`${rec.litres} L`} />
      <Field label="Cost" value={money(rec.cost)} />
      <Field label="Location" value={rec.location} />
      <Field label="Date" value={(rec.occurred_at || "").slice(0, 16).replace("T", " ")} />
      {rec.odometer != null && <Field label="Odometer" value={`${rec.odometer.toLocaleString()} km`} />}
    </div>
  );
}

function MaintenanceDetail({ id }) {
  const [rec, setRec] = useState(null);
  useEffect(() => { api.get(`/maintenance/${id}`).then((r) => setRec(r.data)).catch(() => toast.error("Unable to load maintenance job")); }, [id]);
  if (!rec) return <div className="text-muted-foreground text-sm p-6">Loading…</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Vehicle" value={`${rec.vehicle_name} (${rec.vehicle_plate})`} />
        <Field label="Workshop / mechanic" value={rec.assigned_to_name || "Unassigned"} />
        <Field label="Status" value={rec.status} />
        <Field label="Priority" value={rec.priority} />
        <Field label="Invoice total" value={money(rec.actual_cost || rec.estimated_cost)} />
        <Field label="Vehicle downtime" value={`${rec.downtime_hours || 0} h`} />
        <Field label="Labour" value={money(rec.labor_cost)} />
        <Field label="Parts" value={money(rec.parts_cost)} />
        <Field label="Started" value={(rec.started_at || "").slice(0, 10)} />
        <Field label="Completed" value={(rec.completed_at || "").slice(0, 10)} />
      </div>
      {rec.description && (
        <div>
          <div className="overline mb-1">Notes</div>
          <div className="text-sm text-muted-foreground">{rec.description}</div>
        </div>
      )}
    </div>
  );
}

function IncidentDetail({ id }) {
  const [rec, setRec] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  useEffect(() => { api.get(`/incidents/${id}`).then((r) => setRec(r.data)).catch(() => toast.error("Unable to load incident")); }, [id]);
  if (!rec) return <div className="text-muted-foreground text-sm p-6">Loading…</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Vehicle" value={`${rec.vehicle_name} (${rec.vehicle_plate})`} />
        <Field label="Driver report by" value={rec.driver_name} />
        <Field label="Kind" value={rec.kind} />
        <Field label="Severity" value={rec.severity} />
        <Field label="Reported cost" value={money(rec.reported_cost)} />
        <Field label="Resolution status" value={rec.resolved ? "Resolved" : "Open"} />
        <Field label="Occurred" value={(rec.occurred_at || "").slice(0, 16).replace("T", " ")} />
        <Field label="Location" value={rec.location} />
      </div>
      <div>
        <div className="overline mb-1">Description</div>
        <div className="text-sm text-muted-foreground">{rec.description}</div>
      </div>
      {rec.resolution_notes && (
        <div>
          <div className="overline mb-1">Resolution notes</div>
          <div className="text-sm text-muted-foreground">{rec.resolution_notes}</div>
        </div>
      )}
      {rec.photos?.length > 0 && (
        <div>
          <div className="overline mb-2">Images ({rec.photos.length})</div>
          <div className="flex gap-2 flex-wrap">
            {rec.photos.map((p, i) => (
              <img key={i} src={p} alt={`Incident ${i + 1}`} onClick={() => setLightbox(p)} className="w-20 h-20 object-cover border border-border cursor-pointer hover:border-primary" />
            ))}
          </div>
        </div>
      )}
      {lightbox && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Incident full size" className="max-w-full max-h-full" />
        </div>
      )}
    </div>
  );
}

function DefectDetail({ id, itemId, noteHint }) {
  const [insp, setInsp] = useState(null);
  useEffect(() => { api.get(`/inspections/${id}`).then((r) => setInsp(r.data)).catch(() => toast.error("Unable to load inspection")); }, [id]);
  if (!insp) return <div className="text-muted-foreground text-sm p-6">Loading…</div>;
  const answer = (insp.answers || []).find((a) => a.item_id === itemId);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Inspector" value={insp.inspector_name} />
        <Field label="Date" value={(insp.created_at || "").slice(0, 10)} />
        <Field label="Value" value={answer?.value || "fail"} />
        <Field label="Odometer" value={insp.odometer != null ? `${insp.odometer.toLocaleString()} km` : null} />
      </div>
      <div>
        <div className="overline mb-1">Note</div>
        <div className="text-sm text-muted-foreground">{answer?.note || noteHint || "No note provided"}</div>
      </div>
      {answer?.photo && (
        <div>
          <div className="overline mb-2">Photo</div>
          <img src={answer.photo} alt="Defect" className="max-w-xs border border-border" />
        </div>
      )}
    </div>
  );
}

function InspectionDetail({ id }) {
  const [insp, setInsp] = useState(null);
  useEffect(() => { api.get(`/inspections/${id}`).then((r) => setInsp(r.data)).catch(() => toast.error("Unable to load inspection")); }, [id]);
  if (!insp) return <div className="text-muted-foreground text-sm p-6">Loading…</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Inspector" value={insp.inspector_name} />
        <Field label="Date" value={(insp.created_at || "").slice(0, 10)} />
        <Field label="Failed items" value={insp.fail_count} />
        <Field label="Odometer" value={insp.odometer != null ? `${insp.odometer.toLocaleString()} km` : null} />
      </div>
      {insp.notes && (
        <div>
          <div className="overline mb-1">Notes</div>
          <div className="text-sm text-muted-foreground">{insp.notes}</div>
        </div>
      )}
    </div>
  );
}

export default function Level4Detail({ event }) {
  if (!event) return null;
  const { type, meta } = event;
  return (
    <div className="p-6" data-testid="level4-detail">
      <div className="overline mb-4">Root cause · {type}</div>
      {type === "fuel" && <FuelDetail id={meta.id} />}
      {type === "maintenance" && <MaintenanceDetail id={meta.id} />}
      {type === "incident" && <IncidentDetail id={meta.id} />}
      {type === "defect" && <DefectDetail id={meta.id} itemId={meta.item_id} noteHint={meta.note} />}
      {type === "inspection" && <InspectionDetail id={meta.id} />}
    </div>
  );
}
