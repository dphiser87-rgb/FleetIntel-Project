import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend, ComposedChart, Area } from "recharts";

const money = (n) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function Reports() {
  const [trend, setTrend] = useState([]);
  const [byVehicle, setByVehicle] = useState([]);
  const [byCat, setByCat] = useState([]);
  const [maint, setMaint] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [forecast, setForecast] = useState({ history: [], forecast: [] });

  useEffect(() => {
    api.get("/analytics/cost-trend").then(r => setTrend(r.data));
    api.get("/analytics/vehicle-cost").then(r => setByVehicle(r.data));
    api.get("/analytics/cost-by-category").then(r => setByCat(r.data));
    api.get("/maintenance").then(r => setMaint(r.data));
    api.get("/vehicles").then(r => setVehicles(r.data));
    api.get("/analytics/forecast").then(r => setForecast(r.data));
  }, []);

  const combined = [
    ...forecast.history.map(h => ({ month: h.month, actual: h.total })),
    ...forecast.forecast.map(f => ({ month: f.month, projected: f.total })),
  ];

  const vName = (id) => vehicles.find(v => v.id === id)?.name || "—";

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6">
        <div className="overline">Analytics</div>
        <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="reports-title">Reports</h1>
      </header>

      <div className="p-8 space-y-6">
        <div className="bg-[#121214] border border-border p-6" data-testid="forecast-chart">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="overline">Cost forecast · next 3 months</div>
              <h3 className="font-display text-2xl font-bold tracking-tight mt-1">Actual vs projected</h3>
            </div>
            <div className="mono text-xs text-muted-foreground">Linear regression</div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={combined}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <YAxis stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontFamily: "JetBrains Mono", fontSize: 12 }} />
              <Legend />
              <Area type="monotone" dataKey="actual" stroke="#34C759" fill="#34C759" fillOpacity={0.2} strokeWidth={2} />
              <Line type="monotone" dataKey="projected" stroke="#FF3B30" strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 4, fill: "#FF3B30" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#121214] border border-border p-6">
          <div className="overline">Monthly cost trend</div>
          <h3 className="font-display text-2xl font-bold tracking-tight mt-1 mb-4">Spend over time</h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trend}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <YAxis stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontFamily: "JetBrains Mono", fontSize: 12 }} />
              <Legend />
              <Line type="monotone" dataKey="parts" stroke="#FFCC00" strokeWidth={2} />
              <Line type="monotone" dataKey="labor" stroke="#34C759" strokeWidth={2} />
              <Line type="monotone" dataKey="total" stroke="#FF3B30" strokeWidth={2.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#121214] border border-border p-6">
          <div className="overline">Ranking</div>
          <h3 className="font-display text-2xl font-bold tracking-tight mt-1 mb-4">Cost per vehicle</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={byVehicle} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis type="number" stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <YAxis type="category" dataKey="vehicle" stroke="#636366" width={100} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontSize: 12 }} />
              <Bar dataKey="cost" fill="#FF3B30" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#121214] border border-border" data-testid="jobs-table">
          <div className="p-6 border-b border-border">
            <div className="overline">All jobs</div>
            <h3 className="font-display text-2xl font-bold tracking-tight mt-1">Maintenance ledger</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left overline">
                  <th className="p-3">Job</th>
                  <th className="p-3">Vehicle</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Parts</th>
                  <th className="p-3 text-right">Labor</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Downtime</th>
                </tr>
              </thead>
              <tbody>
                {maint.map(m => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-[#141416]">
                    <td className="p-3">{m.title}</td>
                    <td className="p-3">{vName(m.vehicle_id)}</td>
                    <td className="p-3"><span className="overline">{m.priority}</span></td>
                    <td className="p-3"><span className="overline">{m.status}</span></td>
                    <td className="p-3 text-right mono">{money(m.parts_cost)}</td>
                    <td className="p-3 text-right mono">{money(m.labor_cost)}</td>
                    <td className="p-3 text-right mono">{money(m.actual_cost || m.estimated_cost)}</td>
                    <td className="p-3 text-right mono">{m.downtime_hours || 0}h</td>
                  </tr>
                ))}
                {maint.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No maintenance records.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
