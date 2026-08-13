import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API } from "@/lib/api";
import axios from "axios";
import { ShieldCheck, Truck, CheckCircle, XCircle, Wrench, ChartLine } from "@phosphor-icons/react";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function PublicVehicle() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    axios.get(`${API}/public/vehicle/${token}`)
      .then(r => setData(r.data))
      .catch(e => setErr(e.response?.data?.detail || "Link not valid"));
  }, [token]);

  if (err) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="text-center">
        <XCircle size={48} className="text-primary mx-auto mb-4" />
        <h1 className="font-display font-black text-3xl">Link invalid</h1>
        <p className="text-muted-foreground mt-2">{err}</p>
      </div>
    </div>
  );
  if (!data) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  const { workspace, vehicle, inspections, maintenance_history, summary } = data;

  return (
    <div className="min-h-screen bg-background noise-bg">
      <header className="border-b-2 border-primary/60 px-8 py-6 flex items-center justify-between flex-wrap gap-4 bg-[#0b0b0d]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary flex items-center justify-center">
            <ChartLine size={22} weight="bold" color="#000" />
          </div>
          <div>
            <div className="font-display font-black text-xl leading-none">FleetIntel</div>
            <div className="overline mt-1">Insurance report · shared by {workspace.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <ShieldCheck size={16} className="text-primary" weight="bold" />
          <span className="text-muted-foreground">Read-only public link</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-8 space-y-6" data-testid="public-report">
        <div>
          <div className="overline">Vehicle</div>
          <h1 className="font-display font-black text-5xl tracking-tight mt-2">{vehicle.name}</h1>
          <div className="text-lg text-muted-foreground mt-2 mono">{vehicle.plate} · {vehicle.year} {vehicle.make} {vehicle.model}</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders" data-testid="public-summary">
          {[
            ["Inspections", summary.total_inspections],
            ["Maintenance jobs", summary.total_maintenance],
            ["Recent failed items", summary.recent_fail_count],
            ["Lifetime cost", money(summary.total_maintenance_cost)],
          ].map(([l, v]) => (
            <div key={l} className="p-5 bg-[#121214]">
              <div className="overline">{l}</div>
              <div className="mono text-2xl font-bold mt-2">{v}</div>
            </div>
          ))}
        </div>

        <div className="bg-[#121214] border border-border p-6">
          <div className="overline">Safety history</div>
          <h2 className="font-display text-2xl font-bold tracking-tight mt-1 mb-4">Recent inspections</h2>
          <div className="space-y-2">
            {inspections.slice(0, 20).map(i => (
              <div key={i.id} className="border-b border-border/50 py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm">Inspected by {i.inspector_name}</div>
                  <div className="overline mt-1">{new Date(i.created_at).toLocaleString()}</div>
                  {i.notes && <div className="text-xs text-muted-foreground mt-1 max-w-xl">{i.notes}</div>}
                </div>
                <div className="text-right shrink-0">
                  {i.fail_count > 0 ? (
                    <span className="flex items-center gap-1 text-primary text-xs mono uppercase tracking-widest"><XCircle size={12} weight="bold" /> {i.fail_count} failed</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[#34C759] text-xs mono uppercase tracking-widest"><CheckCircle size={12} weight="bold" /> Pass</span>
                  )}
                </div>
              </div>
            ))}
            {inspections.length === 0 && <div className="text-sm text-muted-foreground py-4">No inspections on record.</div>}
          </div>
        </div>

        <div className="bg-[#121214] border border-border p-6">
          <div className="overline">Compliance history</div>
          <h2 className="font-display text-2xl font-bold tracking-tight mt-1 mb-4">Completed maintenance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left overline">
                  <th className="p-2">Date</th>
                  <th className="p-2">Job</th>
                  <th className="p-2">Priority</th>
                  <th className="p-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {maintenance_history.map(m => (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="p-2 mono text-xs">{(m.completed_at || "").slice(0, 10)}</td>
                    <td className="p-2">{m.title}</td>
                    <td className="p-2"><span className="overline">{m.priority}</span></td>
                    <td className="p-2 text-right mono">{money(m.actual_cost)}</td>
                  </tr>
                ))}
                {maintenance_history.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No completed maintenance.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground py-6">
          <ShieldCheck size={16} className="inline mr-1 text-primary" />
          This report was shared as a read-only insurance/compliance view by <strong className="text-white">{workspace.name}</strong> via FleetIntel.
        </div>
      </div>
    </div>
  );
}
