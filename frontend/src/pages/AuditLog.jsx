import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Truck, ClipboardText, Wrench, Package, UsersThree, CheckCircle, Warning, ClockCounterClockwise, UserCirclePlus, UserCheck, PencilSimple,
} from "@phosphor-icons/react";

const ACTION_MAP = {
  "vehicle.created": { icon: Truck, color: "text-[#34C759]", label: "Added vehicle" },
  "template.created": { icon: ClipboardText, color: "text-[#3B82F6]", label: "Saved checklist template" },
  "inspection.completed": { icon: ClipboardText, color: "text-[#FFCC00]", label: "Completed inspection" },
  "maintenance.created": { icon: Wrench, color: "text-[#FFCC00]", label: "Allocated maintenance job" },
  "maintenance.in_progress": { icon: PencilSimple, color: "text-[#3B82F6]", label: "Started maintenance" },
  "maintenance.completed": { icon: CheckCircle, color: "text-[#34C759]", label: "Completed maintenance" },
  "maintenance.cancelled": { icon: Warning, color: "text-primary", label: "Cancelled maintenance" },
  "part.adjusted": { icon: Package, color: "text-[#3B82F6]", label: "Adjusted part stock" },
  "invite.created": { icon: UserCirclePlus, color: "text-[#3B82F6]", label: "Sent invite" },
  "invite.accepted": { icon: UserCheck, color: "text-[#34C759]", label: "Joined workspace" },
};

const timeAgo = (iso) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
};

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}`;

const renderMeta = (action, meta = {}) => {
  if (action === "vehicle.created") return <><span className="mono text-primary">{meta.plate}</span> · {meta.name}</>;
  if (action === "template.created") return <>{meta.name}</>;
  if (action === "inspection.completed") return <>{meta.fail_count} failed item{meta.fail_count !== 1 && "s"}</>;
  if (action === "maintenance.created") return <>{meta.title} <span className="text-muted-foreground">· priority {meta.priority}</span></>;
  if (action === "maintenance.completed") return <>{meta.title} <span className="mono text-white">{money(meta.actual_cost)}</span></>;
  if (action === "maintenance.in_progress" || action === "maintenance.cancelled") return <>{meta.title}</>;
  if (action === "part.adjusted") return <>{meta.name} <span className={`mono ${meta.delta >= 0 ? "text-[#34C759]" : "text-primary"}`}>{meta.delta >= 0 ? "+" : ""}{meta.delta}</span> <span className="text-muted-foreground">→ {meta.new_stock} on hand</span></>;
  if (action === "invite.created") return <>{meta.email} <span className="text-muted-foreground">as {meta.role}</span></>;
  if (action === "invite.accepted") return <>{meta.email} <span className="text-muted-foreground">as {meta.role}</span></>;
  return null;
};

export default function AuditLog() {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/audit").then(r => setEvents(r.data)).finally(() => setLoading(false));
  }, []);

  const categories = [
    { key: "all", label: "All" },
    { key: "vehicle", label: "Vehicles" },
    { key: "template", label: "Checklists" },
    { key: "inspection", label: "Inspections" },
    { key: "maintenance", label: "Maintenance" },
    { key: "part", label: "Parts" },
    { key: "invite", label: "Team" },
  ];
  const filtered = filter === "all" ? events : events.filter(e => e.action.startsWith(filter));

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Compliance & traceability</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="audit-title">Activity log</h1>
        </div>
        <div className="mono text-xs text-muted-foreground">{events.length} events</div>
      </header>

      <div className="p-8 max-w-4xl">
        <div className="flex gap-2 flex-wrap mb-6" data-testid="audit-filters">
          {categories.map(c => (
            <button key={c.key} onClick={() => setFilter(c.key)} data-testid={`filter-${c.key}`}
              className={`px-3 py-1.5 text-xs uppercase tracking-widest border ${filter === c.key ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
              {c.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-sm text-muted-foreground py-8">Loading events…</div>}
        {!loading && filtered.length === 0 && (
          <div className="border border-dashed border-border p-12 text-center">
            <ClockCounterClockwise size={40} weight="thin" className="mx-auto text-muted-foreground mb-3" />
            <div className="text-sm text-muted-foreground">No events yet for this filter.</div>
          </div>
        )}

        <div className="space-y-0 border border-border bg-[#121214]">
          {filtered.map((e, i) => {
            const meta = ACTION_MAP[e.action] || { icon: ClockCounterClockwise, color: "text-muted-foreground", label: e.action };
            const Icon = meta.icon;
            return (
              <div key={e.id} className={`flex items-start gap-4 p-4 ${i !== filtered.length - 1 ? "border-b border-border/60" : ""}`} data-testid={`event-${e.action}`}>
                <div className={`w-10 h-10 shrink-0 bg-[#0b0b0d] border border-border flex items-center justify-center ${meta.color}`}>
                  <Icon size={18} weight="regular" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-white">{e.user_name}</span>
                    <span className="text-xs text-muted-foreground">{meta.label}</span>
                  </div>
                  <div className="text-sm mt-1">{renderMeta(e.action, e.meta)}</div>
                  <div className="overline mt-2">{timeAgo(e.at)} · <span className="mono normal-case tracking-normal">{e.user_email}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
