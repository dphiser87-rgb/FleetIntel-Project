import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle, Play, ArrowRight } from "@phosphor-icons/react";

const money = (n) => `$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const COLUMNS = [
  { key: "pending", label: "Pending", accent: "border-t-[#8E8E93]" },
  { key: "in_progress", label: "In progress", accent: "border-t-[#FFCC00]" },
  { key: "completed", label: "Completed", accent: "border-t-[#34C759]" },
];

const PRIORITY_COLOR = {
  low: "border-[#8E8E93] text-[#8E8E93]",
  medium: "border-[#3B82F6] text-[#3B82F6]",
  high: "border-[#FFCC00] text-[#FFCC00]",
  critical: "border-primary text-primary",
};

export default function Maintenance() {
  const [jobs, setJobs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [complete, setComplete] = useState({ actual_cost: "", parts_cost: "", labor_cost: "", downtime_hours: "" });

  const load = () => api.get("/maintenance").then(r => setJobs(r.data));
  useEffect(() => {
    load();
    api.get("/vehicles").then(r => setVehicles(r.data));
  }, []);

  const vName = (id) => vehicles.find(v => v.id === id)?.name || "—";
  const vPlate = (id) => vehicles.find(v => v.id === id)?.plate || "";

  const move = async (job, status) => {
    await api.patch(`/maintenance/${job.id}`, { status });
    toast.success(`Moved to ${status.replace("_", " ")}`);
    load();
  };

  const finishJob = async () => {
    if (!selected) return;
    const patch = {
      status: "completed",
      parts_cost: Number(complete.parts_cost) || selected.parts_cost || 0,
      labor_cost: Number(complete.labor_cost) || selected.labor_cost || 0,
      actual_cost: Number(complete.actual_cost) || null,
      downtime_hours: Number(complete.downtime_hours) || selected.estimated_hours || 0,
    };
    await api.patch(`/maintenance/${selected.id}`, patch);
    toast.success("Job completed");
    setSelected(null);
    setComplete({ actual_cost: "", parts_cost: "", labor_cost: "", downtime_hours: "" });
    load();
  };

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between">
        <div>
          <div className="overline">Workflow</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="maintenance-title">Maintenance board</h1>
        </div>
        <div className="mono text-xs text-muted-foreground">{jobs.length} jobs</div>
      </header>

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="kanban">
          {COLUMNS.map(col => {
            const items = jobs.filter(j => j.status === col.key);
            return (
              <div key={col.key} className={`bg-[#0d0d0f] border border-border border-t-2 ${col.accent}`} data-testid={`column-${col.key}`}>
                <div className="p-4 flex items-center justify-between border-b border-border">
                  <div>
                    <div className="overline">{col.label}</div>
                    <div className="mono text-2xl font-bold mt-1">{items.length}</div>
                  </div>
                  <div className="mono text-xs text-muted-foreground">{money(items.reduce((s, i) => s + (i.actual_cost || i.estimated_cost || 0), 0))}</div>
                </div>
                <div className="p-3 space-y-3 min-h-[200px]">
                  {items.map(job => (
                    <div key={job.id} className="bg-[#121214] border border-border p-4 hover:border-primary/60 transition-colors" data-testid={`job-${job.id}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-display font-bold text-sm leading-tight">{job.title}</div>
                        <span className={`text-[10px] mono uppercase tracking-widest px-1.5 py-0.5 border ${PRIORITY_COLOR[job.priority] || ""}`}>{job.priority}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-3">{vName(job.vehicle_id)} · <span className="mono">{vPlate(job.vehicle_id)}</span></div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="mono">{money(job.actual_cost || job.estimated_cost)}</div>
                        <div className="text-muted-foreground">{new Date(job.created_at).toLocaleDateString()}</div>
                      </div>
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
                        {col.key === "pending" && (
                          <button onClick={() => move(job, "in_progress")} data-testid={`start-${job.id}`} className="flex-1 flex items-center justify-center gap-1 border border-border text-xs uppercase tracking-widest px-2 py-1.5 hover:border-primary hover:text-primary">
                            <Play size={10} /> Start
                          </button>
                        )}
                        {col.key === "in_progress" && (
                          <button onClick={() => setSelected(job)} data-testid={`complete-${job.id}`} className="flex-1 flex items-center justify-center gap-1 bg-primary/10 border border-primary/40 text-primary text-xs uppercase tracking-widest px-2 py-1.5 hover:bg-primary hover:text-primary-foreground">
                            <CheckCircle size={10} /> Complete
                          </button>
                        )}
                        {col.key === "completed" && (
                          <div className="flex-1 text-[10px] uppercase tracking-widest text-[#34C759] flex items-center gap-1">
                            <CheckCircle size={10} weight="fill" /> Closed · {job.downtime_hours || 0}h
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setSelected(null)}>
          <div className="bg-[#121214] border border-border max-w-md w-full" onClick={(e) => e.stopPropagation()} data-testid="complete-modal">
            <div className="border-b border-border p-4">
              <div className="overline">Complete job</div>
              <h3 className="font-display font-bold text-xl mt-1">{selected.title}</h3>
            </div>
            <div className="p-4 space-y-3">
              {[
                ["parts_cost", "Actual parts cost"],
                ["labor_cost", "Actual labor cost"],
                ["actual_cost", "Total actual cost (auto if empty)"],
                ["downtime_hours", "Downtime (hours)"],
              ].map(([k, l]) => (
                <div key={k}>
                  <label className="overline block mb-1">{l}</label>
                  <input type="number" value={complete[k]} onChange={(e) => setComplete({...complete, [k]: e.target.value})}
                    data-testid={`complete-${k}`}
                    className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                </div>
              ))}
              <button onClick={finishJob} data-testid="finish-job-btn" className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90">
                Mark as completed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
