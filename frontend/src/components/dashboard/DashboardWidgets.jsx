import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { CaretLeft, CaretRight, Truck, ArrowRight } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/currency";

// Building blocks for the dashboard's schedule rail, featured vehicle and spend chart. First built
// and approved on a standalone preview page, then folded into Dashboard.jsx.

export const C = { red: "#FF3B30", gold: "#FFCC00", green: "#34C759", blue: "#3B82F6" };

export const SCHEDULE_STATUS = {
  overdue: { label: "Overdue", color: C.red, rank: 0 },
  due_soon: { label: "Due soon", color: C.gold, rank: 1 },
  on_track: { label: "On track", color: C.green, rank: 2 },
};

const HEALTH = {
  at_risk: { label: "At risk", color: C.red },
  watch: { label: "Watch", color: C.gold },
  healthy: { label: "Healthy", color: C.green },
};

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const asDate = (iso) => new Date(`${iso}T00:00:00`);

export const Pending = ({ children }) => (
  <div className="text-xs text-muted-foreground animate-pulse">{children}</div>
);

/** Last value in the tile's accent colour, earlier ones muted, so the latest month reads first. */
export function MiniBars({ values, color }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px] h-9 mt-3" aria-hidden="true" data-testid="minibars">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 min-h-[2px]"
          style={{ height: `${Math.max(4, (v / max) * 100)}%`, background: i === values.length - 1 ? color : "#3f3f46" }}
        />
      ))}
    </div>
  );
}

/** Schedule assets with a due date, most urgent first. `schedules` null means still loading. */
export function useUpcoming(schedules) {
  return useMemo(() => {
    const out = [];
    for (const s of schedules || []) {
      for (const a of s.assets || []) {
        if (!a.next_due_date || !SCHEDULE_STATUS[a.status]) continue;
        out.push({ key: `${s.id}-${a.id}`, schedule: s.name, target: a.name, date: a.next_due_date,
                   status: a.status, remaining_days: a.remaining_days });
      }
    }
    return out.sort((a, b) => SCHEDULE_STATUS[a.status].rank - SCHEDULE_STATUS[b.status].rank || a.date.localeCompare(b.date));
  }, [schedules]);
}

export function FeaturedVehicle({ item, vehicle }) {
  const h = HEALTH[item.status] || HEALTH.watch;
  const factors = [...(item.factors || [])].sort((a, b) => a.impact - b.impact).slice(0, 3);
  // Most vehicles have no photo; the photo column only exists when there's a photo to put in it,
  // rather than squeezing the part that carries information next to a placeholder.
  const hasPhoto = !!vehicle?.image_url;
  return (
    <div
      className={`bg-[#121214] border border-border overflow-hidden ${hasPhoto ? "grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : ""}`}
      data-testid="featured-vehicle"
    >
      <div className="p-6 flex flex-col h-full">
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

export function MaintenanceSpendChart({ trend, currency }) {
  return (
    <div className="bg-[#121214] border border-border p-6" data-testid="chart-cost-trend">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="overline">Maintenance spend by month</div>
        <div className="flex gap-3 text-[10px] mono uppercase tracking-widest text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2 h-2" style={{ background: C.gold }} />Parts</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2" style={{ background: C.blue }} />Labour</span>
        </div>
      </div>
      <div style={{ height: 240 }} className="mt-4">
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
                formatter={(v, n) => [formatMoney(v, currency), n === "parts" ? "Parts" : "Labour"]}
              />
              <Bar dataKey="parts" stackId="a" fill={C.gold} />
              <Bar dataKey="labor" stackId="a" fill={C.blue} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function MonthCalendar({ month, setMonth, upcoming }) {
  const dueByDay = useMemo(() => {
    const m = {};
    for (const it of upcoming) {
      const cur = m[it.date];
      if (!cur) m[it.date] = { count: 1, status: it.status };
      else {
        cur.count += 1;
        if (SCHEDULE_STATUS[it.status].rank < SCHEDULE_STATUS[cur.status].rank) cur.status = it.status;
      }
    }
    return m;
  }, [upcoming]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const today = dayKey(new Date());

  return (
    <div className="bg-[#121214] border border-border p-4" data-testid="schedule-calendar">
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
          return (
            <div
              key={k}
              title={due ? `${due.count} item(s) due — ${SCHEDULE_STATUS[due.status].label}` : undefined}
              className="relative h-8 flex items-center justify-center text-xs mono"
              style={{
                background: due ? `${SCHEDULE_STATUS[due.status].color}26` : undefined,
                color: due ? SCHEDULE_STATUS[due.status].color : undefined,
                outline: k === today ? "1px solid hsl(var(--primary))" : undefined,
              }}
            >
              {d.getDate()}
              {due && due.count > 1 && <span className="absolute top-0.5 right-1 text-[8px]">{due.count}</span>}
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-3 text-[10px] mono uppercase tracking-widest text-muted-foreground flex-wrap">
        {Object.values(SCHEDULE_STATUS).map((s) => (
          <span key={s.label} className="flex items-center gap-1"><span className="w-2 h-2" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
    </div>
  );
}

export function ScheduledList({ items, canSee, loading }) {
  return (
    <div className="bg-[#121214] border border-border" data-testid="schedule-list">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="overline">Scheduled</div>
        <Link to="/maintenance-schedules" className="overline text-primary hover:underline">View all</Link>
      </div>
      {!canSee ? (
        <div className="px-4 pb-4 text-xs text-muted-foreground">Your profile doesn't include maintenance schedules.</div>
      ) : loading ? (
        // Distinct from the empty state: "nothing scheduled" shown while loading reads as a false fact.
        <div className="px-4 pb-4"><Pending>Loading upcoming maintenance…</Pending></div>
      ) : items.length === 0 ? (
        <div className="px-4 pb-4 text-xs text-muted-foreground">
          Nothing scheduled with a due date yet. <Link to="/maintenance-schedules" className="text-primary hover:underline">Create a schedule</Link>
        </div>
      ) : (
        <ul>
          {items.map((it) => {
            const s = SCHEDULE_STATUS[it.status] || SCHEDULE_STATUS.on_track;
            // Spelled out and not uppercased: in the mono face an uppercase "D" is indistinguishable
            // from "0", so "25D" read as "250".
            const plural = (n) => `${n} day${n === 1 ? "" : "s"}`;
            const when = it.remaining_days == null ? asDate(it.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })
              : it.remaining_days < 0 ? `${plural(-it.remaining_days)} overdue`
              : it.remaining_days === 0 ? "Due today" : `in ${plural(it.remaining_days)}`;
            return (
              <li key={it.key} className="flex items-center gap-3 px-4 py-3 border-t border-border">
                <div className="w-10 shrink-0 text-center">
                  <div className="mono text-sm font-bold leading-none">{asDate(it.date).getDate()}</div>
                  <div className="text-[9px] mono uppercase text-muted-foreground mt-0.5">
                    {asDate(it.date).toLocaleDateString(undefined, { month: "short" })}
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
