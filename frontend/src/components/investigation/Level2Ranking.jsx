import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend } from "recharts";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const isMoney = (k) => /cost|price|amount|spend|value/i.test(k);
const isPct = (k) => /pct|percent|rate/i.test(k);

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "12m", label: "Last 12 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "90d", label: "Last 90 days" },
  { value: "30d", label: "Last 30 days" },
];

export default function Level2Ranking({ kpiKey, initialGroupBy, groups, onDrillVehicle }) {
  const [groupBy, setGroupBy] = useState(initialGroupBy || "vehicle");
  const [period, setPeriod] = useState("all");
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    api.get("/vehicles").then((r) => setVehicles(r.data || [])).catch(() => {});
    api.get("/analytics/cost-trend").then((r) => setTrend(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!kpiKey) return;
    setData(null);
    api.get(`/investigate/${kpiKey}`, { params: { group_by: groupBy, period } })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Unable to load investigation"));
  }, [kpiKey, groupBy, period]);

  const vehicleByName = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.name, v])), [vehicles]);

  const rows = data ? [...data.rows].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") return sortDir === "desc" ? bv - av : av - bv;
    return sortDir === "desc" ? String(bv ?? "").localeCompare(String(av ?? "")) : String(av ?? "").localeCompare(String(bv ?? ""));
  }) : [];

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const fmtCell = (col, val) => {
    if (val == null || val === "") return <span className="text-muted-foreground">—</span>;
    if (col === "delta_pct") {
      const up = val > 0;
      return <span className={up ? "text-[#FF3B30]" : "text-[#34C759]"}>{up ? "+" : ""}{val}%</span>;
    }
    if (typeof val === "number" && isMoney(col)) return money(val);
    if (typeof val === "number" && isPct(col)) return `${val}%`;
    if (typeof val === "number") return val.toLocaleString();
    return String(val);
  };

  const barData = data ? [...data.rows].sort((a, b) => (b.value ?? b.cost ?? 0) - (a.value ?? a.cost ?? 0)).slice(0, 8) : [];

  return (
    <div className="p-6 space-y-6" data-testid="level2-ranking">
      <div>
        {data ? (
          <div className="mt-1">
            <span className="mono text-3xl text-primary font-bold">
              {isMoney(data.unit) || data.unit === "$" ? money(data.total) : `${data.total.toLocaleString()}${data.unit === "%" ? "%" : ""}`}
            </span>
            <span className="text-muted-foreground ml-2 text-sm">{data.unit !== "$" && data.unit !== "%" ? data.unit : ""} · {rows.length} rows</span>
          </div>
        ) : <div className="text-muted-foreground text-sm">Loading…</div>}
      </div>

      <div className="flex items-center gap-3 flex-wrap border border-border bg-[#121214] px-4 py-3" data-testid="level2-filters">
        <div className="flex items-center gap-2">
          <label className="overline">View by</label>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} data-testid="level2-viewby" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
            <option value="vehicle">Vehicle</option>
            <option value="group">Group</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="overline">Period</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="level2-period" className="bg-[#0b0b0d] border border-border px-2 py-1.5 text-xs uppercase tracking-widest focus:border-primary focus:outline-none">
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        {groups.length === 0 && groupBy === "group" && (
          <span className="text-xs text-muted-foreground">No vehicle groups yet — create one from the tile config panel.</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#121214] border border-border p-4">
          <div className="overline mb-2">Ranking</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="vehicle" stroke="#636366" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis stroke="#636366" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontSize: 12 }} />
              <Bar dataKey="value" fill="hsl(var(--chart-3))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#121214] border border-border p-4">
          <div className="overline mb-2">Fleet cost trend</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#636366" tick={{ fontSize: 10 }} />
              <YAxis stroke="#636366" tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="total" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left overline">
                {data.columns.map((c) => (
                  <th key={c} className="p-2 cursor-pointer hover:text-primary" onClick={() => toggleSort(c)}>
                    <span className="flex items-center gap-1">
                      {c.replace(/_/g, " ")}
                      {sortKey === c && (sortDir === "desc" ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const vehicle = groupBy === "vehicle" ? vehicleByName[r.vehicle] : null;
                const clickable = !!vehicle;
                return (
                  <tr
                    key={i}
                    className={`border-b border-border/50 ${clickable ? "hover:bg-primary/5 cursor-pointer" : "hover:bg-[#121214]"}`}
                    onClick={() => clickable && onDrillVehicle(vehicle)}
                    data-testid={`level2-row-${i}`}
                  >
                    {data.columns.map((c) => (
                      <td key={c} className={`p-2 ${isMoney(c) || typeof r[c] === "number" ? "mono" : ""}`}>{fmtCell(c, r[c])}</td>
                    ))}
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={data.columns.length} className="p-12 text-center text-muted-foreground">No underlying rows for this period.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
