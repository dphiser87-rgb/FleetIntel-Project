import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  Wallet, Wrench, ClockCounterClockwise, GasPump, CurrencyDollar, TrendUp, Package,
  CaretLeft, CaretRight, Truck, Warning, ArrowRight,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoney } from "@/lib/currency";

// Preview of a reworked dashboard layout, at /dashboard-preview, kept alongside the live dashboard
// so the two can be compared on the same data before anything replaces anything. Same data sources
// as Dashboard.jsx; what changes is composition, borrowing four layout ideas from a reference
// design while keeping FleetIntel's own visual language (dark square cards, green, mono labels):
//
//   1. A right-hand rail with a month calendar and an upcoming-maintenance list, driven by the real
//      maintenance schedules -- the most useful of the four for a fleet operator.
//   2. Six-month bars inside stat tiles, so direction reads at a glance. Only on tiles with a genuine
//      monthly series behind them: /analytics/cost-trend is maintenance-only, so fuel and downtime
//      get no bars rather than an invented trend.
//   3. One tile visually promoted when the data says so: the maintenance tile lights up when the
//      anomaly detector has flagged a vehicle, instead of every tile carrying equal weight.
//   4. A featured card for the vehicle in worst health, with its photo when it has one.

const C = { red: "#FF3B30", gold: "#FFCC00", green: "#34C759", blue: "#3B82F6" };
const STATUS = {
  overdue: { label: "Overdue", color: C.red, rank: 0 },
  due_soon: { label: "Due soon", color: C.gold, rank: 1 },
  on_track: { label: "On track", color: C.green, rank: 2 },
};
const HEALTH = { at_risk: { label: "At risk", color: C.red }, watch: { label: "Watch", color: C.gold }, healthy: { label: "Healthy", color: C.green } };

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function MiniBars({ values, color }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px] h-9 mt-3" aria-hidden="true">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 min-h-[2px]"
          style={{
            height: `${Math.max(4, (v / max) * 100)}%`,
            background: i === values.length - 1 ? color : "#3f3f46",
          }}
        />
      ))}
    </div>
  );
}

function StatTile({ label, icon: Icon, value, sub, series, color, highlight }) {
  return (
    <div
      className="bg-[#121214] border border-border p-5 flex flex-col"
      style={highlight ? { borderColor: `${C.red}99`, background: `linear-gradient(180deg, ${C.red}14, #121214 70%)` } : undefined}
      data-testid={`preview-tile-${label}`}
    >
      {/* Wraps rather than truncates: with the rail taking width, four tiles a row left
          "TOTAL MONTHLY…" and "COST PER VEH…" -- a label you can't read isn't doing its job. */}
      <div className="flex items-start justify-between gap-2">
        <div className="overline leading-snug min-w-0">{label}</div>
        <Icon size={15} className="shrink-0" style={{ color: highlight ? C.red : color }} />
      </div>
      <div className="mono text-2xl font-bold mt-2" style={highlight ? { color: C.red } : undefined}>{value}</div>
      {series && series.length > 1 && <MiniBars values={series} color={highlight ? C.red : color} />}
      <div className="text-xs mt-auto pt-3" style={{ color: highlight ? C.red : undefined }}>
        <span className={highlight ? "" : "text-muted-foreground"}>{sub}</span>
      </div>
    </div>
  );
}

function FeaturedVehicle({ item, vehicle }) {
  const h = HEALTH[item.status] || HEALTH.watch;
  const factors = [...(item.factors || [])].sort((a, b) => a.impact - b.impact).slice(0, 3);
  // Most vehicles have no photo, and reserving half the card for a placeholder just squeezes the
  // part that carries information. The photo column only exists when there's a photo to put in it.
  const hasPhoto = !!vehicle?.image_url;
  return (
    <div
      className={`bg-[#121214] border border-border overflow-hidden ${hasPhoto ? "grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : ""}`}
      data-testid="preview-featured-vehicle"
    >
      <div className="p-5 flex flex-col h-full">
        <div className="flex items-center justify-between">
          <div className="overline">Needs attention</div>
          {!hasPhoto && <Truck size={18} className="text-muted-foreground" />}
        </div>
        <div className="font-display font-black text-2xl tracking-tight mt-2">{item.name}</div>
        <div className="mono text-xs text-muted-foreground">{item.plate}</div>
        <div className="flex items-baseline gap-3 mt-4">
          <span className="mono text-4xl font-bold" style={{ color: h.color }}>{item.score}</span>
          <span className="text-[10px] mono uppercase tracking-widest px-2 py-1 border" style={{ color: h.color, borderColor: h.color }}>{h.label}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">Health score out of 100</div>
        {factors.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {factors.map((f) => (
              <li key={f.key + f.label} className="flex items-start justify-between gap-3 text-xs">
                <span>{f.label}</span>
                <span className="mono shrink-0" style={{ color: C.red }}>{f.impact}</span>
              </li>
            ))}
          </ul>
        )}
        <Link to={`/fleet/${item.vehicle_id}`} className="overline mt-auto pt-4 inline-flex items-center gap-1 text-primary hover:underline">
          Open vehicle <ArrowRight size={11} />
        </Link>
      </div>
      {hasPhoto && (
        <div className="relative min-h-[180px] bg-[#0b0b0d] border-t sm:border-t-0 sm:border-l border-border">
          <img src={vehicle.image_url} alt={item.name} className="absolute inset-0 w-full h-full object-cover" />
        </div>
      )}
    </div>
  );
}

const Pending = ({ children }) => (
  <div className="text-xs text-muted-foreground animate-pulse">{children}</div>
);

function MonthCalendar({ month, setMonth, dueByDay }) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const today = dayKey(new Date());
  return (
    <div className="bg-[#121214] border border-border p-4" data-testid="preview-calendar">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</div>
        <div className="flex gap-1">
          <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="p-1 border border-border hover:border-primary"><CaretLeft size={12} /></button>
          <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="p-1 border border-border hover:border-primary"><CaretRight size={12} /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="text-[10px] mono text-muted-foreground pb-1">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const k = dayKey(d);
          const due = dueByDay[k];
          const isToday = k === today;
          return (
            <div
              key={k}
              title={due ? `${due.count} item(s) due — ${STATUS[due.status].label}` : undefined}
              className="relative h-8 flex items-center justify-center text-xs mono"
              style={{
                background: due ? `${STATUS[due.status].color}26` : undefined,
                color: due ? STATUS[due.status].color : undefined,
                outline: isToday ? "1px solid hsl(var(--primary))" : undefined,
              }}
            >
              {d.getDate()}
              {due && due.count > 1 && <span className="absolute top-0.5 right-1 text-[8px]">{due.count}</span>}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-3 text-[10px] mono uppercase tracking-widest text-muted-foreground">
        {Object.values(STATUS).map((s) => (
          <span key={s.label} className="flex items-center gap-1"><span className="w-2 h-2" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
    </div>
  );
}

function ScheduledList({ items, canSee, loading }) {
  return (
    <div className="bg-[#121214] border border-border" data-testid="preview-scheduled">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="overline">Scheduled</div>
        <Link to="/maintenance-schedules" className="overline text-primary hover:underline">View all</Link>
      </div>
      {!canSee ? (
        <div className="px-4 pb-4 text-xs text-muted-foreground">Your profile doesn't include maintenance schedules.</div>
      ) : loading ? (
        // Distinct from the empty state on purpose: this endpoint is slow (one query per schedule
        // and asset), and "nothing scheduled" shown while it loads reads as a false fact.
        <div className="px-4 pb-4"><Pending>Loading upcoming maintenance…</Pending></div>
      ) : items.length === 0 ? (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          Nothing scheduled with a due date yet. <Link to="/maintenance-schedules" className="text-primary hover:underline">Create a schedule</Link>
        </div>
      ) : (
        <ul>
          {items.map((it) => {
            const s = STATUS[it.status] || STATUS.on_track;
            // Spelled out, and the chip below isn't uppercased: in the mono face an uppercase "D"
            // is indistinguishable from "0", so "25D" read as "250" in testing.
            const plural = (n) => `${n} day${n === 1 ? "" : "s"}`;
            const when = it.remaining_days == null ? shortDate(it.date)
              : it.remaining_days < 0 ? `${plural(-it.remaining_days)} overdue`
              : it.remaining_days === 0 ? "Due today" : `in ${plural(it.remaining_days)}`;
            return (
              <li key={it.key} className="flex items-center gap-3 px-4 py-3 border-t border-border">
                <div className="w-10 shrink-0 text-center">
                  <div className="mono text-sm font-bold leading-none">{new Date(`${it.date}T00:00:00`).getDate()}</div>
                  <div className="text-[9px] mono uppercase text-muted-foreground mt-0.5">
                    {new Date(`${it.date}T00:00:00`).toLocaleDateString(undefined, { month: "short" })}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{it.schedule}</div>
                  <div className="text-xs text-muted-foreground truncate">{it.target}</div>
                </div>
                <span className="text-[11px] mono px-1.5 py-0.5 border shrink-0 whitespace-nowrap" style={{ color: s.color, borderColor: s.color }}>
                  {when}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function DashboardPreview() {
  const { currency } = useCurrency();
  // null = still loading, distinct from an empty result -- an empty state shown before data arrives
  // states something false ("nothing scheduled", "R0").
  const [kpi, setKpi] = useState(null);
  const [trend, setTrend] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [health, setHealth] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [schedules, setSchedules] = useState(null);
  const [canSeeSchedules, setCanSeeSchedules] = useState(true);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  useEffect(() => {
    api.get("/analytics/kpi").then((r) => setKpi(r.data)).catch(() => setKpi({}));
    api.get("/analytics/cost-trend").then((r) => setTrend(r.data || [])).catch(() => setTrend([]));
    api.get("/analytics/anomalies").then((r) => setAnomalies(r.data || [])).catch(() => {});
    api.get("/analytics/fleet-health").then((r) => setHealth(r.data || [])).catch(() => setHealth([]));
    api.get("/vehicles").then((r) => setVehicles(r.data || [])).catch(() => {});
    api.get("/maintenance-schedules")
      .then((r) => setSchedules(r.data || []))
      // Gated on the maintenance module; a narrower profile gets an explanation, not a blank rail.
      .catch((e) => { if (e.response?.status === 403) setCanSeeSchedules(false); setSchedules([]); });
  }, []);

  const last6 = (trend || []).slice(-6);
  const money = (v) => (kpi == null ? "—" : formatMoney(v || 0, currency));
  const spike = anomalies[0];

  const tiles = [
    { label: "Total monthly cost", icon: Wallet, color: C.gold, value: money(kpi?.total_monthly_cost), sub: "This calendar month" },
    { label: "Total fleet cost", icon: Wallet, color: C.gold, value: money(kpi?.total_fleet_cost), sub: "Maintenance + fuel + downtime" },
    {
      label: "Maintenance cost", icon: Wrench, color: C.gold, value: money(kpi?.total_maintenance_cost),
      series: last6.map((m) => m.total),
      highlight: !!spike,
      sub: spike ? `${spike.vehicle} +${spike.delta_pct}% above its usual month` : "Last 6 months, completed jobs",
    },
    { label: "Spare parts", icon: Package, color: C.gold, value: money(kpi?.total_parts_cost), series: last6.map((m) => m.parts), sub: "Last 6 months, parts on completed jobs" },
    { label: "Cost per vehicle", icon: CurrencyDollar, color: C.gold, value: money(kpi?.cost_per_vehicle), sub: "Lifetime average" },
    { label: "Downtime cost", icon: ClockCounterClockwise, color: C.blue, value: money(kpi?.total_downtime_cost), sub: kpi == null ? "Hours across the fleet" : `${kpi.total_downtime_hours ?? 0}h across the fleet` },
    { label: "Fuel cost", icon: GasPump, color: C.gold, value: money(kpi?.total_fuel_cost), sub: "Logged fuel transactions" },
    { label: "Fleet utilization", icon: TrendUp, color: C.green, value: kpi == null ? "—" : `${kpi.utilization_pct ?? 0}%`, sub: kpi == null ? "Vehicles active" : `${kpi.active ?? 0} of ${kpi.total_vehicles ?? 0} active` },
  ];

  const worst = health?.[0];
  const worstVehicle = worst ? vehicles.find((v) => String(v.id) === String(worst.vehicle_id)) : null;

  const upcoming = useMemo(() => {
    const out = [];
    for (const s of schedules || []) {
      for (const a of s.assets || []) {
        if (!a.next_due_date || !STATUS[a.status]) continue;
        out.push({ key: `${s.id}-${a.id}`, schedule: s.name, target: a.name, date: a.next_due_date, status: a.status, remaining_days: a.remaining_days });
      }
    }
    return out.sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank || a.date.localeCompare(b.date));
  }, [schedules]);

  const dueByDay = useMemo(() => {
    const m = {};
    for (const it of upcoming) {
      const cur = m[it.date];
      if (!cur) m[it.date] = { count: 1, status: it.status };
      else {
        cur.count += 1;
        if (STATUS[it.status].rank < STATUS[cur.status].rank) cur.status = it.status;
      }
    }
    return m;
  }, [upcoming]);

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Command center · Layout preview</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="preview-title">Fleet Operations</h1>
        </div>
        <Link to="/" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
          Compare with current dashboard <ArrowRight size={12} />
        </Link>
      </header>

      {kpi?.cost_anomalies > 0 && spike && (
        <div className="mx-8 mt-6 flex items-center gap-3 border px-4 py-3 text-sm" style={{ borderColor: `${C.red}80`, background: `${C.red}10` }}>
          <Warning size={16} style={{ color: C.red }} />
          <span>
            <strong>{spike.vehicle}</strong> spent {money(spike.spend)} in {spike.month}, {spike.delta_pct}% above its average of {money(spike.mean)}.
          </span>
        </div>
      )}

      <div className="p-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <main className="space-y-6 min-w-0">
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {tiles.map((t) => <StatTile key={t.label} {...t} />)}
          </section>

          <section className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6">
            {health == null ? (
              <div className="bg-[#121214] border border-border p-5"><Pending>Scoring vehicle health…</Pending></div>
            ) : worst ? <FeaturedVehicle item={worst} vehicle={worstVehicle} /> : (
              <div className="bg-[#121214] border border-border p-5 text-sm text-muted-foreground">No vehicles scored yet.</div>
            )}
            <div className="bg-[#121214] border border-border p-5" data-testid="preview-cost-chart">
              <div className="flex items-center justify-between">
                <div className="overline">Maintenance spend by month</div>
                <div className="flex gap-3 text-[10px] mono uppercase tracking-widest text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2" style={{ background: C.gold }} />Parts</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2" style={{ background: C.blue }} />Labour</span>
                </div>
              </div>
              <div style={{ height: 220 }} className="mt-4">
                {trend == null ? (
                  <div className="h-full flex items-center justify-center"><Pending>Loading spend…</Pending></div>
                ) : trend.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No completed maintenance yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend.slice(-12)} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                      <CartesianGrid stroke="#27272a" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => formatMoney(v, currency)} />
                      <Tooltip
                        cursor={{ fill: "#ffffff08" }}
                        contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", borderRadius: 0, fontSize: 12 }}
                        formatter={(v, n) => [money(v), n === "parts" ? "Parts" : "Labour"]}
                      />
                      <Bar dataKey="parts" stackId="a" fill={C.gold} />
                      <Bar dataKey="labor" stackId="a" fill={C.blue} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </section>
        </main>

        <aside className="space-y-6 min-w-0" data-testid="preview-rail">
          <MonthCalendar month={month} setMonth={setMonth} dueByDay={dueByDay} />
          <ScheduledList items={upcoming.slice(0, 6)} canSee={canSeeSchedules} loading={schedules == null} />
        </aside>
      </div>
    </div>
  );
}
