import React from "react";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";

const CATEGORY_LABEL = { maintenance: "Service & repair history", fuel: "Fuel purchases", downtime: "Downtime-linked jobs" };

export default function LevelCostBreakdown({ category, maintenance, fuelLogs, onDrillTransaction }) {
  const { currency } = useCurrency();
  const isFuel = category === "fuel";
  const rows = isFuel
    ? fuelLogs
    : category === "downtime"
      ? maintenance.filter((m) => (m.downtime_hours || 0) > 0)
      : maintenance;

  return (
    <div className="p-6 space-y-4" data-testid="level-cost-breakdown">
      <div className="overline">{CATEGORY_LABEL[category] || "Cost breakdown"}</div>
      <div className="overflow-x-auto border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-left overline">
              <th className="p-2">{isFuel ? "Date" : "Job"}</th>
              {!isFuel && <th className="p-2">Status</th>}
              {!isFuel && <th className="p-2">Parts</th>}
              {!isFuel && <th className="p-2">Labour</th>}
              <th className="p-2">{isFuel ? "Litres" : "Downtime"}</th>
              <th className="p-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-primary/5 cursor-pointer"
                onClick={() => onDrillTransaction(isFuel ? { type: "fuel", meta: { id: r.id }, title: `Fuel · ${(r.occurred_at || "").slice(0, 10)}` } : { type: "maintenance", meta: { id: r.id }, title: r.title })}
                data-testid={`cost-breakdown-row-${r.id}`}
              >
                <td className="p-2">{isFuel ? (r.occurred_at || "").slice(0, 10) : r.title}</td>
                {!isFuel && <td className="p-2 text-xs uppercase text-muted-foreground">{r.status}</td>}
                {!isFuel && <td className="p-2 mono">{formatMoneyFull(r.parts_cost, currency)}</td>}
                {!isFuel && <td className="p-2 mono">{formatMoneyFull(r.labor_cost, currency)}</td>}
                <td className="p-2 mono">{isFuel ? `${r.litres} L` : `${r.downtime_hours || 0} h`}</td>
                <td className="p-2 mono">{formatMoneyFull(isFuel ? r.cost : (r.actual_cost || r.estimated_cost), currency)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={isFuel ? 3 : 5} className="p-8 text-center text-muted-foreground">No records in this category.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
