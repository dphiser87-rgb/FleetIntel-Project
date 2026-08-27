import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import {
  TrendUp, TrendDown, Wrench, Tire, Package, CurrencyDollar, Brain, Warning, Info, CheckCircle, Siren,
} from "@phosphor-icons/react";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoney, formatMoneyFull } from "@/lib/currency";
import InvestigationHub from "@/components/investigation/InvestigationHub";

const CHART = {
  maintenance: "hsl(var(--chart-1))", // green
  tyres: "hsl(var(--chart-4))",       // blue
  parts: "hsl(var(--chart-3))",       // gold
};

// Explicit hex, not the `primary` design token — `--primary` is the workspace's brand/country
// accent color (green in the default theme here), which would make a "red-tinted urgency" card
// visually indistinguishable from the "green = good" success cards right next to it. The red/amber/
// green trio here needs to stay red/amber/green regardless of which brand color a workspace has set.
const INSIGHT_STYLE = {
  warning: "border-[#FF3B30]/40 bg-[#FF3B30]/5",
  alert: "border-[#FF3B30]/40 bg-[#FF3B30]/5",
  info: "border-[#FFCC00]/40 bg-[#FFCC00]/5",
  success: "border-[#34C759]/40 bg-[#34C759]/5",
};
const INSIGHT_ICON = { warning: Siren, alert: Warning, info: Info, success: CheckCircle };
const PRIORITY_COLOR = {
  High: "border-[#FF3B30] text-[#FF3B30]",
  Medium: "border-[#FFCC00] text-[#FFCC00]",
  Low: "border-[#34C759] text-[#34C759]",
};

const KPI_TILES = [
  { key: "maintenance", label: "Total Fleet Maintenance Spend", icon: Wrench },
  { key: "tyres", label: "Total Tyre Spend", icon: Tire },
  { key: "parts", label: "Total Spare Parts Spend", icon: Package },
  { key: "cost_per_vehicle", label: "Fleet Cost per Vehicle / Month", icon: CurrencyDollar },
];

export default function ExecutiveDashboard() {
  const { currency } = useCurrency();
  const [data, setData] = useState(null);
  const [groups, setGroups] = useState([]);
  const [investigate, setInvestigate] = useState(null);

  useEffect(() => {
    api.get("/analytics/executive-dashboard").then((r) => setData(r.data));
    api.get("/vehicle-groups").then((r) => setGroups(r.data || [])).catch(() => {});
  }, []);

  if (!data) return <div className="noise-bg min-h-screen p-12 text-muted-foreground">Loading…</div>;

  const money = (n) => formatMoney(n, currency);
  const moneyFull = (n) => formatMoneyFull(n, currency);
  const maxVehicleCost = Math.max(1, ...data.top_vehicles.map((v) => v.value));
  const maxRegionCost = Math.max(1, ...data.by_region.map((r) => r.value));

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Fleet Intelligence</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="executive-dashboard-title">Executive Dashboard</h1>
          <div className="text-sm text-muted-foreground mt-2">Fleet-wide cost intelligence overview with AI-generated insights</div>
        </div>
        <div className="flex items-center gap-2 border border-primary/40 bg-primary/10 text-primary px-3 py-2 text-xs uppercase tracking-widest">
          <Brain size={14} /> {data.insights.length} AI Insight{data.insights.length !== 1 ? "s" : ""}
        </div>
      </header>

      <div className="p-8 space-y-8">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border border-border grid-borders" data-testid="exec-kpi-tiles">
          {KPI_TILES.map(({ key, label, icon: Icon }) => {
            const k = data.kpis[key];
            const up = k.delta_pct > 0; // all 4 tiles are cost metrics — rising is always the bad direction
            return (
              <div key={key} className="p-5 bg-[#121214]">
                <div className="flex items-center gap-2 overline"><Icon size={12} /> {label}</div>
                <div className="mono text-2xl font-bold mt-2">{moneyFull(k.value)}</div>
                {k.delta_pct !== 0 && (
                  <div className={`flex items-center gap-1 text-xs mt-1 ${up ? "text-[#FF3B30]" : "text-[#34C759]"}`}>
                    {up ? <TrendUp size={12} /> : <TrendDown size={12} />}
                    {up ? "+" : ""}{k.delta_pct}% vs last month
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Monthly stacked bar */}
        <div className="bg-[#121214] border border-border p-6">
          <div className="overline mb-4">Total Fleet Cost Breakdown by Month</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#a1a1aa" }} stroke="#636366" />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} stroke="#636366" tickFormatter={(v) => money(v)} />
              <Tooltip formatter={(v) => moneyFull(v)} contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontSize: 12 }} labelStyle={{ color: "#fff" }} itemStyle={{ color: "#fff" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }} />
              <Bar dataKey="maintenance" stackId="a" fill={CHART.maintenance} name="Maintenance" radius={[0, 0, 0, 0]} />
              <Bar dataKey="tyres" stackId="a" fill={CHART.tyres} name="Tyres" />
              <Bar dataKey="parts" stackId="a" fill={CHART.parts} name="Parts" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Second row: YTD donut / Top vehicles / Region + Suppliers */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-[#121214] border border-border p-6">
            <div className="overline mb-4">YTD Spend Breakdown</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.ytd_breakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                  {data.ytd_breakdown.map((entry) => (
                    <Cell key={entry.name} fill={CHART[entry.name.toLowerCase()] || CHART.parts} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => moneyFull(v)} contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontSize: 12 }} labelStyle={{ color: "#fff" }} itemStyle={{ color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {data.ytd_breakdown.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm shrink-0" style={{ background: CHART[c.name.toLowerCase()] || CHART.parts }} /> {c.name}</span>
                  <span className="mono text-muted-foreground">{c.pct}% · {moneyFull(c.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#121214] border border-border p-6">
            <div className="overline mb-4">Top 6 Highest Cost Vehicles</div>
            <div className="space-y-3">
              {data.top_vehicles.map((v) => (
                <button key={v.vehicle_id} onClick={() => setInvestigate({ type: "vehicle", vehicleId: v.vehicle_id, label: v.name })}
                  data-testid={`exec-top-vehicle-${v.vehicle_id}`} className="w-full text-left group">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="group-hover:text-primary transition-colors">{v.name}</span>
                    <span className="mono text-muted-foreground">{moneyFull(v.value)}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 overflow-hidden">
                    <div className="h-full bg-primary/60 group-hover:bg-primary transition-colors" style={{ width: `${(v.value / maxVehicleCost) * 100}%` }} />
                  </div>
                </button>
              ))}
              {data.top_vehicles.length === 0 && <div className="text-xs text-muted-foreground">No completed jobs yet.</div>}
            </div>
          </div>

          <div className="bg-[#121214] border border-border p-6 space-y-6">
            <div>
              <div className="overline mb-3">Cost by Region</div>
              <div className="space-y-2">
                {data.by_region.map((r) => (
                  <div key={r.region}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={r.region === "Ungrouped" ? "text-muted-foreground italic" : ""}>{r.region}</span>
                      <span className="mono text-muted-foreground">{moneyFull(r.value)}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 overflow-hidden">
                      <div className="h-full bg-[#3B82F6]/60" style={{ width: `${(r.value / maxRegionCost) * 100}%` }} />
                    </div>
                  </div>
                ))}
                {data.by_region.length === 0 && <div className="text-xs text-muted-foreground">No completed jobs yet.</div>}
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <div className="overline mb-3">Top Suppliers by Spend</div>
              <div className="space-y-2">
                {data.top_suppliers.map((s, i) => (
                  <div key={s.supplier} className="flex items-center gap-2 text-xs">
                    <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center mono text-[10px] shrink-0">{i + 1}</span>
                    <span className={`flex-1 ${s.supplier === "Unknown" ? "text-muted-foreground italic" : ""}`}>{s.supplier}</span>
                    <span className="mono text-muted-foreground">{moneyFull(s.value)}</span>
                  </div>
                ))}
                {data.top_suppliers.length === 0 && <div className="text-xs text-muted-foreground">No completed jobs yet.</div>}
              </div>
            </div>
          </div>
        </div>

        {/* AI Insights */}
        <div className="bg-[#121214] border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 overline"><Brain size={14} className="text-primary" /> AI Cost Intelligence Insights</div>
            <span className="border border-primary/40 bg-primary/10 text-primary px-2 py-1 text-[10px] uppercase tracking-widest">{data.insights.length} Insight{data.insights.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="exec-insights-grid">
            {data.insights.map((insight) => {
              const Icon = INSIGHT_ICON[insight.type] || Info;
              return (
                <div key={insight.id} className={`border p-4 ${INSIGHT_STYLE[insight.type] || INSIGHT_STYLE.info}`} data-testid={`exec-insight-${insight.id}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 font-semibold text-sm"><Icon size={16} /> {insight.title}</div>
                    <span className={`text-[10px] mono uppercase tracking-widest px-2 py-0.5 border shrink-0 ${PRIORITY_COLOR[insight.priority]}`}>{insight.priority}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{insight.message}</p>
                  <div className="mono text-xs font-bold text-primary mt-2">{insight.impact}</div>
                </div>
              );
            })}
            {data.insights.length === 0 && <div className="text-sm text-muted-foreground col-span-2 text-center py-6">No notable cost patterns detected yet — insights populate as more completed jobs accumulate.</div>}
          </div>
        </div>
      </div>

      <InvestigationHub root={investigate} groups={groups} onClose={() => setInvestigate(null)} />
    </div>
  );
}
