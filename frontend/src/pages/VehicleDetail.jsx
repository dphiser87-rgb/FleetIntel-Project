import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { CaretLeft, ClipboardText, Wrench } from "@phosphor-icons/react";

const money = (n) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function VehicleDetail() {
  const { id } = useParams();
  const [v, setV] = useState(null);
  const [insp, setInsp] = useState([]);
  const [maint, setMaint] = useState([]);

  useEffect(() => {
    api.get(`/vehicles/${id}`).then(r => setV(r.data));
    api.get(`/inspections`, { params: { vehicle_id: id } }).then(r => setInsp(r.data));
    api.get(`/maintenance`).then(r => setMaint(r.data.filter(m => m.vehicle_id === id)));
  }, [id]);

  if (!v) return <div className="p-12 text-muted-foreground">Loading vehicle…</div>;
  const totalCost = maint.filter(m => m.status === "completed").reduce((s, m) => s + (m.actual_cost || 0), 0);

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6">
        <Link to="/fleet" className="overline flex items-center gap-1 mb-3 hover:text-primary"><CaretLeft size={12}/> Back to fleet</Link>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="overline">{v.plate}</div>
            <h1 className="font-display font-black text-4xl tracking-tight mt-1">{v.name}</h1>
            <div className="text-sm text-muted-foreground mt-2">{v.year} · {v.make} {v.model} · {v.type}</div>
          </div>
          <div className="flex gap-2">
            <Link to={`/inspection/${v.id}`} className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid="run-inspection-btn">
              <ClipboardText size={14}/> Run inspection
            </Link>
          </div>
        </div>
      </header>

      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {v.image_url && (
            <div className="bg-[#121214] border border-border aspect-video overflow-hidden">
              <img src={v.image_url} alt={v.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders">
            {[
              ["Odometer", `${(v.odometer || 0).toLocaleString()} km`],
              ["Fuel cost", `${money(v.fuel_cost_per_km)}/km`],
              ["Total spent", money(totalCost)],
              ["Inspections", insp.length],
            ].map(([l, val]) => (
              <div key={l} className="p-5 bg-[#121214]">
                <div className="overline">{l}</div>
                <div className="mono text-xl font-bold mt-2">{val}</div>
              </div>
            ))}
          </div>

          <div className="bg-[#121214] border border-border p-6">
            <div className="overline">History</div>
            <h3 className="font-display text-2xl font-bold tracking-tight mt-1 mb-4">Maintenance log</h3>
            <div className="space-y-2">
              {maint.map(m => (
                <div key={m.id} className="flex items-center justify-between border-b border-border/50 py-2">
                  <div>
                    <div className="text-sm">{m.title}</div>
                    <div className="overline mt-1">{m.status} · {new Date(m.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="mono">{money(m.actual_cost || m.estimated_cost)}</div>
                </div>
              ))}
              {maint.length === 0 && <div className="text-sm text-muted-foreground py-4">No maintenance records.</div>}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#121214] border border-border p-6">
            <div className="overline">Recent inspections</div>
            <div className="mt-4 space-y-3">
              {insp.slice(0, 5).map(i => (
                <div key={i.id} className="border-b border-border/50 pb-3">
                  <div className="text-sm">By {i.inspector_name}</div>
                  <div className="overline mt-1">{new Date(i.created_at).toLocaleString()}</div>
                  {i.fail_count > 0 && <div className="mt-1 text-xs text-primary mono">{i.fail_count} failed items</div>}
                </div>
              ))}
              {insp.length === 0 && <div className="text-sm text-muted-foreground">No inspections yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
