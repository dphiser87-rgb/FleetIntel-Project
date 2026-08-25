import React, { useMemo } from "react";
import { Truck, Stack, CaretRight } from "@phosphor-icons/react";

// Red/Amber/Green/Blue-Grey — same tokens already used elsewhere in the app (Fleet.jsx's
// StatusBadge/HealthPill: #34C759 green, #FFCC00 amber, `primary` as the danger/critical color).
export const STATUS_COLOR = {
  overdue: "border-primary text-primary bg-primary/10",
  due_soon: "border-[#FFCC00] text-[#FFCC00] bg-[#FFCC00]/10",
  on_track: "border-[#34C759] text-[#34C759] bg-[#34C759]/10",
  awaiting_telematics: "border-muted-foreground text-muted-foreground bg-white/5",
};
export const STATUS_LABEL = {
  overdue: "Overdue", due_soon: "Due soon", on_track: "On track", awaiting_telematics: "Awaiting telematics",
};
// Action-first ordering (Non-Negotiable UX Principle #2): Overdue, then closest to due, then furthest out.
const STATUS_RANK = { overdue: 0, due_soon: 1, on_track: 2, awaiting_telematics: 3 };

export function remainingLabel(a) {
  if (a.remaining_days == null) return "—";
  if (a.remaining_days < 0) return `+${Math.abs(a.remaining_days)}d overdue`;
  return `${a.remaining_days}d remaining`;
}

export function flattenAssets(schedules, { filter, scheduleId } = {}) {
  const rows = [];
  for (const sched of schedules) {
    if (scheduleId && sched.id !== scheduleId) continue;
    for (const a of sched.assets) {
      if (filter === "overdue" && a.status !== "overdue") continue;
      if (filter === "due_week" && !(a.status === "due_soon" && a.remaining_days != null && a.remaining_days <= 7)) continue;
      if (filter === "due_month" && !(a.remaining_days != null && a.remaining_days > 7 && a.remaining_days <= 30)) continue;
      if (filter === "upcoming" && !(a.status === "on_track" && a.remaining_days != null && a.remaining_days > 30)) continue;
      rows.push({ ...a, scheduleId: sched.id, scheduleName: sched.name });
    }
  }
  return rows.sort((x, y) => STATUS_RANK[x.status] - STATUS_RANK[y.status] || (x.remaining_days ?? 999) - (y.remaining_days ?? 999));
}

export default function ScheduleAssetList({ schedules, filter, scheduleId, onDrillAsset }) {
  const rows = useMemo(() => flattenAssets(schedules, { filter, scheduleId }), [schedules, filter, scheduleId]);

  return (
    <div className="p-6" data-testid="schedule-asset-list">
      <div className="divide-y divide-border border border-border">
        {rows.map((a) => (
          <button key={`${a.kind}-${a.id}-${a.scheduleId}`} onClick={() => onDrillAsset(a)} data-testid={`asset-row-${a.id}`}
            className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-white/5 transition-colors">
            {a.kind === "vehicle" ? <Truck size={18} className="text-muted-foreground shrink-0" /> : <Stack size={18} className="text-muted-foreground shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{a.name}</div>
              <div className="text-xs text-muted-foreground truncate">{a.scheduleName}</div>
            </div>
            <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border shrink-0 ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</span>
            <span className="mono text-xs text-muted-foreground w-32 text-right shrink-0">{remainingLabel(a)}</span>
            <CaretRight size={14} className="text-muted-foreground shrink-0" />
          </button>
        ))}
        {rows.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No assets match this view.</div>}
      </div>
    </div>
  );
}
