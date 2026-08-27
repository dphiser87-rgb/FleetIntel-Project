import React from "react";
import { CurrencyDollar, FileText } from "@phosphor-icons/react";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// Feature 4's "Maintenance Details Panel" step — the completed-work view of Feature 6's fields
// (Basic Info, Meter Reading, Documentation), with a "Cost" click drilling one level deeper into
// the Cost Breakdown panel per the spec's exact chain.
export default function MaintEventDetail({ job, vehicles, assets, onDrillCost }) {
  const vehicle = job.vehicle_id ? vehicles.find((v) => v.id === job.vehicle_id) : null;
  const asset = job.asset_id ? assets.find((a) => a.id === job.asset_id) : null;

  return (
    <div className="p-6 space-y-6" data-testid="maint-event-detail">
      <div className="border border-border bg-[#121214] p-4">
        <div className="overline">{vehicle?.name || asset?.name}</div>
        <h3 className="font-display text-2xl font-bold mt-1">{job.title}</h3>
        {job.description && <p className="text-sm text-muted-foreground mt-2">{job.description}</p>}
      </div>

      <div>
        <div className="overline mb-2">Basic Information</div>
        <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders">
          {[
            ["Completion Date", job.completed_at ? new Date(job.completed_at).toLocaleDateString() : "—"],
            ["Workshop", job.workshop_name || "—"],
            ["Technician", job.technician || "—"],
            ["Vendor", job.vendor || "—"],
          ].map(([l, v]) => (
            <div key={l} className="p-4 bg-[#121214]">
              <div className="overline">{l}</div>
              <div className="text-sm font-semibold mt-2">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="overline mb-2">Meter Reading</div>
        <div className="grid grid-cols-2 border border-border grid-borders">
          {[["Odometer", job.odometer ? `${Number(job.odometer).toLocaleString()} km` : "—"],
            ["Engine Hours", job.engine_hours != null ? `${job.engine_hours} h` : "—"]].map(([l, v]) => (
            <div key={l} className="p-4 bg-[#121214]">
              <div className="overline">{l}</div>
              <div className="text-sm font-semibold mt-2">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <button onClick={() => onDrillCost(job)} data-testid="drill-cost-btn"
        className="w-full flex items-center justify-between border border-primary/40 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors">
        <span className="flex items-center gap-2 text-sm font-semibold"><CurrencyDollar size={18} className="text-primary" /> Cost</span>
        <span className="mono text-lg font-bold text-primary">{money(job.actual_cost)}</span>
      </button>

      {(job.completion_documents || []).length > 0 && (
        <div>
          <div className="overline mb-2">Documentation</div>
          <div className="space-y-1">
            {job.completion_documents.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm border border-border p-2">
                <FileText size={14} className="text-muted-foreground shrink-0" /> {d.file_name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
