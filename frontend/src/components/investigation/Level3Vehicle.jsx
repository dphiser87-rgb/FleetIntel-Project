import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  Wrench, GasPump, ClockCounterClockwise, Warning, ClipboardText, Bug, Plus, User,
} from "@phosphor-icons/react";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "12m", label: "Last 12 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "90d", label: "Last 90 days" },
  { value: "30d", label: "Last 30 days" },
];

const EVENT_ICON = {
  maintenance: { icon: Wrench, color: "hsl(var(--chart-3))" },
  fuel: { icon: GasPump, color: "hsl(var(--chart-1))" },
  incident: { icon: Warning, color: "hsl(var(--chart-2))" },
  inspection: { icon: ClipboardText, color: "hsl(var(--chart-4))" },
  defect: { icon: Bug, color: "hsl(var(--chart-2))" },
};

const DeltaBadge = ({ pct }) => {
  if (pct == null) return null;
  const up = pct > 0;
  return <span className={`text-xs mono ml-2 ${up ? "text-[#FF3B30]" : "text-[#34C759]"}`}>{up ? "+" : ""}{pct}%</span>;
};

export default function Level3Vehicle({ vehicleId, onDrillEvent }) {
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState(null);
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [fuelForm, setFuelForm] = useState({ occurred_at: "", litres: "", cost: "", location: "" });

  const load = () => {
    api.get(`/vehicles/${vehicleId}/investigation`, { params: { period } })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Unable to load vehicle investigation"));
  };

  useEffect(() => { setData(null); load(); }, [vehicleId, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const logFuel = async (e) => {
    e.preventDefault();
    try {
      await api.post("/fuel-logs", {
        vehicle_id: vehicleId,
        occurred_at: fuelForm.occurred_at ? new Date(fuelForm.occurred_at).toISOString() : new Date().toISOString(),
        litres: Number(fuelForm.litres),
        cost: Number(fuelForm.cost),
        location: fuelForm.location,
      });
      toast.success("Fuel purchase logged");
      setShowFuelForm(false);
      setFuelForm({ occurred_at: "", litres: "", cost: "", location: "" });
      load();
    } catch { toast.error("Failed to log fuel purchase"); }
  };

  if (!data) return <div className="p-12 text-muted-foreground text-sm">Loading vehicle investigation…</div>;

  const { vehicle: v, driver, cost_summary: cs, monthly_trend, fuel_logs, maintenance, defects, utilization, timeline } = data;

  return (
    <div className="p-6 space-y-6" data-testid="level3-vehicle">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="overline">{v.type} · {v.make} {v.model} · {v.year}</div>
          <div className="mono text-sm text-muted-foreground mt-1">{v.plate}</div>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="level3-period" className="bg-[#121214] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Maintenance", cs.maintenance_cost, cs.maintenance_cost_delta_pct],
          ["Fuel", cs.fuel_cost, cs.fuel_cost_delta_pct],
          ["Downtime", cs.downtime_cost, cs.downtime_cost_delta_pct],
          ["Total cost", cs.total_cost, cs.total_cost_delta_pct],
        ].map(([label, value, delta]) => (
          <div key={label} className="bg-[#121214] border border-border p-4">
            <div className="overline">{label}</div>
            <div className="mono text-xl font-bold mt-1">{money(value)}<DeltaBadge pct={delta} /></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[#121214] border border-border p-4">
          <div className="overline mb-1">Assigned driver</div>
          {driver ? (
            <div className="flex items-center gap-2 mt-2">
              <User size={18} className="text-muted-foreground" />
              <div>
                <div className="text-sm">{driver.name}</div>
                <div className="text-xs text-muted-foreground">{driver.license_number}</div>
              </div>
            </div>
          ) : <div className="text-sm text-muted-foreground mt-2">No driver assigned</div>}
        </div>
        <div className="bg-[#121214] border border-border p-4">
          <div className="overline mb-1">Utilization</div>
          <div className="text-sm mt-2">Status: <span className="mono">{utilization.status}</span></div>
          <div className="text-sm mt-1">~<span className="mono">{utilization.avg_km_per_day}</span> km/day avg</div>
          <div className="text-sm mt-1">Odometer: <span className="mono">{(utilization.odometer || 0).toLocaleString()} km</span></div>
        </div>
        <div className="bg-[#121214] border border-border p-4">
          <div className="overline mb-1">Defect history</div>
          <div className="mono text-xl font-bold mt-1">{defects.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Failed inspection items</div>
        </div>
      </div>

      <div className="bg-[#121214] border border-border p-4">
        <div className="overline mb-2">Monthly cost trend</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthly_trend}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis dataKey="month" stroke="#636366" tick={{ fontSize: 10 }} />
            <YAxis stroke="#636366" tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="parts" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="labor" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="fuel" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="total" stroke="hsl(var(--chart-2))" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#121214] border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="overline">Fuel log ({fuel_logs.length})</div>
            <button onClick={() => setShowFuelForm((s) => !s)} data-testid="log-fuel-toggle" className="flex items-center gap-1 text-xs uppercase tracking-widest text-primary hover:text-primary/80">
              <Plus size={12} /> Log purchase
            </button>
          </div>
          {showFuelForm && (
            <form onSubmit={logFuel} className="grid grid-cols-2 gap-2 mb-3 p-3 border border-primary/40 bg-primary/5" data-testid="fuel-log-form">
              <input required type="datetime-local" value={fuelForm.occurred_at} onChange={(e) => setFuelForm((f) => ({ ...f, occurred_at: e.target.value }))} className="col-span-2 bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
              <input required type="number" step="0.1" placeholder="Litres" value={fuelForm.litres} onChange={(e) => setFuelForm((f) => ({ ...f, litres: e.target.value }))} className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
              <input required type="number" step="0.01" placeholder="Cost" value={fuelForm.cost} onChange={(e) => setFuelForm((f) => ({ ...f, cost: e.target.value }))} className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
              <input placeholder="Location" value={fuelForm.location} onChange={(e) => setFuelForm((f) => ({ ...f, location: e.target.value }))} className="col-span-2 bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none" />
              <button type="submit" className="col-span-2 bg-primary text-primary-foreground px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-primary/90">Save</button>
            </form>
          )}
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {fuel_logs.slice(0, 10).map((f) => (
              <div key={f.id} className="flex items-center justify-between text-xs border-b border-border/50 py-1.5">
                <span className="text-muted-foreground">{(f.occurred_at || "").slice(0, 10)} · {f.location || "—"}</span>
                <span className="mono">{f.litres}L · {money(f.cost)}</span>
              </div>
            ))}
            {fuel_logs.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No fuel purchases logged.</div>}
          </div>
        </div>

        <div className="bg-[#121214] border border-border p-4">
          <div className="overline mb-2">Maintenance ({maintenance.length})</div>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {maintenance.slice(0, 10).map((m) => (
              <div key={m.id} className="flex items-center justify-between text-xs border-b border-border/50 py-1.5">
                <span className="truncate">{m.title}</span>
                <span className="mono shrink-0 ml-2">{money(m.actual_cost || m.estimated_cost)}</span>
              </div>
            ))}
            {maintenance.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No maintenance jobs.</div>}
          </div>
        </div>
      </div>

      <div className="bg-[#121214] border border-border p-4">
        <div className="overline mb-3">Investigation timeline</div>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2" data-testid="investigation-timeline">
          {timeline.map((e, i) => {
            const cfg = EVENT_ICON[e.type] || { icon: ClockCounterClockwise, color: "#636366" };
            const Icon = cfg.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onDrillEvent(e)}
                className="w-full text-left flex items-start gap-3 border-l-2 pl-3 py-1.5 hover:bg-white/[0.03] transition-colors"
                style={{ borderColor: cfg.color }}
                data-testid={`timeline-event-${i}`}
              >
                <Icon size={14} style={{ color: cfg.color }} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm truncate">{e.title}</div>
                    <div className="text-[10px] mono text-muted-foreground shrink-0">{(e.at || "").slice(0, 10)}</div>
                  </div>
                  {e.by && <div className="text-xs text-muted-foreground mt-0.5">by {e.by}</div>}
                  {e.meta?.cost != null && e.meta.cost > 0 && <div className="mono text-xs mt-0.5">{money(e.meta.cost)}</div>}
                </div>
              </button>
            );
          })}
          {timeline.length === 0 && <div className="text-sm text-muted-foreground text-center py-6">No events yet.</div>}
        </div>
      </div>
    </div>
  );
}
