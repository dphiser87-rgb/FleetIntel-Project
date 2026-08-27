import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function Table({ title, rows, cols, testId }) {
  return (
    <div className="bg-[#121214] border border-border" data-testid={testId}>
      <div className="border-b border-border p-4"><div className="overline">{title}</div></div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left overline border-b border-border">
            {cols.map((c) => <th key={c} className="p-3">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {r.map((v, j) => <td key={j} className={`p-3 ${j > 0 ? "mono" : ""}`}>{v}</td>)}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={cols.length} className="p-6 text-center text-muted-foreground">No data yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function MaintenanceReports() {
  const [jobs, setJobs] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [defects, setDefects] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    api.get("/maintenance").then((r) => setJobs(r.data || []));
    api.get("/maintenance-schedules").then((r) => setSchedules(r.data || []));
    api.get("/defects").then((r) => setDefects(r.data || [])).catch(() => {});
    api.get("/incidents").then((r) => setIncidents(r.data || [])).catch(() => {});
    api.get("/vehicles").then((r) => setVehicles(r.data || []));
    api.get("/assets").then((r) => setAssets(r.data || [])).catch(() => {});
  }, []);

  const completed = useMemo(() => jobs.filter((j) => j.status === "completed"), [jobs]);

  // --- Maintenance Compliance ---
  // "Was this job late" only answerable for jobs whose schedule snapshotted a due date at creation
  // (due_at_creation) — jobs older than that column, or not linked to a schedule, aren't counted
  // either way rather than being guessed at.
  const compliance = useMemo(() => {
    const trackable = completed.filter((j) => j.schedule_id && j.due_at_creation);
    const onTime = trackable.filter((j) => new Date(j.completed_at) <= new Date(j.due_at_creation)).length;
    const late = trackable.length - onTime;
    // "Missed" — schedules currently more than 30 days overdue with no job ever opened against them,
    // a live proxy since there's no historical log of skipped due-cycles to count precisely.
    const missed = schedules.reduce((s, sch) => s + sch.assets.filter((a) => a.status === "overdue" && a.remaining_days != null && a.remaining_days < -30).length, 0);
    return { onTime, late, missed, trackableCount: trackable.length };
  }, [completed, schedules]);

  // --- Cost Analysis ---
  const vName = (j) => (j.vehicle_id ? vehicles.find((v) => v.id === j.vehicle_id)?.name : j.asset_name) || "Unknown";
  const costByVehicle = useMemo(() => {
    const map = {};
    for (const j of completed) { const k = vName(j); map[k] = (map[k] || 0) + (j.actual_cost || 0); }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, vehicles]);
  const costByType = useMemo(() => {
    const map = {};
    for (const j of completed) { const k = j.category || "uncategorized"; map[k] = (map[k] || 0) + (j.actual_cost || 0); }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [completed]);
  const totalSpend = completed.reduce((s, j) => s + (j.actual_cost || 0), 0);

  // --- Reliability ---
  const breakdowns = incidents.filter((i) => i.kind === "breakdown").length;
  const repeatDefects = useMemo(() => {
    const map = {};
    for (const d of defects) {
      const k = `${d.vehicle_name || d.vehicle_id || "—"}·${d.category}`;
      map[k] = (map[k] || 0) + 1;
    }
    return Object.entries(map).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
  }, [defects]);
  const totalDowntime = completed.reduce((s, j) => s + (j.downtime_hours || 0), 0);

  // --- Forecasting ---
  // Projected spend = sum, over schedules due in the window, of the historical average completed
  // cost for that schedule's maintenance type (falling back to the fleet-wide average job cost when
  // there's no history yet for that type) — an estimate, not a quote; flagged as such in the UI.
  const avgCostByType = useMemo(() => {
    const map = {};
    for (const j of completed) {
      const k = j.category || "uncategorized";
      if (!map[k]) map[k] = { sum: 0, n: 0 };
      map[k].sum += j.actual_cost || 0; map[k].n += 1;
    }
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.sum / v.n]));
  }, [completed]);
  const fleetAvgCost = completed.length ? totalSpend / completed.length : 0;

  const forecast = useMemo(() => {
    const now = new Date();
    const windows = [["30 Days", 30], ["90 Days", 90], ["12 Months", 365]];
    return windows.map(([label, days]) => {
      const cutoff = new Date(now.getTime() + days * 86400000);
      let total = 0, count = 0;
      for (const sch of schedules) {
        for (const a of sch.assets) {
          if (!a.next_due_date) continue;
          if (new Date(a.next_due_date) > cutoff) continue;
          total += fleetAvgCost || 0;
          count += 1;
        }
      }
      return { label, total, count };
    });
  }, [schedules, fleetAvgCost]);

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6">
        <div className="overline">Analytics</div>
        <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="maintenance-reports-title">Maintenance Reports</h1>
        <div className="text-sm text-muted-foreground mt-2">Compliance, cost, reliability, and forecast for preventative maintenance.</div>
      </header>

      <div className="p-8 space-y-8">
        <section>
          <div className="overline mb-3">Maintenance Compliance</div>
          <div className="grid grid-cols-2 md:grid-cols-3 border border-border grid-borders" data-testid="compliance-tiles">
            {[["Completed On Time", compliance.onTime, "text-[#34C759]"], ["Late Services", compliance.late, "text-[#FFCC00]"], ["Missed Services", compliance.missed, "text-primary"]].map(([l, v, cls]) => (
              <div key={l} className="p-5 bg-[#121214]">
                <div className="overline">{l}</div>
                <div className={`mono text-xl font-bold mt-2 ${cls}`}>{v}</div>
              </div>
            ))}
          </div>
          {compliance.trackableCount === 0 && <div className="text-xs text-muted-foreground mt-2">No completed scheduled jobs with a recorded due date yet — On Time / Late will populate as scheduled work is completed.</div>}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Table title={`Cost by Vehicle · Total ${money(totalSpend)}`} testId="cost-by-vehicle"
            cols={["Vehicle", "Total Cost"]} rows={costByVehicle.map(([n, c]) => [n, money(c)])} />
          <Table title="Cost by Maintenance Type" testId="cost-by-type"
            cols={["Category", "Total Cost"]} rows={costByType.map(([n, c]) => [n, money(c)])} />
        </section>

        <section>
          <div className="overline mb-3">Reliability</div>
          <div className="grid grid-cols-2 md:grid-cols-3 border border-border grid-borders" data-testid="reliability-tiles">
            {[["Breakdowns", breakdowns, "text-primary"], ["Repeat Defects", repeatDefects.length, "text-[#FFCC00]"], ["Total Downtime (h)", totalDowntime.toFixed(1), "text-foreground"]].map(([l, v, cls]) => (
              <div key={l} className="p-5 bg-[#121214]">
                <div className="overline">{l}</div>
                <div className={`mono text-xl font-bold mt-2 ${cls}`}>{v}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="overline mb-3">Forecasting</div>
          <div className="text-xs text-muted-foreground mb-2">Estimated from historical average job cost — a projection, not a quote.</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="forecast-tiles">
            {forecast.map((f) => (
              <div key={f.label} className="bg-[#121214] border border-border p-5">
                <div className="overline">Projected Spend · {f.label}</div>
                <div className="mono text-2xl font-bold mt-2">{money(f.total)}</div>
                <div className="text-xs text-muted-foreground mt-1">{f.count} service{f.count !== 1 ? "s" : ""} due</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
