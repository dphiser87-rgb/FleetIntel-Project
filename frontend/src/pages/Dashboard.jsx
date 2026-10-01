import React, { useEffect, useMemo, useRef, useState } from "react";
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
  MapTrifold, Path, Bug, DotsSixVertical,
} from "@phosphor-icons/react";
import InvestigationHub from "@/components/investigation/InvestigationHub";
import GroupManager from "@/components/GroupManager";
import CreateTileModal from "@/components/tile-config/CreateTileModal";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoney, formatMoneyFull } from "@/lib/currency";
import { usePolling } from "@/hooks/use-polling";
import { MiniBars, FeaturedVehicle, MaintenanceSpendChart, MonthCalendar, ScheduledList, Pending, useUpcoming } from "@/components/dashboard/DashboardWidgets";


const CHART = {
  green: "hsl(var(--chart-1))",
  red: "hsl(var(--chart-2))",
  gold: "hsl(var(--chart-3))",
  blue: "hsl(var(--chart-4))",
  purple: "hsl(var(--chart-5))",
};

// The server enforces the real limit per user and reports it with the prefs; this is only what's
// assumed until that arrives.
const DEFAULT_TILE_LIMIT = 15;

// Charts and panels a user can put on their dashboard alongside KPI tiles. They're picked from the
// same dialog, count toward the same limit and sit in the same drag-to-arrange grid. The parts
// alert and forecast at the top of the page aren't here: those always show. `span` is the default
// width -- "lg" takes two grid columns.
const WIDGETS = [
  { key: "w_needs_attention", label: "Needs attention", desc: "The vehicle with the lowest health score, and why", span: "md" },
  { key: "w_spend_chart", label: "Maintenance spend by month", desc: "Parts and labour over the last 12 months", span: "lg" },
  { key: "w_cost_by_category", label: "Cost by category", desc: "How spend splits across parts, labour and fuel", span: "md" },
  { key: "w_top_spenders", label: "Top spending vehicles", desc: "The six vehicles that have cost the most", span: "lg" },
  { key: "w_recent_jobs", label: "Recent maintenance jobs", desc: "The latest six jobs and what they cost", span: "lg" },
  { key: "w_calendar", label: "Schedule calendar", desc: "Maintenance due dates on a month view", span: "md" },
  { key: "w_scheduled", label: "Upcoming scheduled maintenance", desc: "The next six items due", span: "md" },
].map(w => ({ ...w, widget: true }));

// One colour per cost category everywhere on the page, matching the spend-by-month chart.
const CATEGORY_COLORS = { Parts: "#FFCC00", Labor: "#3B82F6", Labour: "#3B82F6", Fuel: "#34C759", Downtime: "#A855F7" };

// breakdown: "both" (vehicle + group), "group" (group only), "driver" (driver only), or null (no drill-down breakdown)
const ALL_TILES = [
  // --- The 14-item "Create New Tile" KPI catalog, in spec order ---
  { key: "total_monthly_cost", label: "Total Monthly Cost", icon: Wallet, color: CHART.gold, get: k => k?.total_monthly_cost ?? 0, sub: () => "This calendar month", money: true, higher_better: false, breakdown: "both", investigate: true },
  { key: "cost_per_vehicle", label: "Cost per Vehicle", icon: CurrencyDollar, color: CHART.gold, get: k => k?.cost_per_vehicle ?? 0, sub: () => "Lifetime average", money: true, higher_better: false, breakdown: null, investigate: true },
  { key: "emergency_repairs", label: "Emergency Repairs", icon: Siren, color: CHART.red, get: k => k?.emergency_repairs ?? 0, sub: () => "Critical jobs still open", higher_better: false, breakdown: null, investigate: false, link: "/maintenance", riskMode: "alert" },
  { key: "cost_efficiency_pct", scale: 100, label: "Cost Efficiency", icon: Gauge, color: CHART.green, get: k => k?.cost_efficiency_pct ?? 0, sub: () => "Jobs completed at/under estimate", suffix: "%", higher_better: true, breakdown: null, investigate: false },
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
  { key: "utilization", scale: 100, label: "Fleet utilization", icon: TrendUp, color: CHART.green, get: k => k?.utilization_pct ?? 0, sub: k => `${k?.active ?? 0} of ${k?.total_vehicles ?? 0} active`, suffix: "%", higher_better: true, breakdown: null, investigate: true },
  { key: "fuel_cost", label: "Fuel cost", icon: GasPump, color: CHART.gold, get: k => k?.total_fuel_cost ?? 0, sub: () => "Logged fuel transactions", money: true, higher_better: false, breakdown: "both", investigate: true },
  { key: "pending_jobs", label: "Pending jobs", icon: Warning, color: CHART.red, get: k => k?.pending_jobs ?? 0, sub: () => "Requires action", higher_better: false, breakdown: "both", investigate: true },
  { key: "completed_jobs", label: "Completed jobs", icon: ArrowUpRight, color: CHART.blue, get: k => k?.completed_jobs ?? 0, sub: () => "All time", higher_better: true, breakdown: "both", investigate: true },
  { key: "open_incidents", label: "Open incidents", icon: Siren, color: CHART.red, get: k => k?.open_incidents ?? 0, sub: () => "Moderate or severe severity", higher_better: false, breakdown: null, investigate: false, link: "/incidents", riskMode: "alert" },
  { key: "low_stock_parts", label: "Low stock parts", icon: Package, color: CHART.red, get: k => k?.low_stock_parts ?? 0, sub: () => "At or below reorder point", higher_better: false, breakdown: null, investigate: false, link: "/parts", riskMode: "alert" },
  { key: "license_expiring", label: "Licenses expiring", icon: IdentificationBadge, color: CHART.red, get: k => k?.license_expiring ?? 0, sub: () => "Within 30 days", higher_better: false, breakdown: null, investigate: false, link: "/drivers", riskMode: "alert" },
  { key: "cost_anomalies", label: "Cost anomalies", icon: TrendUp, color: CHART.red, get: k => k?.cost_anomalies ?? 0, sub: () => "Above normal spend band", higher_better: false, breakdown: null, investigate: false, link: "/reports", riskMode: "alert" },
  { key: "fleet_health_avg", scale: 100, label: "Avg fleet health", icon: Heartbeat, color: CHART.purple, get: k => k?.fleet_health_avg ?? 0, sub: () => "Composite score across fleet", suffix: "%", higher_better: true, breakdown: null, investigate: false, link: "/fleet" },
  { key: "active_drivers", label: "Active drivers", icon: UsersThree, color: CHART.green, get: k => k?.active_drivers ?? 0, sub: k => `of ${k?.total_drivers ?? 0} total`, higher_better: true, breakdown: null, investigate: false, link: "/drivers" },
  { key: "parts_inventory_value", label: "Parts inventory value", icon: Package, color: CHART.gold, get: k => k?.parts_inventory_value ?? 0, sub: () => "Stock on hand × unit cost", money: true, higher_better: true, breakdown: null, investigate: false, link: "/parts" },

  // --- Phase 2 backlog: real drill-down tiles ---
  { key: "driver_performance", scale: 100, label: "Driver Performance", icon: UsersThree, color: CHART.purple, get: k => k?.avg_driver_score ?? 0, sub: () => "Composite score across drivers", suffix: "", higher_better: true, breakdown: "driver", investigate: true },
  { key: "defect_reporting", label: "Open Defects", icon: Bug, color: CHART.red, get: k => k?.total_defects ?? 0, sub: () => "Failed inspection items", higher_better: false, breakdown: "both", investigate: true, riskMode: "density", densityFn: k => (k?.total_vehicles ? (k.total_defects ?? 0) / k.total_vehicles : 0), densityThresholds: { green: 0.25, red: 0.75 } },
  { key: "failed_checklists", label: "Failed Checklists", icon: Warning, color: CHART.red, get: k => k?.failed_checklists ?? 0, sub: () => "Inspections with 1+ failed items", higher_better: false, breakdown: null, investigate: false, riskMode: "binary" },
];

const thisYear = () => new Date().getFullYear();
const vehicleAge = (v) => thisYear() - (v.year || thisYear());
// Resale-worthiness: poor health 50%, high mileage 30%, age 20%. One formula for the "Vehicle to
// Sell" tile and its ranking, so the two can't disagree.
const sellScore = (v, h) => Math.round(
  (100 - (h?.score ?? 100)) * 0.5
  + Math.min(100, ((v.odometer || 0) / 300000) * 100) * 0.3
  + Math.min(100, (vehicleAge(v) / 15) * 100) * 0.2,
);

// Which KPIs can be shown as ranked bars, and where the rows come from. `rank` names the field in the
// backend's Investigate breakdown for that KPI; `local` ranks data the dashboard has already loaded,
// for KPIs the dashboard itself calculates. Either way the rows are what the tile's number is made
// of. By default the worst comes first (biggest for lower-is-better, smallest for higher-is-better);
// `order` overrides that where "worst" means something else.
const RANKING = {
  total_monthly_cost: { rank: "value", empty: "No completed jobs this month yet." },
  total_fleet_cost: { rank: "value" },
  total_maintenance_cost: { rank: "value" },
  cost_per_vehicle: { rank: "cost" },
  downtime_cost: { rank: "value" },
  fuel_cost: { rank: "value" },
  tyre_cost: { rank: "value" },
  pending_jobs: { rank: "jobs" },
  completed_jobs: { rank: "jobs", order: "desc" },  // most-serviced vehicles first
  defect_reporting: { rank: "value" },
  driver_performance: { rank: "score" },
  total_vehicles: { rank: "value", order: "desc" },  // biggest groups first
  vehicle_highest_cost: { rank: "value" },
  driver_highest_cost: { rank: "value", by: "driver", empty: "No job or fuel costs linked to a driver yet." },
  trips_per_vehicle: { rank: "value" },
  downtime_per_vehicle: { rank: "value", suffix: " days" },
  emergency_repairs: { rank: "value", empty: "No open critical jobs." },
  open_incidents: { rank: "value", empty: "No open moderate or severe incidents." },
  failed_checklists: { rank: "value", empty: "No failed checklists." },
  license_expiring: {
    rank: "value", by: "driver", order: "asc", heading: "Soonest", empty: "No licences expiring soon.",
    format: (v) => (v < 0 ? `expired ${-v}d ago` : v === 0 ? "today" : `in ${v}d`),
  },
  vehicle_to_sell: { local: (d) => d.vehicles.map(v => ({ label: v.name, plate: v.plate, v: sellScore(v, d.healthByVehicle[v.id]) })) },
  vehicle_age: { suffix: " yrs", local: (d) => d.vehicles.map(v => ({ label: v.name, plate: v.plate, v: vehicleAge(v) })) },
  km_per_vehicle: { suffix: " km", local: (d) => d.vehicles.map(v => ({ label: v.name, plate: v.plate, v: v.odometer || 0 })) },
  fleet_health_avg: { local: (d) => d.health.map(h => ({ label: h.name, plate: h.plate, v: h.score || 0 })) },
  parts_inventory_value: { by: "part", order: "desc", local: (d) => d.parts.map(p => ({ label: p.name, v: (p.stock || 0) * (p.unit_cost || 0) })) },
  vendor_avg_cost: {
    by: "supplier",
    local: (d) => Object.entries(d.parts.reduce((acc, p) => {
      const s = p.supplier || "Unknown";
      (acc[s] = acc[s] || []).push(p.unit_cost || 0);
      return acc;
    }, {})).map(([s, costs]) => ({ label: s, v: costs.reduce((a, b) => a + b, 0) / costs.length })),
  },
  low_stock_parts: {
    by: "part", order: "asc", heading: "Lowest stock", empty: "Nothing below its reorder point.",
    format: (v) => `${v} left`,
    local: (d) => d.parts.filter(p => (p.stock || 0) <= (p.reorder_point || 0)).map(p => ({ label: p.name, v: p.stock || 0 })),
  },
  cost_anomalies: {
    format: (v) => `+${v}%`, empty: "No cost spikes this month.",
    local: (d) => d.anomalies.map(a => ({ label: a.vehicle, plate: a.plate, v: a.delta_pct || 0 })),
  },
};

// A new user's starting layout: eight KPIs plus the two panels most people want, leaving room under
// the limit for their own choices. Migration 0053 gave existing layouts the same two panels.
const DEFAULT_TILES = ["total_monthly_cost", "total_fleet_cost", "total_maintenance_cost", "cost_per_vehicle", "downtime_cost", "utilization", "fuel_cost", "driver_performance", "w_needs_attention", "w_spend_chart"];
const defaultConfigs = () => DEFAULT_TILES.map(key => {
  const widget = WIDGETS.find(w => w.key === key);
  return { key, threshold: null, view_by: "none", group_id: null, ...(widget ? { size: widget.span } : {}) };
});
// Everything a user can place on their dashboard grid.
const CATALOGUE = [...ALL_TILES.map(t => (RANKING[t.key] ? { ...t, ranking: RANKING[t.key] } : t)), ...WIDGETS];

// Chart styles a tile can use. "gauge" and "bar" drew the value as a share of a fixed maximum that was
// a guess written into the tile definition ("Total fleet cost" counted as full at 15,000), so a bigger
// fleet showed red permanently whatever its costs were doing. Both now render as "trend", which shows
// only what's real: the value, and six months of history where a genuine monthly series exists.
// "ranked" needs a breakdown of what makes up the number (tile.ranking) and "dial" a real 0-100 scale (tile.scale); a
// saved style the tile can't support falls back to "trend" rather than drawing something made up.
const normalizeChartType = (t, tile) => {
  if (t === "number") return t;
  if (t === "line" && tile?.spark) return t;
  if (t === "ranked" && tile?.ranking) return t;
  if (t === "dial" && tile?.scale) return t;
  return "trend";
};

// Who is behind a number, worst first: biggest spenders, or for a higher-is-better score the lowest.
// Rows come from the backend's Investigate breakdown (the same one the drill-down shows), or for a
// KPI the dashboard calculates itself, from the data it already loaded (`localData`). Either way the
// bars are what the tile's number is made of.
function RankedBars({ tile, cfg, currency, color, limit, localData }) {
  const how = tile.ranking;
  const [fetched, setFetched] = useState(null);
  const groupBy = how.by || (cfg?.view_by && cfg.view_by !== "none" ? cfg.view_by
    : tile.breakdown === "group" ? "group" : tile.breakdown === "driver" ? "driver" : "vehicle");
  const load = () => {
    if (how.local) return;
    const params = new URLSearchParams();
    if (how.rank !== "cost" && how.rank !== "score") params.set("group_by", groupBy);
    if (cfg?.period && cfg.period !== "all") params.set("period", cfg.period);
    return api.get(`/investigate/${tile.key}?${params}`)
      .then((r) => setFetched((r.data?.rows || []).map((x) => ({ label: x.vehicle || x.name || "—", plate: x.plate, v: Number(x[how.rank]) || 0 }))))
      .catch(() => setFetched((prev) => prev ?? []));
  };
  useEffect(() => { load(); }, [tile.key, groupBy, cfg?.period]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each breakdown reads the full job and fuel history, so these refresh less often than the tiles.
  usePolling(load, 120000);

  const rows = how.local ? (localData ? how.local(localData) : null) : fetched;
  if (rows == null) return <div className="mt-3"><Pending>Ranking…</Pending></div>;
  const ascending = how.order ? how.order === "asc" : tile.higher_better;
  const ranked = rows
    // For a lower-is-better KPI a zero isn't a contender (a vehicle with no incidents isn't "worst").
    .filter((r) => ascending || r.v > 0)
    .sort((a, b) => (ascending ? a.v - b.v : b.v - a.v))
    .slice(0, limit);
  if (ranked.length === 0) return <div className="text-xs text-muted-foreground mt-3">{how.empty || "Nothing to rank yet."}</div>;
  const max = Math.max(...ranked.map((r) => Math.abs(r.v)), tile.scale || 0) || 1;
  const fmt = (v) => (how.format ? how.format(v)
    : tile.money ? formatMoney(v, currency)
    : `${(Math.round(v * 10) / 10).toLocaleString()}${how.suffix ?? tile.suffix ?? ""}`);
  return (
    <div className="mt-3" data-testid={`ranked-${tile.key}`}>
      <div className="text-[10px] mono uppercase tracking-widest text-muted-foreground mb-1.5">
        {how.heading || (ascending ? "Lowest" : "Highest")} {ranked.length} · by {groupBy}
      </div>
      <ul className="space-y-1.5">
        {ranked.map((r, i) => (
          <li key={`${r.label}${i}`} className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] items-center gap-2 text-xs">
            <span className="truncate text-muted-foreground" title={r.plate ? `${r.label} · ${r.plate}` : r.label}>{r.label}</span>
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="h-2.5 shrink-0" style={{ width: `${Math.max(3, (r.v / max) * 70)}%`, background: color }} />
              <span className="mono shrink-0">{fmt(r.v)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A value on its real scale (a percentage or a 0-100 score), drawn as a half-circle.
function Dial({ value, scale, color }) {
  const pct = Math.max(0, Math.min(1, (Number(value) || 0) / scale));
  const r = 40, c = Math.PI * r;
  return (
    <svg viewBox="0 0 100 56" className="w-full max-w-[180px] mx-auto mt-3 block" aria-hidden="true">
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#27272a" strokeWidth="9" />
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke={color} strokeWidth="9" strokeDasharray={`${pct * c} ${c}`} />
    </svg>
  );
}

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

// A grid cell the user can drag to a new position. The drag handle and settings gear sit in a small
// pill on the cell's top edge rather than inside it, so they never cover a panel's own controls
// (the calendar's month arrows, "View all" links). They appear on hover with a mouse and stay
// visible on touch screens, which have no hover.
function SortableCell({ id, label, className = "", onGear, children }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const reveal = "[@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-within:opacity-100";
  // Touch screens get bigger controls: a 26px handle on a tile's edge is too small to hit with a finger.
  const control = "p-1.5 [@media(hover:none)]:p-2.5 text-muted-foreground hover:text-primary";
  return (
    <div
      ref={setNodeRef}
      // On a touch screen the whole tile is a drag handle after a press-and-hold (see the
      // TouchSensor delay), which is how people expect to move things on a phone. A quick swipe
      // still scrolls the page and a tap still opens the tile. Mouse dragging stays on the handle
      // only, so clicks and text selection on desktop are untouched.
      onTouchStart={listeners?.onTouchStart}
      // Stop the long-press link menu / iOS preview from opening over a drag.
      onContextMenu={(e) => { if (e.nativeEvent.pointerType !== "mouse" && window.matchMedia("(hover: none)").matches) e.preventDefault(); }}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : undefined, WebkitTouchCallout: "none" }}
      className={`relative group min-w-0 [@media(hover:none)]:select-none ${isDragging ? "opacity-80 ring-1 ring-primary shadow-2xl" : ""} ${className}`}
      data-testid={`cell-${id}`}
    >
      {children}
      <div className={`absolute -top-3.5 right-3 z-20 flex items-center border border-border bg-[#0b0b0d] transition-opacity ${reveal}`}>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          // The handle picks up straight away -- mouse, pen or finger -- with no hold. Its touches
          // stop here so the tile's press-and-hold below doesn't also start on them.
          onPointerDown={listeners?.onPointerDown}
          onKeyDown={listeners?.onKeyDown}
          onTouchStart={(e) => e.stopPropagation()}
          aria-label={`Move ${label}`}
          title="Drag to move"
          data-testid={`drag-${id}`}
          className={`${control} cursor-grab active:cursor-grabbing touch-none`}
        >
          <DotsSixVertical size={14} />
        </button>
        <button
          type="button"
          onClick={onGear}
          aria-label={`Configure ${label}`}
          title="Configure"
          data-testid={`kpi-gear-${id}`}
          className={`${control} border-l border-border`}
        >
          <Gear size={14} />
        </button>
      </div>
    </div>
  );
}

const KpiTile = ({ tile, kpi, cfg, trend, currency, anomaly, onClick, rankData }) => {
  const loading = kpi == null;
  const val = loading ? null : tile.get(kpi);
  const state = loading ? null : tileState(tile, kpi, cfg, anomaly);
  const accent = state?.color || tile.color;
  const alarming = state?.color === CHART.red;
  const display = loading ? "—"
    : tile.money ? formatMoney(val, currency)
    : `${typeof val === "number" ? val.toLocaleString() : val}${tile.suffix || ""}`;
  const chartType = normalizeChartType(cfg?.chart_type, tile);
  const series = tile.series && trend ? tile.series(trend).slice(-6) : null;
  const sparkData = tile.spark && trend ? tile.spark(trend) : null;
  const viewByLabel = cfg?.view_by === "vehicle" ? "By vehicle" : cfg?.view_by === "group" ? "By group" : cfg?.view_by === "driver" ? "By driver" : null;

  const Wrapper = tile.link ? Link : "button";
  const wrapperProps = tile.link ? { to: tile.link } : { type: "button", onClick };

  return (
    <div
      className="relative bg-[#121214] border border-border overflow-hidden h-full"
      style={{
        borderLeft: `3px solid ${accent}`,
        ...(alarming ? { background: `linear-gradient(180deg, color-mix(in srgb, ${CHART.red} 9%, transparent), #121214 70%)` } : {}),
      }}
      data-testid={`kpi-${tile.key}`}
    >
      <Wrapper {...wrapperProps} className="flex flex-col text-left w-full h-full min-h-[180px] p-6 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${tile.color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${tile.color} 40%, transparent)` }}>
            <tile.icon size={16} style={{ color: tile.color }} />
          </div>
          <div className="min-w-0 pt-0.5">
            {/* Wraps rather than truncates, so a narrow tile never shows "COST PER VEH…". */}
            <div className="overline leading-snug">{tile.label}</div>
            {viewByLabel && <div className="text-[10px] mono uppercase tracking-widest text-muted-foreground mt-0.5">{viewByLabel}</div>}
          </div>
        </div>
        {chartType === "number" ? (
          // Big number: the value is the whole tile.
          <div className="mono text-5xl font-bold text-center py-5 tracking-tight" style={alarming || state ? { color: accent } : undefined} data-testid={`bignum-${tile.key}`}>{display}</div>
        ) : chartType === "dial" ? (
          <div data-testid={`dial-${tile.key}`}>
            <Dial value={val} scale={tile.scale} color={accent} />
            <div className="mono text-3xl font-bold text-center -mt-1" style={alarming || state ? { color: accent } : undefined}>{display}</div>
          </div>
        ) : (
          <div className="mono text-2xl font-bold mt-3" style={alarming ? { color: accent } : undefined}>{display}</div>
        )}
        {chartType === "ranked" && !loading && (
          <RankedBars tile={tile} cfg={cfg} currency={currency} color={accent} limit={cfg?.size === "lg" ? 8 : 5} localData={rankData} />
        )}
        {state?.density != null && (
          <div className="text-xs font-bold mt-1" style={{ color: state.color }} data-testid={`kpi-density-${tile.key}`}>
            {state.density.toFixed(2)} per vehicle · {state.label.toUpperCase()}
          </div>
        )}
        {chartType === "trend" && series && series.length > 1 && <MiniBars values={series} color={accent} />}
        {chartType === "line" && sparkData && sparkData.length > 1 && (
          <div className="mt-3" style={{ height: 44 }} data-testid="sparkline">
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
  // Vehicles, parts and the rest start as empty lists; this says whether the first load has finished,
  // so a ranked tile doesn't announce "nothing to rank" before anything has arrived.
  const [baseLoaded, setBaseLoaded] = useState(false);
  const [canSeeSchedules, setCanSeeSchedules] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const upcoming = useUpcoming(schedules);
  const healthList = health || [];

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
    ]).catch(() => {}).finally(() => setBaseLoaded(true));
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
  // KPI tiles and panels in the order this user arranged them. null until their saved layout has
  // loaded, so the default layout doesn't flash up first and then rearrange itself.
  const [tileConfigs, setTileConfigs] = useState(null);
  const [tileLimit, setTileLimit] = useState(DEFAULT_TILE_LIMIT);
  const { currency } = useCurrency();
  const configs = useMemo(() => tileConfigs || [], [tileConfigs]);

  const applyPrefs = (prefs) => {
    if (prefs?.dashboard_tile_limit) setTileLimit(prefs.dashboard_tile_limit);
    const saved = prefs?.dashboard_tiles;
    // Backward-compat: older prefs stored plain string keys instead of config objects.
    const normalized = Array.isArray(saved)
      ? saved.map(t => (typeof t === "string" ? { key: t, threshold: null, view_by: "none", group_id: null } : t))
          .filter(t => CATALOGUE.some(at => at.key === t.key))
      : [];
    setTileConfigs(normalized.length > 0 ? normalized : defaultConfigs());
  };
  // Every load and save takes a ticket; a load only lands if nothing newer has happened since it
  // was sent. Otherwise a slow initial load could arrive after the user's first change and quietly
  // put the old layout back.
  const prefsSeq = useRef(0);
  const loadPrefs = () => {
    const ticket = ++prefsSeq.current;
    return api.get("/users/me/prefs")
      .then(r => { if (ticket === prefsSeq.current) applyPrefs(r.data); })
      .catch(() => { if (ticket === prefsSeq.current) setTileConfigs(c => c ?? defaultConfigs()); });
  };
  useEffect(() => { loadPrefs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount

  const saveTiles = (next) => {
    prefsSeq.current += 1;
    setTileConfigs(next);
    api.put("/users/me/prefs", { dashboard_tiles: next }).catch((e) => {
      // Put the screen back to what's actually saved rather than leave a layout that will vanish
      // on the next visit.
      toast.error(e.response?.data?.detail || "Couldn't save your dashboard layout.");
      loadPrefs();
    });
  };

  const cfgMap = useMemo(() => Object.fromEntries(configs.map(c => [c.key, c])), [configs]);
  const cells = configs.map(c => CATALOGUE.find(t => t.key === c.key)).filter(Boolean);
  const atCap = configs.length >= tileLimit;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Press and hold 250ms to pick a tile up; moving more than 8px first counts as a scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = configs.findIndex(c => c.key === active.id);
    const to = configs.findIndex(c => c.key === over.id);
    if (from < 0 || to < 0) return;
    saveTiles(arrayMove(configs, from, to));
  };

  // Schedules are the heaviest call on the page, so they're only fetched for someone who has a
  // schedule panel on their dashboard, and once rather than on the polling cycle -- they change
  // rarely. Gated on the maintenance module: a narrower profile gets an explanation in the panel
  // instead of an endless loading state.
  const wantsSchedules = configs.some(c => c.key === "w_calendar" || c.key === "w_scheduled");
  useEffect(() => {
    if (!wantsSchedules || schedules != null) return;
    api.get("/maintenance-schedules")
      .then((r) => setSchedules(r.data || []))
      .catch((e) => { if (e.response?.status === 403) setCanSeeSchedules(false); setSchedules([]); });
  }, [wantsSchedules, schedules]);

  const loadLiveAlerts = () => api.get("/alerts").then(r => setLiveAlerts(r.data)).catch(() => {});
  useEffect(() => { loadLiveAlerts(); }, []);
  usePolling(loadLiveAlerts);

  const activeDrivers = drivers.filter(d => d.status === "active").length;
  const partsValue = parts.reduce((s, p) => s + (p.stock || 0) * (p.unit_cost || 0), 0);
  const healthAvg = healthList.length ? Math.round(healthList.reduce((s, h) => s + (h.score || 0), 0) / healthList.length) : 0;
  const healthByVehicle = useMemo(() => Object.fromEntries((health || []).map(h => [h.vehicle_id, h])), [health]);
  // Fleet health comes back sorted worst-first.
  const worstVehicle = healthList[0];
  const worstVehicleRecord = worstVehicle ? vehicles.find(v => String(v.id) === String(worstVehicle.vehicle_id)) : null;
  const vehicleHighestCost = byVehicle.length ? Math.max(...byVehicle.map(v => v.cost || 0)) : 0;
  const vehicleToSell = vehicles.length ? Math.max(...vehicles.map(v => sellScore(v, healthByVehicle[v.id]))) : 0;
  const vehicleAgeAvg = vehicles.length ? (vehicles.reduce((s, v) => s + vehicleAge(v), 0) / vehicles.length) : 0;
  // What locally-ranked tiles rank: the same data their numbers above are calculated from.
  const rankData = useMemo(
    () => (baseLoaded ? { vehicles, healthByVehicle, health: health || [], parts, anomalies } : null),
    [baseLoaded, vehicles, healthByVehicle, health, parts, anomalies],
  );

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
      saveTiles(configs.map(c => (c.key === config.key ? config : c)));
    } else {
      if (atCap) return;
      saveTiles([...configs, config]);
    }
    setTileModal(null);
  };

  const handleTileRemove = (key) => {
    saveTiles(configs.filter(c => c.key !== key));
  };

  const renderWidget = (key) => {
    switch (key) {
      case "w_needs_attention":
        return health == null ? (
          <div className="bg-[#121214] border border-border p-6"><Pending>Scoring vehicle health…</Pending></div>
        ) : worstVehicle ? (
          <FeaturedVehicle item={worstVehicle} vehicle={worstVehicleRecord} />
        ) : (
          <div className="bg-[#121214] border border-border p-6 text-sm text-muted-foreground">No vehicles scored yet.</div>
        );
      case "w_spend_chart":
        return <MaintenanceSpendChart trend={trend} currency={currency} />;
      case "w_cost_by_category":
        return (
          <div className="bg-[#121214] border border-border p-6" data-testid="chart-cost-cat">
            <div className="overline">Cost by category</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={byCat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {byCat.map((c, i) => (<Cell key={i} fill={CATEGORY_COLORS[c.name] || "#71717a"} stroke="none" />))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontSize: 12 }} formatter={(v) => formatMoneyFull(v, currency)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );
      case "w_top_spenders":
        return (
          <div className="bg-[#121214] border border-border p-6" data-testid="chart-by-vehicle">
            <div className="overline">Top spending vehicles</div>
            <div style={{ height: 240 }} className="mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byVehicle.slice(0, 6)} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="vehicle" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => formatMoney(v, currency)} />
                  <Tooltip cursor={{ fill: "#ffffff08" }} contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontSize: 12 }} formatter={(v) => [formatMoneyFull(v, currency), "Cost"]} />
                  {/* Neutral: being the biggest spender isn't by itself a problem. Red stays reserved for real alerts. */}
                  <Bar dataKey="cost" fill="#71717a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      case "w_recent_jobs":
        return (
          <div className="bg-[#121214] border border-border p-6" data-testid="recent-jobs">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="overline">Recent maintenance jobs</div>
              <Link to="/maintenance" className="overline text-primary hover:underline whitespace-nowrap">View all</Link>
            </div>
            <div>
              {maint.slice(0, 6).map(m => (
                <div key={m.id} className="flex items-center justify-between gap-3 border-b border-border/50 py-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{m.title}</div>
                    <div className="overline mt-1">{String(m.status).replace(/_/g, " ")} · {m.priority}</div>
                  </div>
                  <div className="mono text-sm shrink-0">{formatMoneyFull(m.actual_cost || m.estimated_cost, currency)}</div>
                </div>
              ))}
              {maint.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No maintenance jobs yet.</div>}
            </div>
          </div>
        );
      case "w_calendar":
        return <MonthCalendar month={calendarMonth} setMonth={setCalendarMonth} upcoming={upcoming} />;
      case "w_scheduled":
        return <ScheduledList items={upcoming.slice(0, 6)} canSee={canSeeSchedules} loading={schedules == null} />;
      default:
        return null;
    }
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
            <Gear size={14} /> {atCap ? "Dashboard full" : "Add tile"}
            {tileConfigs && <span className="mono text-muted-foreground" data-testid="tile-count">{configs.length}/{tileLimit}</span>}
          </button>
          <Link to="/maintenance" className="bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors" data-testid="link-maintenance">Maintenance board</Link>
        </div>
      </header>

      {/* Alerts and the forecast always show at the top. Below them is one grid of whatever this user
          chose -- KPI tiles, charts, the schedule calendar -- in the order they dragged them into. */}
      <div className="p-4 sm:p-8">
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
        {tileConfigs == null ? (
          <div className="py-10"><Pending>Loading your dashboard…</Pending></div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={cells.map(c => c.key)} strategy={rectSortingStrategy}>
              {/* items-start: a KPI tile sharing a row with a tall chart keeps its own height
                  instead of stretching into a mostly empty box. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-6 items-start pt-2" data-testid="kpi-grid">
                {cells.map(t => {
                  const cfg = cfgMap[t.key];
                  const wide = t.widget ? (cfg?.size || t.span) === "lg" : cfg?.size === "lg";
                  return (
                    <SortableCell
                      key={t.key}
                      id={t.key}
                      label={t.label}
                      className={wide ? "sm:col-span-2" : ""}
                      onGear={() => setTileModal({ mode: "edit", key: t.key })}
                    >
                      {t.widget ? renderWidget(t.key) : (
                        <KpiTile
                          tile={t}
                          kpi={metrics}
                          cfg={cfg}
                          trend={trend}
                          currency={currency}
                          anomaly={anomalies[0]}
                          rankData={rankData}
                          onClick={() => t.investigate && setInvestigate({ key: t.key, label: t.label, groupBy: cfg?.view_by !== "none" ? cfg?.view_by : null })}
                        />
                      )}
                    </SortableCell>
                  );
                })}
                {!atCap && (
                  <button
                    type="button"
                    onClick={() => setTileModal({ mode: "create", key: null })}
                    data-testid="add-tile-cell"
                    className="min-h-[180px] border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors flex flex-col items-center justify-center gap-2 p-6 text-center"
                  >
                    <Gear size={18} />
                    <span className="overline">Add a KPI or chart</span>
                    <span className="text-xs">
                      {tileLimit - configs.length} of {tileLimit} spaces left ·{" "}
                      <span className="[@media(hover:none)]:hidden">drag tiles to rearrange</span>
                      <span className="hidden [@media(hover:none)]:inline">press and hold a tile to move it</span>
                    </span>
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}
        </div>
      </div>
      <InvestigationHub root={investigate} groups={groups} onClose={() => setInvestigate(null)} />

      <CreateTileModal
        open={!!tileModal}
        mode={tileModal?.mode || "create"}
        allTiles={CATALOGUE}
        activeKeys={configs.map(c => c.key)}
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
