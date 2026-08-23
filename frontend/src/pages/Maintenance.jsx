import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle, Play, ArrowRight, Plus, Kanban, Table as TableIcon, ClockCounterClockwise } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { hasAccess } from "@/lib/access";
import MaintenanceDetailPanel from "@/components/MaintenanceDetailPanel";

const OPS_ROLES = ["operations_manager", "admin"];
const FINANCE_ROLES = ["finance", "admin"];

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

const CATEGORIES = ["tyres", "engine", "brakes", "electrical", "bodywork", "general"];

export default function Maintenance() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [quotesByJob, setQuotesByJob] = useState({}); // job_id -> latest quote (for the approval filter)
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detailJobId, setDetailJobId] = useState(searchParams.get("job") || null);
  const [awaitingApproval, setAwaitingApproval] = useState(searchParams.get("approvals") === "1");
  const [complete, setComplete] = useState({ actual_cost: "", parts_cost: "", labor_cost: "", downtime_hours: "" });
  const [showNew, setShowNew] = useState(false);
  const [newJob, setNewJob] = useState({ vehicle_id: "", title: "", priority: "medium", category: "general" });
  const [view, setView] = useState("board"); // board | table | audit
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");
  const [audit, setAudit] = useState([]);

  const actionableStage = OPS_ROLES.includes(user?.role) ? "pending_ops" : FINANCE_ROLES.includes(user?.role) ? "pending_finance" : null;
  const canManageJobs = hasAccess(user, "maintenance", "full");

  const load = () => api.get("/maintenance").then(r => setJobs(r.data));
  useEffect(() => {
    load();
    api.get("/vehicles").then(r => setVehicles(r.data));
    api.get("/users").then(r => setUsers(r.data));
  }, []);

  useEffect(() => {
    if (view === "audit") api.get("/audit", { params: { entity_type: "maintenance" } }).then(r => setAudit(r.data || []));
  }, [view]);

  // Populate quotesByJob only when the "Awaiting my approval" filter is actually usable, to avoid an
  // N+1 fetch on every page load for roles that can never action a quote.
  useEffect(() => {
    if (!actionableStage || jobs.length === 0) return;
    Promise.all(jobs.map(j => api.get(`/maintenance/${j.id}/quotes`).then(r => [j.id, r.data?.[0]]).catch(() => [j.id, null])))
      .then(pairs => setQuotesByJob(Object.fromEntries(pairs)));
  }, [actionableStage, jobs]);

  const visibleJobs = awaitingApproval && actionableStage
    ? jobs.filter(j => quotesByJob[j.id]?.stage === actionableStage)
    : jobs;

  const createJob = async (e) => {
    e.preventDefault();
    try {
      await api.post("/maintenance", newJob);
      toast.success("Job created");
      setShowNew(false);
      setNewJob({ vehicle_id: "", title: "", priority: "medium", category: "general" });
      load();
    } catch { toast.error("Failed to create job"); }
  };

  const vName = (id) => vehicles.find(v => v.id === id)?.name || "—";
  const vPlate = (id) => vehicles.find(v => v.id === id)?.plate || "";
  const tName = (id) => users.find(u => u.id === id)?.name || "Unassigned";

  const move = async (job, status) => {
    await api.patch(`/maintenance/${job.id}`, { status });
    toast.success(`Moved to ${status.replace("_", " ")}`);
    load();
  };

  const stats = {
    active: jobs.filter(j => j.status === "pending" || j.status === "in_progress").length,
    highPriority: jobs.filter(j => ["high", "critical"].includes(j.priority) && j.status !== "completed").length,
    stale: jobs.filter(j => j.status !== "completed" && (Date.now() - new Date(j.created_at).getTime()) > 14 * 86400000).length,
    completedThisMonth: jobs.filter(j => {
      if (j.status !== "completed" || !j.completed_at) return false;
      const d = new Date(j.completed_at), now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
  };

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const bulkSetStatus = async (status) => {
    await Promise.all([...selectedIds].map(id => api.patch(`/maintenance/${id}`, { status })));
    toast.success(`${selectedIds.size} job${selectedIds.size !== 1 ? "s" : ""} moved to ${status.replace("_", " ")}`);
    setSelectedIds(new Set());
    load();
  };

  const tableJobs = [...visibleJobs].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey], bv = b[sortKey];
    if (av == null) return 1;
    if (bv == null) return -1;
    return av > bv ? dir : av < bv ? -dir : 0;
  });

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
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Workflow</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="maintenance-title">Workshop Management</h1>
        </div>
        <div className="flex items-center gap-4">
          {actionableStage && (
            <button
              onClick={() => { const v = !awaitingApproval; setAwaitingApproval(v); setSearchParams(v ? { approvals: "1" } : {}); }}
              data-testid="awaiting-approval-filter"
              className={`text-xs uppercase tracking-widest px-3 py-2 border transition-colors ${awaitingApproval ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}
            >
              Awaiting my approval
            </button>
          )}
          <div className="mono text-xs text-muted-foreground">{visibleJobs.length} jobs</div>
          {canManageJobs && (
            <button onClick={() => setShowNew(true)} data-testid="new-job-btn" className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus size={14} weight="bold" /> New job
            </button>
          )}
        </div>
      </header>

      <div className="px-8 pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders" data-testid="workshop-stats">
          {[["Active Jobs", stats.active, "text-foreground"], ["High Priority", stats.highPriority, "text-primary"],
            ["Stale (14d+)", stats.stale, "text-[#FFCC00]"], ["Completed this month", stats.completedThisMonth, "text-[#34C759]"]].map(([l, v, cls]) => (
            <div key={l} className="p-5 bg-[#121214]">
              <div className="overline">{l}</div>
              <div className={`mono text-xl font-bold mt-2 ${cls}`}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-8 pt-6 flex items-center gap-2">
        {[["board", "Board", Kanban], ["table", "Table", TableIcon], ["audit", "Audit Log", ClockCounterClockwise]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setView(k)} data-testid={`view-${k}`}
            className={`flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-widest border transition-colors ${view === k ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
            <Icon size={14} /> {l}
          </button>
        ))}
        {view === "table" && selectedIds.size > 0 && canManageJobs && (
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border">
            <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
            {COLUMNS.map(col => (
              <button key={col.key} onClick={() => bulkSetStatus(col.key)} data-testid={`bulk-${col.key}`}
                className="text-xs uppercase tracking-widest px-2 py-1 border border-border hover:border-primary hover:text-primary">
                Move to {col.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "board" && (
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="kanban">
          {COLUMNS.map(col => {
            const items = visibleJobs.filter(j => j.status === col.key);
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
                    <div key={job.id} onClick={() => { setDetailJobId(job.id); setSearchParams({ job: job.id }); }}
                      className="bg-[#121214] border border-border p-4 hover:border-primary/60 transition-colors cursor-pointer" data-testid={`job-${job.id}`}>
                      {quotesByJob[job.id]?.stage === actionableStage && (
                        <div className="text-[10px] mono uppercase tracking-widest text-primary mb-2">Awaiting your approval</div>
                      )}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-display font-bold text-sm leading-tight">{job.title}</div>
                        <span className={`text-[10px] mono uppercase tracking-widest px-1.5 py-0.5 border ${PRIORITY_COLOR[job.priority] || ""}`}>{job.priority}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-1">{vName(job.vehicle_id)} · <span className="mono">{vPlate(job.vehicle_id)}</span></div>
                      {job.category && <div className="text-[10px] mono uppercase tracking-widest text-[#3B82F6] mb-2">{job.category}</div>}
                      <div className="flex items-center justify-between text-xs">
                        <div className="mono">{money(job.actual_cost || job.estimated_cost)}</div>
                        <div className="text-muted-foreground">{new Date(job.created_at).toLocaleDateString()}</div>
                      </div>
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
                        {col.key === "pending" && canManageJobs && (
                          <button onClick={(e) => { e.stopPropagation(); move(job, "in_progress"); }} data-testid={`start-${job.id}`} className="flex-1 flex items-center justify-center gap-1 border border-border text-xs uppercase tracking-widest px-2 py-1.5 hover:border-primary hover:text-primary">
                            <Play size={10} /> Start
                          </button>
                        )}
                        {col.key === "in_progress" && canManageJobs && (
                          <button onClick={(e) => { e.stopPropagation(); setSelected(job); }} data-testid={`complete-${job.id}`} className="flex-1 flex items-center justify-center gap-1 bg-primary/10 border border-primary/40 text-primary text-xs uppercase tracking-widest px-2 py-1.5 hover:bg-primary hover:text-primary-foreground">
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
      )}

      {view === "table" && (
        <div className="p-8">
          <div className="bg-[#121214] border border-border overflow-hidden" data-testid="maintenance-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  {canManageJobs && <th className="px-4 py-3 w-10"></th>}
                  {[["title", "Description"], ["priority", "Priority"], ["status", "Status"], ["assigned_to", "Technician"], ["actual_cost", "Cost to date"], ["created_at", "Created"]].map(([k, l]) => (
                    <th key={k} className="overline px-4 py-3 cursor-pointer select-none" onClick={() => { setSortKey(k); setSortDir(sortKey === k && sortDir === "asc" ? "desc" : "asc"); }}>
                      {l} {sortKey === k && (sortDir === "asc" ? "↑" : "↓")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableJobs.map(job => (
                  <tr key={job.id} className="border-b border-border/50 hover:bg-white/[0.02] cursor-pointer" data-testid={`table-row-${job.id}`}
                    onClick={() => { setDetailJobId(job.id); setSearchParams({ job: job.id }); }}>
                    {canManageJobs && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(job.id)} onChange={() => toggleSelect(job.id)} data-testid={`select-${job.id}`} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-semibold">{job.title}</div>
                      <div className="text-xs text-muted-foreground">{vName(job.vehicle_id)} · {vPlate(job.vehicle_id)}</div>
                    </td>
                    <td className="px-4 py-3"><span className={`text-[10px] mono uppercase tracking-widest px-1.5 py-0.5 border ${PRIORITY_COLOR[job.priority] || ""}`}>{job.priority}</span></td>
                    <td className="px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground">{job.status.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-xs">{tName(job.assigned_to)}</td>
                    <td className="px-4 py-3 mono">{money(job.actual_cost || job.estimated_cost)}</td>
                    <td className="px-4 py-3 mono text-muted-foreground text-xs">{new Date(job.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {tableJobs.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">No jobs match the current filters.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "audit" && (
        <div className="p-8">
          <div className="bg-[#121214] border border-border divide-y divide-border" data-testid="workshop-audit">
            {audit.map(e => (
              <div key={e.id} className="flex items-start gap-3 p-4 text-sm">
                <ClockCounterClockwise size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div>{e.user_name} <span className="text-muted-foreground">· {e.action}</span></div>
                  <div className="text-[10px] mono text-muted-foreground mt-0.5">{new Date(e.at).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {audit.length === 0 && <div className="text-sm text-muted-foreground text-center py-12">No workshop activity yet.</div>}
          </div>
        </div>
      )}

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

      {showNew && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setShowNew(false)}>
          <div className="bg-[#121214] border border-border max-w-md w-full" onClick={(e) => e.stopPropagation()} data-testid="new-job-modal">
            <div className="border-b border-border p-4">
              <div className="overline">New maintenance job</div>
              <h3 className="font-display font-bold text-xl mt-1">Create job</h3>
            </div>
            <form onSubmit={createJob} className="p-4 space-y-3">
              <div>
                <label className="overline block mb-1">Vehicle</label>
                <select required value={newJob.vehicle_id} onChange={(e) => setNewJob({ ...newJob, vehicle_id: e.target.value })} data-testid="new-job-vehicle" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                  <option value="">Select vehicle…</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} · {v.plate}</option>)}
                </select>
              </div>
              <div>
                <label className="overline block mb-1">Title</label>
                <input required value={newJob.title} onChange={(e) => setNewJob({ ...newJob, title: e.target.value })} data-testid="new-job-title" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="overline block mb-1">Priority</label>
                  <select value={newJob.priority} onChange={(e) => setNewJob({ ...newJob, priority: e.target.value })} data-testid="new-job-priority" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    {["low", "medium", "high", "critical"].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="overline block mb-1">Category</label>
                  <select value={newJob.category} onChange={(e) => setNewJob({ ...newJob, category: e.target.value })} data-testid="new-job-category" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" data-testid="create-job-btn" className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90">
                Create job
              </button>
            </form>
          </div>
        </div>
      )}

      <MaintenanceDetailPanel
        jobId={detailJobId}
        currentUser={user}
        onClose={() => { setDetailJobId(null); setSearchParams(awaitingApproval ? { approvals: "1" } : {}); }}
        onChange={load}
      />
    </div>
  );
}
