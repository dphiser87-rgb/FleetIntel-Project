import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import { ArrowUpRight, TrendUp, Wrench, Truck, ClockCounterClockwise, GasPump, CurrencyDollar, Warning, Package, Crosshair } from "@phosphor-icons/react";

const money = (n) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const COLORS = ["#FF3B30", "#34C759", "#FFCC00", "#3B82F6", "#A855F7"];

const KPI = ({ label, value, icon: Icon, sub, testId }) => (
  <div className="bg-[#121214] border border-border p-6 hover:border-primary/60 transition-colors" data-testid={testId}>
    <div className="flex items-start justify-between">
      <div className="overline">{label}</div>
      {Icon && <Icon size={18} weight="regular" className="text-muted-foreground" />}
    </div>
    <div className="mono text-3xl font-bold mt-4 tracking-tight">{value}</div>
    {sub && <div className="text-xs text-muted-foreground mt-2">{sub}</div>}
  </div>
);

export default function Dashboard() {
  const [kpi, setKpi] = useState(null);
  const [trend, setTrend] = useState([]);
  const [byCat, setByCat] = useState([]);
  const [byVehicle, setByVehicle] = useState([]);
  const [maint, setMaint] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [forecast, setForecast] = useState({ history: [], forecast: [] });

  useEffect(() => {
    Promise.all([
      api.get("/analytics/kpi").then(r => setKpi(r.data)),
      api.get("/analytics/cost-trend").then(r => setTrend(r.data)),
      api.get("/analytics/cost-by-category").then(r => setByCat(r.data)),
      api.get("/analytics/vehicle-cost").then(r => setByVehicle(r.data)),
      api.get("/maintenance").then(r => setMaint(r.data)),
      api.get("/parts/alerts").then(r => setAlerts(r.data)),
      api.get("/analytics/forecast").then(r => setForecast(r.data)),
    ]).catch(() => {});
  }, []);

  const nextForecast = forecast.forecast[0];

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between">
        <div>
          <div className="overline">Command center</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="dashboard-title">Fleet Operations</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/fleet" className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors" data-testid="link-fleet">View fleet</Link>
          <Link to="/maintenance" className="bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors" data-testid="link-maintenance">Maintenance board</Link>
        </div>
      </header>

      <div className="p-8 space-y-6">
        {alerts.length > 0 && (
          <div className="bg-primary/10 border border-primary/40 px-6 py-3 flex items-center justify-between flex-wrap gap-3" data-testid="parts-alert">
            <div className="flex items-center gap-3">
              <Package size={18} className="text-primary" />
              <div className="text-sm">
                <span className="text-primary font-bold">{alerts.length}</span> part{alerts.length !== 1 && "s"} below reorder point: <span className="text-muted-foreground">{alerts.slice(0, 3).map(a => a.name).join(", ")}{alerts.length > 3 ? "…" : ""}</span>
              </div>
            </div>
            <Link to="/parts" className="overline hover:text-primary">Manage inventory →</Link>
          </div>
        )}
        {nextForecast && (
          <div className="bg-[#121214] border border-border p-6 flex items-center justify-between flex-wrap gap-4" data-testid="forecast-card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 border border-primary/40 flex items-center justify-center">
                <Crosshair size={22} weight="regular" className="text-primary" />
              </div>
              <div>
                <div className="overline">Forecast · {nextForecast.month}</div>
                <div className="mono text-2xl font-bold mt-1">{money(nextForecast.total)}</div>
                <div className="text-xs text-muted-foreground mt-1">Projected maintenance spend next month (linear trend)</div>
              </div>
            </div>
            <Link to="/reports" className="overline hover:text-primary">See full forecast →</Link>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border border-border grid-borders" data-testid="kpi-grid">
          <KPI label="Total vehicles" value={kpi?.total_vehicles ?? "—"} icon={Truck} sub={`${kpi?.active ?? 0} active · ${kpi?.in_maintenance ?? 0} in maint`} testId="kpi-total-vehicles" />
          <KPI label="Maintenance cost" value={money(kpi?.total_maintenance_cost)} icon={Wrench} sub={`Parts ${money(kpi?.total_parts_cost)} + labor ${money(kpi?.total_labor_cost)}`} testId="kpi-maint-cost" />
          <KPI label="Cost per vehicle" value={money(kpi?.cost_per_vehicle)} icon={CurrencyDollar} sub="Lifetime average" testId="kpi-cost-per-vehicle" />
          <KPI label="Downtime" value={`${kpi?.total_downtime_hours ?? 0}h`} icon={ClockCounterClockwise} sub="Completed jobs" testId="kpi-downtime" />
          <KPI label="Fleet utilization" value={`${kpi?.utilization_pct ?? 0}%`} icon={TrendUp} sub={`${kpi?.active ?? 0} of ${kpi?.total_vehicles ?? 0} active`} testId="kpi-utilization" />
          <KPI label="Fuel cost (lifetime)" value={money(kpi?.total_fuel_cost)} icon={GasPump} sub={`${(kpi?.total_km ?? 0).toLocaleString()} km driven`} testId="kpi-fuel" />
          <KPI label="Pending jobs" value={kpi?.pending_jobs ?? 0} icon={Warning} sub="Requires action" testId="kpi-pending" />
          <KPI label="Completed jobs" value={kpi?.completed_jobs ?? 0} icon={ArrowUpRight} sub="All time" testId="kpi-completed" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#121214] border border-border p-6" data-testid="chart-cost-trend">
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="overline">Maintenance cost trend</div>
                <h3 className="font-display text-2xl font-bold tracking-tight mt-1">Monthly spend</h3>
              </div>
              <div className="overline">Parts vs Labor</div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
                <YAxis stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
                <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontFamily: "JetBrains Mono", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: "IBM Plex Sans" }} />
                <Line type="monotone" dataKey="parts" stroke="#FFCC00" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="labor" stroke="#34C759" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total" stroke="#FF3B30" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-[#121214] border border-border p-6" data-testid="chart-cost-cat">
            <div className="overline">Cost breakdown</div>
            <h3 className="font-display text-2xl font-bold tracking-tight mt-1 mb-4">By category</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={byCat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {byCat.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#121214] border border-border p-6" data-testid="chart-by-vehicle">
            <div className="overline">Cost per vehicle</div>
            <h3 className="font-display text-2xl font-bold tracking-tight mt-1 mb-4">Top spenders</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byVehicle.slice(0, 6)}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="vehicle" stroke="#636366" tick={{ fontSize: 11 }} />
                <YAxis stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
                <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontSize: 12 }} />
                <Bar dataKey="cost" fill="#FF3B30" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-[#121214] border border-border p-6" data-testid="recent-jobs">
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="overline">Recent activity</div>
                <h3 className="font-display text-2xl font-bold tracking-tight mt-1">Maintenance jobs</h3>
              </div>
              <Link to="/maintenance" className="overline hover:text-primary">View all →</Link>
            </div>
            <div className="space-y-2">
              {maint.slice(0, 6).map(m => (
                <div key={m.id} className="flex items-center justify-between border-b border-border/50 py-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{m.title}</div>
                    <div className="overline mt-1">{m.status} · {m.priority}</div>
                  </div>
                  <div className="mono text-sm">{money(m.actual_cost || m.estimated_cost)}</div>
                </div>
              ))}
              {maint.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No maintenance jobs yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
