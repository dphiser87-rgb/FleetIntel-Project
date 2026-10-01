import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import {
  ArrowUpRight, TrendUp, Wrench, Truck, ClockCounterClockwise, GasPump, CurrencyDollar,
  Warning, Package, Crosshair, Gear, Siren, IdentificationBadge, Heartbeat,
  UsersThree, Wallet, Tire, Storefront, Gauge, Car, CalendarBlank,
  MapTrifold, Path, Bug,
} from "@phosphor-icons/react";
import InvestigationHub from "@/components/investigation/InvestigationHub";
import GroupManager from "@/components/GroupManager";
import CreateTileModal from "@/components/tile-config/CreateTileModal";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoney, formatMoneyFull } from "@/lib/currency";
import { usePolling } from "@/hooks/use-polling";
import { MiniBars, FeaturedVehicle, MaintenanceSpendChart, MonthCalendar, ScheduledList, Pending, useUpcoming } from "@/components/dashboard/DashboardWidgets";


const COLORS = ["#34C759", "#FF3B30", "#FFCC00", "#3B82F6", "#A855F7"];
const CHART = {
  green: "hsl(var(--chart-1))",
  red: "hsl(var(--chart-2))",
  gold: "hsl(var(--chart-3))",
  blue: "hsl(var(--chart-4))",
  purple: "hsl(var(--chart-5))",
};

const MAX_TILES = 10;

// breakdown: "both" (vehicle + group), "group" (group only), "driver" (driver only), or null (no drill-down breakdown)
const ALL_TILES = [
  // --- The 14-item "Create New Tile" KPI catalog, in spec order ---
  { key: "total_monthly_cost", label: "Total Monthly Cost", icon: Wallet, color: CHART.gold, get: k => k?.total_monthly_cost ?? 0, sub: () => "This calendar month", money: true, higher_better: false, breakdown: "both", investigate: true },
  { key: "cost_per_vehicle", label: "Cost per Vehicle", icon: CurrencyDollar, color: CHART.gold, get: k => k?.cost_per_vehicle ?? 0, sub: () => "Lifetime average", money: true, higher_better: false, breakdown: null, investigate: true },
  { key: "emergency_repairs", label: "Emergency Repairs", icon: Siren, color: CHART.red, get: k => k?.emergency_repairs ?? 0, sub: () => "Critical jobs still open", higher_better: false, breakdown: null, investigate: false, link: "/maintenance", riskMode: "alert" },
  { key: "cost_efficiency_pct", label: "Cost Efficiency", icon: Gauge, color: CHART.green, get: k => k?.cost_efficiency_pct ?? 0, sub: () => "Jobs completed at/under estimate", suffix: "%", higher_better: true, breakdown: null, investigate: false },
  { key: "vehicle_highest_cost", label: "Vehicle — Highest Cost", icon: Car, color: CHART.red, get: k => k?.vehicle_highest_cost ?? 0, sub: () => "Worst single-vehicle spend", money: true, higher_better: false, breakdown: null, investigate: false, link: "/fleet" },
  { key: "driver_highest_cost", label: "Driver — Highest Cost", icon: UsersThree, color: CHART.red, get: k => k?.driver_highest_cost ?? 0, sub: () => "Worst single-driver spend", money: true, higher_better: false, breakdown: null, investigate: false, link: "/drivers" },
  { key: "vehicle_to_sell", label: "Vehicle to Sell", icon: Car, color: CHART.purple, get: k => k?.vehicle_to_sell ?? 0, sub: () => "Highest resale-worthiness score", higher_better: false, breakdown: null, investigate: false, link: "/fleet" },
  { key: "vendor_avg_cost", label: "Vendor Avg Cost", icon: Storefront, color: CHART.gold, get: k => k?.vendor_avg_cost ?? 0, sub: () => "Mean unit cost across suppliers", money: true, higher_better: false, breakdown: null, investigate: false, link: "/parts" },
  { key: "tyre_cost", label: "Tyre Spend", icon: Tire, color: CHART.gold, get: k => k?.tyre_cost ?? 0, sub: () => "Category: tyres", money: true, higher_better: false, breakdown: "both", investigate: true },
  { key: "parts_spend", label: "Spare Parts Spend", icon: Package, color: CHART.gold, get: k => k?.total_parts_cost ?? 0, sub: () => "Completed job parts cost", money: true, higher_better: false, breakdown: null, investigate: false, series: t => t.map(x => x.parts), spark: t => t.map(x => x.parts) },
  { key: "downtime_per_vehicle", label: "Downtime per Vehicle", icon: ClockCounterClockwise, color: CHART.blue, get: k => k?.avg_downtime_days_per_vehicle ?? 0, sub: () => "Average across fleet", suffix: "d", higher_better: false, breakdown: null, investigate: false },
  { key: "trips_per_vehicle", label: "Trips per Vehicle", icon: Path, color: CHART.blue, get: k => k?.avg_trips_per_vehicle ?? 0, sub: () => "Average across fleet", higher_better: true, breakdown: null, investigate: false },
  { key: "km_per_vehicle", label: "Kilometres per Vehicle", icon: MapTrifold, color: CHART.blue, get: k => (k?.total_vehicles ? (k.total_km / k.total_vehicles) : 0), sub: () => "Average odometer", suffix: " km", higher_better: true, breakdown: null, investigate: false },
  { key: "vehicle_age", label: "Vehicle Age", icon: CalendarBlank, color: CHART.purple, get: k => k?.vehicle_age_avg ?? 0, sub: () => "Average fleet age", suffix: " yrs", higher_better: false, breakdown: null, investigate: false, link: "/fleet" },

  // --- Existing tiles, kept ---
  { key: "total_fleet_cost", label: "Total fleet cost", icon: Wallet, color: CHART.gold, get: k => k?.total_fleet_cost ?? 0, sub: () => "Maintenance + fuel + downtime", money: true, higher_better: false, breakdown: "both", investigate: true },
  { key: "total_vehicles", label: "Total vehicles", icon: Truck, color: CHART.green, get: k => k?.total_vehicles ?? 0, sub: k => `${k?.active ?? 0} active · ${k?.in_maintenance ?? 0} in maint`, higher_better: true, breakdown: "group", investigate: true },
  { key: "total_maintenance_cost", label: "Maintenance cost", icon: Wrench, color: CHART.gold, get: k => k?.total_maintenance_cost ?? 0, sub: (k, currency) => `Parts ${formatMoneyFull(k?.total_parts_cost, currency)} + labor ${formatMoneyFull(k?.total_labor_cost, currency)}`, money: true, higher_better: false, breakdown: "both", investigate: true, spark: t => t.map(x => x.total), series: t => t.map(x => x.total), anomalyFlag: true },
  { key: "downtime_cost", label: "Downtime cost", icon: ClockCounterClockwise, color: CHART.blue, get: k => k?.total_downtime_cost ?? 0, sub: k => `${k?.total_downtime_hours ?? 0}h across the fleet`, money: true, higher_better: false, breakdown: "both", investigate: true },
  { key: "utilization", label: "Fleet utilization", icon: TrendUp, color: CHART.green, get: k => k?.utilization_pct ?? 0, sub: k => `${k?.active ?? 0} of ${k?.total_vehicles ?? 0} active`, suffix: "%", higher_better: true, breakdown: null, investigate: true },
  { key: "fuel_cost", label: "Fuel cost", icon: GasPump, color: CHART.gold, get: k => k?.total_fuel_cost ?? 0, sub: () => "Logged fuel transactions", money: true, higher_better: false, breakdown: "both", investigate: true },
  { key: "pending_jobs", label: "Pending jobs", icon: Warning, color: CHART.red, get: k => k?.pending_jobs ?? 0, sub: () => "Requires action", higher_better: false, breakdown: "both", investigate: true },
  { key: "completed_jobs", label: "Completed jobs", icon: ArrowUpRight, color: CHART.blue, get: k => k?.completed_jobs ?? 0, sub: () => "All time", higher_better: true, breakdown: "both", investigate: true },
  { key: "open_incidents", label: "Open incidents", icon: Siren, color: CHART.red, get: k => k?.open_incidents ?? 0, sub: () => "Moderate or severe severity", higher_better: false, breakdown: null, investigate: false, link: "/incidents", riskMode: "alert" },
  { key: "low_stock_parts", label: "Low stock parts", icon: Package, color: CHART.red, get: k => k?.low_stock_parts ?? 0, sub: () => "At or below reorder point", higher_better: false, breakdown: null, investigate: false, link: "/parts", riskMode: "alert" },
  { key: "license_expiring", label: "Licenses expiring", icon: IdentificationBadge, color: CHART.red, get: k => k?.license_expiring ?? 0, sub: () => "Within 30 days", higher_better: false, breakdown: null, investigate: false, link: "/drivers", riskMode: "alert" },
  { key: "cost_anomalies", label: "Cost anomalies", icon: TrendUp, color: CHART.red, get: k => k?.cost_anomalies ?? 0, sub: () => "Above normal spend band", higher_better: false, breakdown: null, investigate: false, link: "/reports", riskMode: "alert" },
  { key: "fleet_health_avg", label: "Avg fleet health", icon: Heartbeat, color: CHART.purple, get: k => k?.fleet_health_avg ?? 0, sub: () => "Composite score across fleet", suffix: "%", higher_better: true, breakdown: null, investigate: false, link: "/fleet" },
  { key: "active_drivers", label: "Active drivers", icon: UsersThree, color: CHART.green, get: k => k?.active_drivers ?? 0, sub: k => `of ${k?.total_drivers ?? 0} total`, higher_better: true, breakdown: null, investigate: false, link: "/drivers" },
  { key: "parts_inventory_value", label: "Parts inventory value", icon: Package, color: CHART.gold, get: k => k?.parts_inventory_value ?? 0, sub: () => "Stock on hand × unit cost", money: true, higher_better: true, breakdown: null, investigate: false, link: "/parts" },

  // --- Phase 2 backlog: real drill-down tiles ---
  { key: "driver_performance", label: "Driver Performance", icon: UsersThree, color: CHART.purple, get: k => k?.avg_driver_score ?? 0, sub: () => "Composite score across drivers", suffix: "", higher_better: true, breakdown: "driver", investigate: true },
  { key: "defect_reporting", label: "Open Defects", icon: Bug, color: CHART.red, get: k => k?.total_defects ?? 0, sub: () => "Failed inspection items", higher_better: false, breakdown: "both", investigate: true, riskMode: "density", densityFn: k => (k?.total_vehicles ? (k.total_defects ?? 0) / k.total_vehicles : 0), densityThresholds: { green: 0.25, red: 0.75 } },
  { key: "failed_checklists", label: "Failed Checklists", icon: Warning, color: CHART.red, get: k => k?.failed_checklists ?? 0, sub: () => "Inspections with 1+ failed items", higher_better: false, breakdown: null, investigate: false, riskMode: "binary" },
];

const DEFAULT_TILES = ["total_monthly_cost", "total_fleet_cost", "total_maintenance_cost", "cost_per_vehicle", "downtime_cost", "utilization", "fuel_cost", "driver_performance"];
const defaultConfigs = () => DEFAULT_TILES.map(key => ({ key, threshold: null, view_by: "none", group_id: null }));

// Chart styles a tile can use. "gauge" and "bar" drew the value as a share of a fixed maximum that was
// a guess written into the tile definition ("Total fleet cost" counted as full at 15,000), so a bigger
// fleet showed red permanently whatever its costs were doing. Both now render as "trend", which shows
// only what's real: the value, and six months of history where a genuine monthly series exists.
const normalizeChartType = (t) => (t === "line" || t === "number" ? t : "trend");

// Some KPIs represent operational risk, not a value to scale against a max — a single failed
// checklist is always urgent regardless of fleet size, and defect exposure only means something
// relative to fleet size (28 defects is fine at 1,500 vehicles, a crisis at 15). These are coloured
// by business rule rather than left neutral.
const riskAssessment = (tile, kpi) => {
  if (tile.riskMode === "binary") {
    const val = tile.get(kpi) || 0;
    return val > 0 ? { color: CHART.red, label: "High risk" } : { color: CHART.green, label: "Healthy" };
  }
  if (tile.riskMode === "density") {
    const density = tile.densityFn(kpi) || 0;
    const { green, red } = tile.densityThresholds;
    const color = density < green ? CHART.green : density < red ? CHART.gold : CHART.red;
    const label = density < green ? "Healthy" : density < red ? "Monitor" : "High risk";
    return { color, label, density };
  }
  // Counts of open alerts (incidents, low stock, expiring licences...): any at all needs action.
  if (tile.riskMode === "alert") {
    const val = tile.get(kpi) || 0;
    return val > 0 ? { color: CHART.red, label: "Needs action" } : null;
  }
  return null;
};

// What colours a tile, in order: a detected cost spike, a business-rule risk, then the user's own
// threshold. Anything else stays neutral -- colour on this dashboard always means something real.
const tileState = (tile, kpi, cfg, anomaly) => {
  if (tile.anomalyFlag && anomaly) {
    return { color: CHART.red, label: `${anomaly.vehicle} +${anomaly.delta_pct}% above its usual month` };
  }
  const risk = tile.riskMode ? riskAssessment(tile, kpi) : null;
  if (risk) return risk;
  const threshold = cfg?.threshold;
  if (threshold != null && !Number.isNaN(Number(threshold))) {
    const val = tile.get(kpi);
    const bad = tile.higher_better ? val < threshold : val > threshold;
    return bad
      ? { color: CHART.red, label: tile.higher_better ? "Below your threshold" : "Above your threshold" }
      : { color: CHART.green, label: "Within your threshold" };
  }
  return null;
};

const KpiTile = ({ tile, kpi, cfg, trend, currency, anomaly, onClick, onGear }) => {
  const loading = kpi == null;
  const val = loading ? null : tile.get(kpi);
  const state = loading ? null : tileState(tile, kpi, cfg, anomaly);
  const accent = state?.color || tile.color;
  const alarming = state?.color === CHART.red;
  const display = loading ? "—"
    : tile.money ? formatMoney(val, currency)
    : `${typeof val === "number" ? val.toLocaleString() : val}${tile.suffix || ""}`;
  const chartType = normalizeChartType(cfg?.chart_type);
  const series = tile.series && trend ? tile.series(trend).slice(-6) : null;
  const sparkData = tile.spark && trend ? tile.spark(trend) : null;
  const viewByLabel = cfg?.view_by === "vehicle" ? "By vehicle" : cfg?.view_by === "group" ? "By group" : cfg?.view_by === "driver" ? "By driver" : null;
  const sizeSpan = cfg?.size === "lg" ? "sm:col-span-2" : "";

  const Wrapper = tile.link ? Link : "button";
  const wrapperProps = tile.link ? { to: tile.link } : { type: "button", onClick };

  return (
    <div
      className={`relative bg-[#121214] border border-border overflow-hidden group ${sizeSpan}`}
      style={{
        borderLeft: `3px solid ${accent}`,
        ...(alarming ? { background: `linear-gradient(180deg, color-mix(in srgb, ${CHART.red} 9%, transparent), #121214 70%)` } : {}),
      }}
      data-testid={`kpi-${tile.key}`}
    >
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onGear(); }}
        data-testid={`kpi-gear-${tile.key}`}
        title="Configure tile"
        className="absolute top-3 right-3 z-10 p-1.5 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <Gear size={16} />
      </button>
      <Wrapper {...wrapperProps} className="flex flex-col text-left w-full h-full p-5 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-start gap-3 pr-6">
          <div className="w-7 h-7 flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${tile.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${tile.color} 40%, transparent)` }}>
            <tile.icon size={14} style={{ color: tile.color }} />
          </div>
          <div className="min-w-0 pt-0.5">
            {/* Wraps rather than truncates, so a narrow tile never shows "COST PER VEH…". */}
            <div className="overline leading-snug">{tile.label}</div>
            {viewByLabel && <div className="text-[10px] mono uppercase tracking-widest text-muted-foreground mt-0.5">{viewByLabel}</div>}
          </div>
        </div>
        <div className="mono text-2xl font-bold mt-3" style={alarming ? { color: accent } : undefined}>{display}</div>
        {state?.density != null && (
          <div className="text-xs font-bold mt-1" style={{ color: state.color }} data-testid={`kpi-density-${tile.key}`}>
            {state.density.toFixed(2)} per vehicle · {state.label.toUpperCase()}
          </div>
        )}
        {chartType === "trend" && series && series.length > 1 && <MiniBars values={series} color={accent} />}
        {chartType === "line" && sparkData && sparkData.length > 1 && (
          <div className="mt-3" style={{ height: 44 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData.map(v => ({ v }))}>
                <Line type="monotone" dataKey="v" stroke={accent} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="text-xs mt-auto pt-3" style={state && state.density == null ? { color: state.color } : undefined}>
          {state && state.density == null ? state.label : <span className="text-muted-foreground">{tile.sub(kpi, currency)}</span>}
        </div>
        <div className="overline mt-2" style={{ color: tile.color }}>
          {tile.link ? "View details →" : "Investigate →"}
        </div>
      </Wrapper>
    </div>
  );
};
export default function Dashboard() {
  const [kpi, setKpi] = useState(null);
  // null = not loaded yet, kept distinct from "loaded, empty" so nothing shows a false empty state.
  const [trend, setTrend] = useState(null);
  const [byCat, setByCat] = useState([]);
  const [byVehicle, setByVehicle] = useState([]);
  const [maint, setMaint] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [forecast, setForecast] = useState({ history: [], forecast: [] });
  const [anomalies, setAnomalies] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [parts, setParts] = useState([]);
  const [health, setHealth] = useState(null);
  const [groups, setGroups] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [schedules, setSchedules] = useState(null);
  const [canSeeSchedules, setCanSeeSchedules] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const upcoming = useUpcoming(schedules);
  const healthList = health || [];

  // Loaded once rather than on the polling cycle below: schedules change rarely, and this is the
  // heaviest call on the page. Gated on the maintenance module, so a narrower profile gets an
  // explanation in the rail instead of an endless loading state.
  useEffect(() => {
    api.get("/maintenance-schedules")
      .then((r) => setSchedules(r.data || []))
      .catch((e) => { if (e.response?.status === 403) setCanSeeSchedules(false); setSchedules([]); });
  }, []);

  const loadGroups = () => api.get("/vehicle-groups").then(r => setGroups(r.data || [])).catch(() => {});

  const loadKpis = () => {
    Promise.all([
      api.get("/analytics/kpi").then(r => setKpi(r.data)),
      api.get("/analytics/cost-trend").then(r => setTrend(r.data || [])).catch(() => setTrend(t => t ?? [])),
      api.get("/analytics/cost-by-category").then(r => setByCat(r.data)),
      api.get("/analytics/vehicle-cost").then(r => setByVehicle(r.data)),
      api.get("/maintenance").then(r => setMaint(r.data)),
      api.get("/parts/alerts").then(r => setAlerts(r.data)),
      api.get("/analytics/forecast").then(r => setForecast(r.data)),
      api.get("/analytics/anomalies").then(r => setAnomalies(r.data)),
      api.get("/drivers").then(r => setDrivers(r.data || [])),
      api.get("/parts").then(r => setParts(r.data || [])),
      api.get("/analytics/fleet-health").then(r => setHealth(r.data || [])).catch(() => setHealth(h => h ?? [])),
      api.get("/vehicles").then(r => setVehicles(r.data || [])),
      loadGroups(),
    ]).catch(() => {});
  };
  useEffect(loadKpis, []);
  // Deliberately does NOT include /users/me/prefs (the tile layout below) -- that only ever changes
  // from this user's own actions, never from elsewhere, and re-fetching it mid-edit while
  // tileModal/showGroups is open would risk clobbering an in-progress tile customization.
  usePolling(loadKpis);

  const nextForecast = forecast.forecast[0];
  const [investigate, setInvestigate] = useState(null); // { key, groupBy }
  const [liveAlerts, setLiveAlerts] = useState(null);
  const [showGroups, setShowGroups] = useState(false);
  const [tileModal, setTileModal] = useState(null); // { mode: "create"|"edit", key: string|null }
  const [tileConfigs, setTileConfigs] = useState(defaultConfigs());
  const { currency } = useCurrency();

  const saveTiles = (configs) => {
    setTileConfigs(configs);
    api.put("/users/me/prefs", { dashboard_tiles: configs }).catch(() => {});
  };

  const cfgMap = useMemo(() => Object.fromEntries(tileConfigs.map(c => [c.key, c])), [tileConfigs]);
  const activeTiles = ALL_TILES.filter(t => cfgMap[t.key]);
  const atCap = tileConfigs.length >= MAX_TILES;

  const loadLiveAlerts = () => api.get("/alerts").then(r => setLiveAlerts(r.data)).catch(() => {});
  useEffect(() => { loadLiveAlerts(); }, []);
  usePolling(loadLiveAlerts);
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
  const healthAvg = healthList.length ? Math.round(healthList.reduce((s, h) => s + (h.score || 0), 0) / healthList.length) : 0;
  const healthByVehicle = useMemo(() => Object.fromEntries((health || []).map(h => [h.vehicle_id, h])), [health]);
  // Fleet health comes back sorted worst-first.
  const worstVehicle = healthList[0];
  const worstVehicleRecord = worstVehicle ? vehicles.find(v => String(v.id) === String(worstVehicle.vehicle_id)) : null;
  const vehicleHighestCost = byVehicle.length ? Math.max(...byVehicle.map(v => v.cost || 0)) : 0;
  const vehicleToSell = vehicles.length ? Math.max(...vehicles.map(v => {
    const h = healthByVehicle[v.id];
    const healthComponent = 100 - (h?.score ?? 100);
    const odoComponent = Math.min(100, ((v.odometer || 0) / 300000) * 100);
    const ageComponent = Math.min(100, ((new Date().getFullYear() - (v.year || new Date().getFullYear())) / 15) * 100);
    return Math.round(healthComponent * 0.5 + odoComponent * 0.3 + ageComponent * 0.2);
  })) : 0;
  const vehicleAgeAvg = vehicles.length ? (vehicles.reduce((s, v) => s + (new Date().getFullYear() - (v.year || new Date().getFullYear())), 0) / vehicles.length) : 0;

  const metrics = kpi ? {
    ...kpi,
    open_incidents: liveAlerts?.buckets?.open_incidents ?? 0,
    low_stock_parts: liveAlerts?.buckets?.low_stock_parts ?? 0,
    license_expiring: liveAlerts?.buckets?.license_expiring ?? 0,
    cost_anomalies: liveAlerts?.buckets?.cost_anomalies ?? 0,
    emergency_repairs: liveAlerts?.buckets?.maintenance_critical ?? 0,
    fleet_health_avg: healthAvg,
    active_drivers: activeDrivers,
    total_drivers: drivers.length,
    parts_inventory_value: partsValue,
    vehicle_highest_cost: vehicleHighestCost,
    vehicle_to_sell: vehicleToSell,
    vehicle_age_avg: Math.round(vehicleAgeAvg * 10) / 10,
  } : null;

  const editingConfig = tileModal?.mode === "edit" ? cfgMap[tileModal.key] : null;

  const handleTileSave = (config) => {
    if (tileModal?.mode === "edit") {
      saveTiles(tileConfigs.map(c => (c.key === config.key ? config : c)));
    } else {
      if (atCap) return;
      saveTiles([...tileConfigs, config]);
    }
    setTileModal(null);
  };

  const handleTileRemove = (key) => {
    saveTiles(tileConfigs.filter(c => c.key !== key));
  };

  return (
    <div className="noise-bg min-h-screen">
      {/* Live alerts bar now renders globally from Layout.jsx; liveAlerts here still feeds tile risk-coloring below. */}
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Command center</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="dashboard-title">Fleet Operations</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTileModal({ mode: "create", key: null })} disabled={atCap} data-testid="add-tile-btn" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed">
            <Gear size={14} /> {atCap ? `${tileConfigs.length}/${MAX_TILES} tiles` : "Add tile"}
          </button>
          <Link to="/maintenance" className="bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors" data-testid="link-maintenance">Maintenance board</Link>
        </div>
      </header>

      {/* Main column plus a schedule rail on wide screens; below xl the rail stacks after the main
          column. Everything the dashboard did before is still here -- configurable tiles,
          thresholds, investigate drill-downs, forecast, alerts. */}
      <div className="p-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <div className="space-y-6 min-w-0">
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
                  <div className="text-xs mono mt-2">{formatMoneyFull(a.spend, currency)} <span className="text-muted-foreground">vs avg {formatMoneyFull(a.mean, currency)}</span></div>
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
                <div className="mono text-2xl font-bold mt-1">{formatMoneyFull(nextForecast.total, currency)}</div>
                <div className="text-xs text-muted-foreground mt-1">Projected maintenance spend next month (linear trend)</div>
              </div>
            </div>
            <Link to="/reports" className="overline hover:text-primary">See full forecast →</Link>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4" data-testid="kpi-grid">
          {activeTiles.map(t => {
            const cfg = cfgMap[t.key];
            return (
              <KpiTile
                key={t.key}
                tile={t}
                kpi={metrics}
                cfg={cfg}
                trend={trend}
                currency={currency}
                anomaly={anomalies[0]}
                onClick={() => t.investigate && setInvestigate({ key: t.key, label: t.label, groupBy: cfg?.view_by !== "none" ? cfg?.view_by : null })}
                onGear={() => setTileModal({ mode: "edit", key: t.key })}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-6">
          {health == null ? (
            <div className="bg-[#121214] border border-border p-6"><Pending>Scoring vehicle health…</Pending></div>
          ) : worstVehicle ? (
            <FeaturedVehicle item={worstVehicle} vehicle={worstVehicleRecord} />
          ) : (
            <div className="bg-[#121214] border border-border p-6 text-sm text-muted-foreground">No vehicles scored yet.</div>
          )}
          <MaintenanceSpendChart trend={trend} currency={currency} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
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

          <div className="bg-[#121214] border border-border p-6 lg:col-span-2 2xl:col-span-1" data-testid="recent-jobs">
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
                  <div className="mono text-sm">{formatMoneyFull(m.actual_cost || m.estimated_cost, currency)}</div>
                </div>
              ))}
              {maint.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No maintenance jobs yet.</div>}
            </div>
          </div>
        </div>
        </div>

        <aside className="space-y-6 min-w-0" data-testid="dashboard-rail">
          <MonthCalendar month={calendarMonth} setMonth={setCalendarMonth} upcoming={upcoming} />
          <ScheduledList items={upcoming.slice(0, 6)} canSee={canSeeSchedules} loading={schedules == null} />
        </aside>
      </div>
      <InvestigationHub root={investigate} groups={groups} onClose={() => setInvestigate(null)} />

      <CreateTileModal
        open={!!tileModal}
        mode={tileModal?.mode || "create"}
        allTiles={ALL_TILES}
        activeKeys={tileConfigs.map(c => c.key)}
        initialConfig={editingConfig}
        groups={groups}
        currency={currency}
        atCap={atCap}
        onClose={() => setTileModal(null)}
        onSave={handleTileSave}
        onRemove={handleTileRemove}
        onManageGroups={() => { setTileModal(null); setShowGroups(true); }}
      />

      <Sheet open={showGroups} onOpenChange={setShowGroups}>
        <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-lg flex flex-col" data-testid="groups-sheet">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Vehicle groups</SheetTitle>
            <SheetDescription>Used by tiles configured to "view by group" — organize vehicles into fleets like Regional or Long-haul.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 overflow-y-auto pr-1">
            <GroupManager groups={groups} onChange={loadGroups} />
          </div>
          <div className="flex mt-4 pt-4 border-t border-border">
            <button onClick={() => saveTiles(defaultConfigs())} className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary" data-testid="reset-tiles">Reset dashboard to default tiles</button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
