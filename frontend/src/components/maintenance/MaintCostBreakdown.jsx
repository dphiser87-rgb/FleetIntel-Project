import React from "react";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";

export default function MaintCostBreakdown({ job }) {
  const { currency } = useCurrency();
  const rows = [
    { label: "Labour", value: job.labor_cost || 0, color: "#3B82F6" },
    { label: "Parts", value: job.parts_cost || 0, color: "#14B8A6" },
    { label: "External", value: job.external_cost || 0, color: "#FFCC00" },
  ];
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;

  return (
    <div className="p-6 space-y-4" data-testid="maint-cost-breakdown">
      <div className="overline">{job.title} · cost breakdown</div>
      <div className="border border-border">
        <div className="flex h-3 w-full">
          {rows.map((r) => (
            <div key={r.label} style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />
          ))}
        </div>
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between px-4 py-3" data-testid={`cost-row-${r.label.toLowerCase()}`}>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
                {r.label}
              </div>
              <span className="mono text-sm">{formatMoneyFull(r.value, currency)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 bg-[#121214]">
            <span className="text-sm font-bold">Total Actual Cost</span>
            <span className="mono text-lg font-bold text-primary">{formatMoneyFull(job.actual_cost, currency)}</span>
          </div>
          {job.estimated_cost != null && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">Estimated cost</span>
              <span className="mono text-sm text-muted-foreground">{formatMoneyFull(job.estimated_cost, currency)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
