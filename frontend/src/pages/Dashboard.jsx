import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import { ArrowUpRight, TrendUp, Wrench, Truck, ClockCounterClockwise, GasPump, CurrencyDollar, Warning, Package, Crosshair, Bell, Gear, Plus, X as XIcon } from "@phosphor-icons/react";
import InvestigationPanel from "@/components/InvestigationPanel";
import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";

const money = (n) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const COLORS = ["#34C759", "#FF3B30", "#FFCC00", "#3B82F6", "#A855F7"];

const ALL_TILES = [
  { key: "total_vehicles", label: "Total vehicles", icon: Truck, get: k => k?.total_vehicles ?? 0, sub: k => `${k?.active ?? 0} active · ${k?.in_maintenance ?? 0} in maint`, max: k => k?.total_vehicles ?? 10, higher_better: true },
  { key: "total_maintenance_cost", label: "Maintenance cost", icon: Wrench, get: k => k?.total_maintenance_cost ?? 0, sub: k => `Parts ${money(k?.total_parts_cost)} + labor ${money(k?.total_labor_cost)}`, max: () => 10000, money: true, higher_better: false },
  { key: "cost_per_vehicle", label: "Cost per vehicle", icon: CurrencyDollar, get: k => k?.cost_per_vehicle ?? 0, sub: () => "Lifetime average", max: () => 2000, money: true, higher_better: false },
  { key: "downtime", label: "Downtime", icon: ClockCounterClockwise, get: k => k?.total_downtime_hours ?? 0, sub: () => "Completed jobs", suffix: "h", max: () => 100, higher_better: false },
  { key: "utilization", label: "Fleet utilization", icon: TrendUp, get: k => k?.utilization_pct ?? 0, sub: k => `${k?.active ?? 0} of ${k?.total_vehicles ?? 0} active`, suffix: "%", max: () => 100, higher_better: true },
  { key: "fuel_cost", label: "Fuel cost (lifetime)", icon: GasPump, get: k => k?.total_fuel_cost ?? 0, sub: k => `${(k?.total_km ?? 0).toLocaleString()} km driven`, max: () => 500000, money: true, higher_better: false },
  { key: "pending_jobs", label: "Pending jobs", icon: Warning, get: k => k?.pending_jobs ?? 0, sub: () => "Requires action", max: () => 10, higher_better: false },
  { key: "completed_jobs", label: "Completed jobs", icon: ArrowUpRight, get: k => k?.completed_jobs ?? 0, sub: () => "All time", max: () => 20, higher_better: true },
];

const DEFAULT_TILES = ["total_vehicles", "total_maintenance_cost", "cost_per_vehicle", "downtime", "utilization", "fuel_cost", "pending_jobs", "completed_jobs"];

const GaugeTile = ({ tile, kpi, onClick }) => {
  const val = tile.get(kpi);
  const max = tile.max(kpi);
  const pct = Math.min(100, Math.max(0, (val / max) * 100 || 0));
  // Color logic: for "higher is better" green when high, red when low; else reverse
  const color = tile.higher_better ? (pct >= 66 ? "#34C759" : pct >= 33 ? "#FFCC00" : "#FF3B30") : (pct <= 33 ? "#34C759" : pct <= 66 ? "#FFCC00" : "#FF3B30");
  const display = tile.money ? money(val) : `${typeof val === "number" ? val.toLocaleString() : val}${tile.suffix || ""}`;
  return (
    <button type="button" onClick={onClick} className="text-left bg-[#121214] border border-border p-6 hover:border-primary transition-colors" data-testid={`kpi-${tile.key}`}>
      <div className="flex items-start justify-between">
        <div className="overline">{tile.label}</div>
        <tile.icon size={18} className="text-muted-foreground" />
      </div>
      <div className="mono text-2xl font-bold mt-3">{display}</div>
      <div className="mt-3 relative flex items-center justify-center" style={{ height: 90 }}>
        <RadialBarChart width={140} height={90} innerRadius={38} outerRadius={55} data={[{ v: pct }]} startAngle={180} endAngle={0}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="v" cornerRadius={4} fill={color} background={{ fill: "#27272a" }} />
        </RadialBarChart>
      </div>
      <div className="text-xs text-muted-foreground">{tile.sub(kpi)}</div>
      <div className="overline mt-2 text-primary">Investigate →</div>
    </button>
  );
};

export default function Dashboard() {
  const [kpi, setKpi] = useState(null);
  const [trend, setTrend] = useState([]);
  const [byCat, setByCat] = useState([]);
  const [byVehicle, setByVehicle] = useState([]);
  const [maint, setMaint] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [forecast, setForecast] = useState({ history: [], forecast: [] });
  const [anomalies, setAnomalies] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/analytics/kpi").then(r => setKpi(r.data)),
      api.get("/analytics/cost-trend").then(r => setTrend(r.data)),
      api.get("/analytics/cost-by-category").then(r => setByCat(r.data)),
      api.get("/analytics/vehicle-cost").then(r => setByVehicle(r.data)),
      api.get("/maintenance").then(r => setMaint(r.data)),
      api.get("/parts/alerts").then(r => setAlerts(r.data)),
      api.get("/analytics/forecast").then(r => setForecast(r.data)),
      api.get("/analytics/anomalies").then(r => setAnomalies(r.data)),
    ]).catch(() => {});
  }, []);

  const nextForecast = forecast.forecast[0];
  const [investigate, setInvestigate] = useState(null);
  const [liveAlerts, setLiveAlerts] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [tileKeys, setTileKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fleetintel_tiles") || "null") || DEFAULT_TILES; }
    catch { return DEFAULT_TILES; }
  });
  const saveTiles = (keys) => { setTileKeys(keys); localStorage.setItem("fleetintel_tiles", JSON.stringify(keys)); };
  const activeTiles = ALL_TILES.filter(t => tileKeys.includes(t.key));

  useEffect(() => { api.get("/alerts").then(r => setLiveAlerts(r.data)).catch(() => {}); }, []);

  return (
    <div className="noise-bg min-h-screen">
      {liveAlerts && (liveAlerts.total > 0) && (
        <div className="bg-[#0b0b0d] border-b border-border px-8 py-3 flex items-center gap-6 flex-wrap" data-testid="live-alerts-bar">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            <span className="text-xs uppercase tracking-widest text-primary font-bold">Live alerts</span>
          </div>
          <div className="text-sm"><span className="text-primary font-bold mono">{liveAlerts.critical}</span> <span className="text-muted-foreground">critical</span> · <span className="text-[#FFCC00] font-bold mono">{liveAlerts.warnings}</span> <span className="text-muted-foreground">warnings</span> · <span className="mono">{liveAlerts.total}</span> total</div>
          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {Object.entries(liveAlerts.buckets).filter(([, n]) => n > 0).map(([k, n]) => (
              <div key={k} className="flex items-center gap-1 text-xs" data-testid={`bucket-${k}`}>
                <span className="mono text-primary font-bold">{n}</span>
                <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <header className="border-b border-border px-8 py-6 flex items-end justify-between">
        <div>
          <div className="overline">Command center</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="dashboard-title">Fleet Operations</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowConfig(true)} data-testid="configure-tiles" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
            <Gear size={14} /> Configure tiles
          </button>
          <Link to="/maintenance" className="bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors" data-testid="link-maintenance">Maintenance board</Link>
        </div>
      </header>

      <div className="p-8 space-y-6">
        {anomalies.length > 0 && (
          <div className="bg-primary/10 border border-primary/40 p-4" data-testid="anomaly-alert">
            <div className="flex items-center gap-3 mb-3">
              <Warning size={18} className="text-primary" />
              <div>
                <div className="overline">Cost anomalies detected</div>
                <div className="text-sm mt-0.5">{anomalies.length} vehicle{anomalies.length !== 1 && "s"} spent above their normal band this month</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {anomalies.slice(0, 6).map(a => (
                <Link to={`/fleet/${a.vehicle_id}`} key={a.vehicle_id} className="border border-primary/30 bg-[#121214] p-3 hover:border-primary transition-colors" data-testid={`anomaly-${a.vehicle_id}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-display font-bold text-sm">{a.vehicle}</div>
                    <div className="mono text-primary text-sm">+{a.delta_pct}%</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 mono">{a.plate} · {a.month}</div>
                  <div className="text-xs mono mt-2">{money(a.spend)} <span className="text-muted-foreground">vs avg {money(a.mean)}</span></div>
                </Link>
              ))}
            </div>
          </div>
        )}

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kpi-grid">
          {activeTiles.map(t => (
            <GaugeTile key={t.key} tile={t} kpi={kpi} onClick={() => setInvestigate(t.key === "total_maintenance_cost" ? "total_maintenance_cost" : t.key)} />
          ))}
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
      <InvestigationPanel kpiKey={investigate} onClose={() => setInvestigate(null)} />
      {showConfig && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setShowConfig(false)}>
          <div className="bg-[#121214] border border-border max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()} data-testid="tile-config">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="overline">Tile configuration</div>
                <h3 className="font-display font-bold text-2xl mt-1">Choose your KPIs</h3>
              </div>
              <button onClick={() => setShowConfig(false)} className="text-muted-foreground hover:text-primary"><XIcon size={20} /></button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {ALL_TILES.map(t => {
                const on = tileKeys.includes(t.key);
                return (
                  <label key={t.key} className={`flex items-center gap-3 border p-3 cursor-pointer ${on ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`} data-testid={`tile-toggle-${t.key}`}>
                    <input type="checkbox" checked={on} onChange={(e) => saveTiles(e.target.checked ? [...tileKeys, t.key] : tileKeys.filter(k => k !== t.key))} className="accent-primary" />
                    <t.icon size={18} className="text-muted-foreground" />
                    <div>
                      <div className="text-sm">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.higher_better ? "Higher is better" : "Lower is better"}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              <button onClick={() => saveTiles(DEFAULT_TILES)} className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid="reset-tiles">Reset to default</button>
              <button onClick={() => setShowConfig(false)} className="ml-auto bg-primary text-primary-foreground px-4 py-2 text-xs uppercase tracking-widest hover:bg-primary/90" data-testid="done-tiles">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
