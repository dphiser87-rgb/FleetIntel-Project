import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import {
  ArrowUpRight, TrendUp, Wrench, Truck, ClockCounterClockwise, GasPump, CurrencyDollar,
  Warning, Package, Crosshair, Gear, X as XIcon, Siren, IdentificationBadge, Heartbeat,
  UsersThree, FolderSimple, CaretLeft, Wallet,
} from "@phosphor-icons/react";
import InvestigationHub from "@/components/investigation/InvestigationHub";
import GroupManager from "@/components/GroupManager";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";

const money = (n) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const COLORS = ["#34C759", "#FF3B30", "#FFCC00", "#3B82F6", "#A855F7"];
const CHART = {
  green: "hsl(var(--chart-1))",
  red: "hsl(var(--chart-2))",
  gold: "hsl(var(--chart-3))",
  blue: "hsl(var(--chart-4))",
  purple: "hsl(var(--chart-5))",
};

const MAX_TILES = 10;

// breakdown: "both" (vehicle + group), "group" (group only), or null (no drill-down breakdown)
const ALL_TILES = [
  { key: "total_fleet_cost", label: "Total fleet cost", icon: Wallet, color: CHART.gold, get: k => k?.total_fleet_cost ?? 0, sub: () => "Maintenance + fuel + downtime", max: () => 15000, money: true, higher_better: false, breakdown: "both", investigate: true },
  { key: "total_vehicles", label: "Total vehicles", icon: Truck, color: CHART.green, get: k => k?.total_vehicles ?? 0, sub: k => `${k?.active ?? 0} active · ${k?.in_maintenance ?? 0} in maint`, max: k => k?.total_vehicles ?? 10, higher_better: true, breakdown: "group", investigate: true },
  { key: "total_maintenance_cost", label: "Maintenance cost", icon: Wrench, color: CHART.gold, get: k => k?.total_maintenance_cost ?? 0, sub: k => `Parts ${money(k?.total_parts_cost)} + labor ${money(k?.total_labor_cost)}`, max: () => 10000, money: true, higher_better: false, breakdown: "both", investigate: true, spark: t => t.map(x => x.total) },
  { key: "cost_per_vehicle", label: "Cost per vehicle", icon: CurrencyDollar, color: CHART.gold, get: k => k?.cost_per_vehicle ?? 0, sub: () => "Lifetime average", max: () => 2000, money: true, higher_better: false, breakdown: null, investigate: true },
  { key: "downtime_cost", label: "Downtime cost", icon: ClockCounterClockwise, color: CHART.blue, get: k => k?.total_downtime_cost ?? 0, sub: k => `${k?.total_downtime_hours ?? 0}h across the fleet`, max: () => 5000, money: true, higher_better: false, breakdown: "both", investigate: true },
  { key: "utilization", label: "Fleet utilization", icon: TrendUp, color: CHART.green, get: k => k?.utilization_pct ?? 0, sub: k => `${k?.active ?? 0} of ${k?.total_vehicles ?? 0} active`, suffix: "%", max: () => 100, higher_better: true, breakdown: null, investigate: true },
  { key: "fuel_cost", label: "Fuel cost", icon: GasPump, color: CHART.gold, get: k => k?.total_fuel_cost ?? 0, sub: () => "Logged fuel transactions", max: () => 10000, money: true, higher_better: false, breakdown: "both", investigate: true },
  { key: "pending_jobs", label: "Pending jobs", icon: Warning, color: CHART.red, get: k => k?.pending_jobs ?? 0, sub: () => "Requires action", max: () => 10, higher_better: false, breakdown: "both", investigate: true },
  { key: "completed_jobs", label: "Completed jobs", icon: ArrowUpRight, color: CHART.blue, get: k => k?.completed_jobs ?? 0, sub: () => "All time", max: () => 20, higher_better: true, breakdown: "both", investigate: true },
  { key: "open_incidents", label: "Open incidents", icon: Siren, color: CHART.red, get: k => k?.open_incidents ?? 0, sub: () => "Moderate or severe severity", max: () => 5, higher_better: false, breakdown: null, investigate: false, link: "/incidents" },
  { key: "low_stock_parts", label: "Low stock parts", icon: Package, color: CHART.red, get: k => k?.low_stock_parts ?? 0, sub: () => "At or below reorder point", max: () => 10, higher_better: false, breakdown: null, investigate: false, link: "/parts" },
  { key: "license_expiring", label: "Licenses expiring", icon: IdentificationBadge, color: CHART.red, get: k => k?.license_expiring ?? 0, sub: () => "Within 30 days", max: () => 5, higher_better: false, breakdown: null, investigate: false, link: "/drivers" },
  { key: "cost_anomalies", label: "Cost anomalies", icon: TrendUp, color: CHART.red, get: k => k?.cost_anomalies ?? 0, sub: () => "Above normal spend band", max: () => 5, higher_better: false, breakdown: null, investigate: false, link: "/reports" },
  { key: "fleet_health_avg", label: "Avg fleet health", icon: Heartbeat, color: CHART.purple, get: k => k?.fleet_health_avg ?? 0, sub: () => "Composite score across fleet", suffix: "%", max: () => 100, higher_better: true, breakdown: null, investigate: false, link: "/fleet" },
  { key: "active_drivers", label: "Active drivers", icon: UsersThree, color: CHART.green, get: k => k?.active_drivers ?? 0, sub: k => `of ${k?.total_drivers ?? 0} total`, max: k => k?.total_drivers || 10, higher_better: true, breakdown: null, investigate: false, link: "/drivers" },
  { key: "parts_inventory_value", label: "Parts inventory value", icon: Package, color: CHART.gold, get: k => k?.parts_inventory_value ?? 0, sub: () => "Stock on hand × unit cost", max: () => 20000, money: true, higher_better: true, breakdown: null, investigate: false, link: "/parts" },
];

const DEFAULT_TILES = ["total_fleet_cost", "total_vehicles", "total_maintenance_cost", "cost_per_vehicle", "downtime_cost", "utilization", "fuel_cost", "pending_jobs", "completed_jobs"];
const defaultConfigs = () => DEFAULT_TILES.map(key => ({ key, threshold: null, view_by: "none", group_id: null }));

const gaugeColor = (tile, val, pct, threshold) => {
  if (threshold != null && !Number.isNaN(threshold)) {
    const bad = tile.higher_better ? val < threshold : val > threshold;
    return bad ? CHART.red : CHART.green;
  }
  return tile.higher_better
    ? (pct >= 66 ? CHART.green : pct >= 33 ? CHART.gold : CHART.red)
    : (pct <= 33 ? CHART.green : pct <= 66 ? CHART.gold : CHART.red);
};

const GaugeTile = ({ tile, kpi, cfg, trend, onClick, onGear }) => {
  const val = tile.get(kpi);
  const max = tile.max(kpi);
  const pct = Math.min(100, Math.max(0, (val / max) * 100 || 0));
  const color = gaugeColor(tile, val, pct, cfg?.threshold);
  const display = tile.money ? money(val) : `${typeof val === "number" ? val.toLocaleString() : val}${tile.suffix || ""}`;
  const sparkData = tile.spark ? tile.spark(trend) : null;
  const viewByLabel = cfg?.view_by === "vehicle" ? "By vehicle" : cfg?.view_by === "group" ? "By group" : null;

  const Wrapper = tile.link ? Link : "button";
  const wrapperProps = tile.link ? { to: tile.link } : { type: "button", onClick };

  return (
    <div className="relative bg-[#121214] border border-border overflow-hidden group" style={{ borderLeft: `3px solid ${tile.color}` }} data-testid={`kpi-${tile.key}`}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onGear(); }}
        data-testid={`kpi-gear-${tile.key}`}
        title="Configure tile"
        className="absolute top-3 right-3 z-10 p-1.5 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Gear size={16} />
      </button>
      <Wrapper {...wrapperProps} className="block text-left w-full p-6 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center shrink-0" style={{ background: `${tile.color}1a`, border: `1px solid ${tile.color}66` }}>
            <tile.icon size={16} style={{ color: tile.color }} />
          </div>
          <div className="min-w-0 pt-0.5">
            <div className="overline truncate">{tile.label}</div>
            {viewByLabel && <div className="text-[10px] mono uppercase tracking-widest text-muted-foreground mt-0.5">{viewByLabel}</div>}
          </div>
        </div>
        <div className="mono text-2xl font-bold mt-3">{display}</div>
        {sparkData && sparkData.length > 1 ? (
          <div style={{ height: 28 }} className="mt-2 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData.map(v => ({ v }))}>
                <Line type="monotone" dataKey="v" stroke={tile.color} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
        <div className="mt-3 relative flex items-center justify-center" style={{ height: 90 }}>
          <RadialBarChart width={140} height={90} innerRadius={38} outerRadius={55} data={[{ v: pct }]} startAngle={180} endAngle={0}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="v" cornerRadius={4} fill={color} background={{ fill: "#27272a" }} />
          </RadialBarChart>
        </div>
        <div className="text-xs text-muted-foreground">{tile.sub(kpi)}</div>
        <div className="overline mt-2" style={{ color: tile.color }}>
          {tile.link ? "View details →" : "Investigate →"}
        </div>
      </Wrapper>
    </div>
  );
};

const TileGearSheet = ({ tile, cfg, groups, onClose, onSave }) => {
  const [threshold, setThreshold] = useState(cfg?.threshold ?? "");
  const [viewBy, setViewBy] = useState(cfg?.view_by ?? "none");

  useEffect(() => {
    setThreshold(cfg?.threshold ?? "");
    setViewBy(cfg?.view_by ?? "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync local edit state only when the sheet is opened for a different tile
  }, [tile?.key]);

  if (!tile) return null;

  const save = () => {
    onSave({
      key: tile.key,
      threshold: threshold === "" ? null : Number(threshold),
      view_by: viewBy,
      group_id: null,
    });
    onClose();
  };

  return (
    <Sheet open={!!tile} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-md" data-testid="tile-gear-sheet">
        <SheetHeader>
          <div className="overline">Tile settings</div>
          <SheetTitle className="font-display text-2xl">{tile.label}</SheetTitle>
          <SheetDescription>Set an alert threshold and how drill-down data is grouped.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div>
            <label className="overline block mb-2">
              Alert threshold {tile.higher_better ? "(flag if below)" : "(flag if above)"}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={tile.money ? "e.g. 5000" : "e.g. 80"}
                data-testid="tile-threshold-input"
                className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              {threshold !== "" && (
                <button onClick={() => setThreshold("")} className="text-muted-foreground hover:text-primary p-1" title="Clear threshold" data-testid="tile-threshold-clear">
                  <XIcon size={16} />
                </button>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              When set, the gauge turns red once this tile crosses the threshold instead of using the default scale.
            </div>
          </div>

          {tile.breakdown && (
            <div>
              <label className="overline block mb-2">Investigate — view by</label>
              <select
                value={viewBy}
                onChange={(e) => setViewBy(e.target.value)}
                data-testid="tile-viewby-select"
                className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="none">Flat list</option>
                {tile.breakdown === "both" && <option value="vehicle">By vehicle</option>}
                <option value="group">By group{groups.length === 0 ? " (no groups yet)" : ""}</option>
              </select>
              <div className="text-xs text-muted-foreground mt-2">Changes how rows are grouped when you click "Investigate" on this tile.</div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-8 pt-4 border-t border-border">
          <button onClick={onClose} className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid="tile-gear-cancel">Cancel</button>
          <button onClick={save} className="ml-auto bg-primary text-primary-foreground px-4 py-2 text-xs uppercase tracking-widest hover:bg-primary/90" data-testid="tile-gear-save">Save</button>
        </div>
      </SheetContent>
    </Sheet>
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
  const [drivers, setDrivers] = useState([]);
  const [parts, setParts] = useState([]);
  const [health, setHealth] = useState([]);
  const [groups, setGroups] = useState([]);

  const loadGroups = () => api.get("/vehicle-groups").then(r => setGroups(r.data || [])).catch(() => {});

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
      api.get("/drivers").then(r => setDrivers(r.data || [])),
      api.get("/parts").then(r => setParts(r.data || [])),
      api.get("/analytics/fleet-health").then(r => setHealth(r.data || [])),
      loadGroups(),
    ]).catch(() => {});
  }, []);

  const nextForecast = forecast.forecast[0];
  const [investigate, setInvestigate] = useState(null); // { key, groupBy }
  const [liveAlerts, setLiveAlerts] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [configView, setConfigView] = useState("tiles"); // "tiles" | "groups"
  const [gearTileKey, setGearTileKey] = useState(null);
  const [tileConfigs, setTileConfigs] = useState(defaultConfigs());

  const saveTiles = (configs) => {
    setTileConfigs(configs);
    api.put("/users/me/prefs", { dashboard_tiles: configs }).catch(() => {});
  };

  const cfgMap = useMemo(() => Object.fromEntries(tileConfigs.map(c => [c.key, c])), [tileConfigs]);
  const activeTiles = ALL_TILES.filter(t => cfgMap[t.key]);
  const atCap = tileConfigs.length >= MAX_TILES;

  useEffect(() => { api.get("/alerts").then(r => setLiveAlerts(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    api.get("/users/me/prefs").then(r => {
      const saved = r.data?.dashboard_tiles;
      if (Array.isArray(saved) && saved.length > 0) {
        // Backward-compat: older prefs stored plain string keys instead of config objects.
        const normalized = saved.map(t => (typeof t === "string" ? { key: t, threshold: null, view_by: "none", group_id: null } : t))
          .filter(t => ALL_TILES.some(at => at.key === t.key));
        if (normalized.length > 0) setTileConfigs(normalized);
      }
    }).catch(() => {});
  }, []);

  const activeDrivers = drivers.filter(d => d.status === "active").length;
  const partsValue = parts.reduce((s, p) => s + (p.stock || 0) * (p.unit_cost || 0), 0);
  const healthAvg = health.length ? Math.round(health.reduce((s, h) => s + (h.score || 0), 0) / health.length) : 0;

  const metrics = kpi ? {
    ...kpi,
    open_incidents: liveAlerts?.buckets?.open_incidents ?? 0,
    low_stock_parts: liveAlerts?.buckets?.low_stock_parts ?? 0,
    license_expiring: liveAlerts?.buckets?.license_expiring ?? 0,
    cost_anomalies: liveAlerts?.buckets?.cost_anomalies ?? 0,
    fleet_health_avg: healthAvg,
    active_drivers: activeDrivers,
    total_drivers: drivers.length,
    parts_inventory_value: partsValue,
  } : null;

  const gearTile = gearTileKey ? ALL_TILES.find(t => t.key === gearTileKey) : null;

  const toggleTile = (key, on) => {
    if (on) {
      if (atCap) return;
      saveTiles([...tileConfigs, { key, threshold: null, view_by: "none", group_id: null }]);
    } else {
      saveTiles(tileConfigs.filter(c => c.key !== key));
    }
  };

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
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Command center</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="dashboard-title">Fleet Operations</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setConfigView("tiles"); setShowConfig(true); }} data-testid="configure-tiles" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
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
          {activeTiles.map(t => {
            const cfg = cfgMap[t.key];
            return (
              <GaugeTile
                key={t.key}
                tile={t}
                kpi={metrics}
                cfg={cfg}
                trend={trend}
                onClick={() => t.investigate && setInvestigate({ key: t.key, label: t.label, groupBy: cfg?.view_by !== "none" ? cfg?.view_by : null })}
                onGear={() => setGearTileKey(t.key)}
              />
            );
          })}
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
                <Line type="monotone" dataKey="parts" stroke={CHART.gold} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="labor" stroke={CHART.green} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total" stroke={CHART.red} strokeWidth={2.5} dot={{ r: 3 }} />
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
                <Bar dataKey="cost" fill={CHART.red} />
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

      <InvestigationHub root={investigate} groups={groups} onClose={() => setInvestigate(null)} />

      <TileGearSheet
        tile={gearTile}
        cfg={gearTile ? cfgMap[gearTile.key] : null}
        groups={groups}
        onClose={() => setGearTileKey(null)}
        onSave={(newCfg) => saveTiles(tileConfigs.map(c => (c.key === newCfg.key ? newCfg : c)))}
      />

      <Sheet open={showConfig} onOpenChange={setShowConfig}>
        <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-lg flex flex-col" data-testid="tile-config">
          {configView === "tiles" ? (
            <>
              <SheetHeader>
                <div className="overline">Tile configuration</div>
                <SheetTitle className="font-display text-2xl">Choose your KPIs</SheetTitle>
                <SheetDescription>
                  Up to {MAX_TILES} tiles at once — {tileConfigs.length}/{MAX_TILES} selected{atCap ? ". Remove one to add another." : "."}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-2 mt-4 flex-1 overflow-y-auto pr-1">
                {ALL_TILES.map(t => {
                  const on = !!cfgMap[t.key];
                  const disabled = !on && atCap;
                  return (
                    <label key={t.key} className={`flex items-center gap-3 border p-3 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${on ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`} data-testid={`tile-toggle-${t.key}`}>
                      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => toggleTile(t.key, e.target.checked)} className="accent-primary" />
                      <div className="w-6 h-6 flex items-center justify-center shrink-0" style={{ background: `${t.color}1a`, border: `1px solid ${t.color}66` }}>
                        <t.icon size={13} style={{ color: t.color }} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.higher_better ? "Higher is better" : "Lower is better"}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                <button onClick={() => saveTiles(defaultConfigs())} className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid="reset-tiles">Reset to default</button>
                <button onClick={() => setConfigView("groups")} className="flex items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid="manage-groups">
                  <FolderSimple size={14} /> Manage groups
                </button>
                <button onClick={() => setShowConfig(false)} className="ml-auto bg-primary text-primary-foreground px-4 py-2 text-xs uppercase tracking-widest hover:bg-primary/90" data-testid="done-tiles">Done</button>
              </div>
            </>
          ) : (
            <>
              <SheetHeader>
                <button onClick={() => setConfigView("tiles")} className="flex items-center gap-1 overline hover:text-primary mb-2 w-fit" data-testid="back-to-tiles">
                  <CaretLeft size={12} /> Back to tiles
                </button>
                <SheetTitle className="font-display text-2xl">Vehicle groups</SheetTitle>
                <SheetDescription>Used by tiles configured to "view by group" — organize vehicles into fleets like Regional or Long-haul.</SheetDescription>
              </SheetHeader>
              <div className="mt-4 flex-1 overflow-y-auto pr-1">
                <GroupManager groups={groups} onChange={loadGroups} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
