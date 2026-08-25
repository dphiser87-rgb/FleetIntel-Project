import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CheckCircle, CalendarBlank, CaretRight } from "@phosphor-icons/react";
import { STATUS_COLOR, STATUS_LABEL, remainingLabel } from "./ScheduleAssetList";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// Feature 5 — one asset's maintenance history AND forecast on a single scrollable timeline: past
// completed jobs (blue-grey, per the color standard's Completed state) above a "Today" marker,
// forecasted future services (colored by due status, driven by the interval engine from Feature 2)
// below it.
export default function AssetMaintenanceTimeline({ kind, id, schedules, onDrillEvent }) {
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    api.get("/maintenance").then((r) => setJobs(r.data || []));
  }, []);

  if (jobs === null) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;

  const idField = kind === "vehicle" ? "vehicle_id" : "asset_id";
  const past = jobs
    .filter((j) => j[idField] === id && j.status === "completed")
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

  const forecast = [];
  for (const sched of schedules) {
    const asset = sched.assets.find((a) => a.kind === kind && a.id === id);
    if (asset && asset.next_due_date) forecast.push({ scheduleName: sched.name, ...asset });
  }
  forecast.sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date));

  return (
    <div className="p-6 space-y-6" data-testid="asset-maintenance-timeline">
      <div>
        <div className="overline mb-2 text-[#FFCC00]">Forecast · upcoming</div>
        <div className="space-y-2">
          {forecast.map((f, i) => (
            <div key={i} className="flex items-center gap-4 border border-border p-3" data-testid={`forecast-${i}`}>
              <CalendarBlank size={18} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{f.scheduleName}</div>
                <div className="text-xs text-muted-foreground">{new Date(f.next_due_date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</div>
              </div>
              <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border shrink-0 ${STATUS_COLOR[f.status]}`}>{STATUS_LABEL[f.status]}</span>
              <span className="mono text-xs text-muted-foreground w-32 text-right shrink-0">{remainingLabel(f)}</span>
            </div>
          ))}
          {forecast.length === 0 && <div className="text-sm text-muted-foreground">No scheduled maintenance configured for this asset.</div>}
        </div>
      </div>

      <div className="border-t border-border pt-2 text-center overline text-muted-foreground">Today</div>

      <div>
        <div className="overline mb-2">History · completed</div>
        <div className="space-y-2">
          {past.map((j) => (
            <button key={j.id} onClick={() => onDrillEvent(j)} data-testid={`history-${j.id}`}
              className="w-full flex items-center gap-4 border border-border p-3 text-left hover:bg-white/5 transition-colors">
              <CheckCircle size={18} className="text-muted-foreground shrink-0" weight="fill" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{j.title}</div>
                <div className="text-xs text-muted-foreground">{new Date(j.completed_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</div>
              </div>
              <span className="mono text-sm text-muted-foreground shrink-0">{money(j.actual_cost)}</span>
              <CaretRight size={14} className="text-muted-foreground shrink-0" />
            </button>
          ))}
          {past.length === 0 && <div className="text-sm text-muted-foreground">No completed maintenance on record yet.</div>}
        </div>
      </div>
    </div>
  );
}
