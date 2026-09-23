import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle, Play, Plus, Kanban, Table as TableIcon, ClockCounterClockwise } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { hasAccess } from "@/lib/access";
import MaintenanceDetailPanel from "@/components/MaintenanceDetailPanel";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";
import { usePolling } from "@/hooks/use-polling";

const OPS_ROLES = ["operations_manager", "admin"];
const FINANCE_ROLES = ["finance", "admin"];

const COLUMNS = [
  { key: "pending", label: "Pending", accent: "border-t-[#8E8E93]" },
  { key: "in_progress", label: "In progress", accent: "border-t-[#FFCC00]" },
  { key: "on_hold", label: "On hold", accent: "border-t-[#A855F7]" },
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
  const { currency } = useCurrency();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [quotesByJob, setQuotesByJob] = useState({}); // job_id -> latest quote (for the approval filter)
  const [vehicles, setVehicles] = useState([]);
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pendingRequisition, setPendingRequisition] = useState(false);
  const [partsStatusByJob, setPartsStatusByJob] = useState({}); // job_id -> latest requisition status
  const [detailJobId, setDetailJobId] = useState(searchParams.get("job") || null);
  const [awaitingApproval, setAwaitingApproval] = useState(searchParams.get("approvals") === "1");
  const [complete, setComplete] = useState({
    actual_cost: "", parts_cost: "", labor_cost: "", external_cost: "",
    workshop_name: "", technician: "", vendor: "", odometer: "", engine_hours: "", documents: [],
  });
  const [showNew, setShowNew] = useState(false);
  const [newJobTargetType, setNewJobTargetType] = useState("vehicle"); // vehicle | asset
  const [newJob, setNewJob] = useState({ vehicle_id: "", asset_id: "", schedule_id: "", title: "", priority: "medium", category: "general", odometer: "" });
  const [schedules, setSchedules] = useState([]);
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
    api.get("/assets").then(r => setAssets(r.data)).catch(() => {});
    api.get("/users/directory").then(r => setUsers(r.data));
    api.get("/maintenance-schedules").then(r => setSchedules(r.data || [])).catch(() => {});
  }, []);
  // This board otherwise only ever fetched once on mount, so a job completed/approved/moved by
  // someone else stayed stale until a manual reload. quotesByJob and partsStatusByJob both already
  // depend on `jobs`, so they refresh for free whenever this does.
  usePolling(load);

  // Schedules assigned to whichever vehicle/asset is currently selected in the New Job form — a job
  // can only reset a schedule it's actually linked to, so don't offer schedules for other assets.
  const targetId = newJobTargetType === "vehicle" ? newJob.vehicle_id : newJob.asset_id;
  const eligibleSchedules = schedules.filter(s => s.assets.some(a => a.kind === newJobTargetType && a.id === targetId));
  useEffect(() => {
    if (newJob.schedule_id && !eligibleSchedules.some(s => s.id === newJob.schedule_id)) {
      setNewJob(j => ({ ...j, schedule_id: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, newJobTargetType]);

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

  // Job completion is blocked (server-side, this is just the matching UI reflection) while a parts
  // requisition on this job is still awaiting the Workshop Manager's decision.
  useEffect(() => {
    if (!selected) { setPendingRequisition(false); return; }
    api.get(`/maintenance/${selected.id}/parts-requisitions`)
      .then(r => setPendingRequisition((r.data || []).some(req => req.status === "pending_approval")))
      .catch(() => setPendingRequisition(false));
  }, [selected]);

  // One workspace-wide fetch (not N+1 per job) for the Kanban card's parts-status badge -- keyed by
  // each job's MOST RECENT requisition (the API returns newest-first) so a job with an old rejected
  // request and a fresh pending one shows the current state, not a stale one.
  useEffect(() => {
    api.get("/parts-requisitions")
      .then(r => {
        const byJob = {};
        for (const req of (r.data || [])) {
          if (!(req.maintenance_id in byJob)) byJob[req.maintenance_id] = req.status;
        }
        setPartsStatusByJob(byJob);
      })
      .catch(() => {});
  }, [jobs]);

  const visibleJobs = awaitingApproval && actionableStage
    ? jobs.filter(j => quotesByJob[j.id]?.stage === actionableStage)
    : jobs;

  const createJob = async (e) => {
    e.preventDefault();
    try {
      const payload = newJobTargetType === "vehicle"
        ? { vehicle_id: newJob.vehicle_id, title: newJob.title, priority: newJob.priority, category: newJob.category, odometer: Number(newJob.odometer) || 0 }
        : { asset_id: newJob.asset_id, title: newJob.title, priority: newJob.priority, category: newJob.category };
      if (newJob.schedule_id) payload.schedule_id = newJob.schedule_id;
      await api.post("/maintenance", payload);
      toast.success("Job created");
      setShowNew(false);
      setNewJob({ vehicle_id: "", asset_id: "", schedule_id: "", title: "", priority: "medium", category: "general", odometer: "" });
      setNewJobTargetType("vehicle");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed to create job"); }
  };

  const vName = (job) => job.vehicle_id ? (vehicles.find(v => v.id === job.vehicle_id)?.name || "—") : (job.asset_name || "—");
  const vPlate = (job) => job.vehicle_id ? (vehicles.find(v => v.id === job.vehicle_id)?.plate || "") : (job.asset_identifier || "");
  const tName = (id) => users.find(u => u.id === id)?.name || "Unassigned";

  const move = async (job, status) => {
    try {
      await api.patch(`/maintenance/${job.id}`, { status });
      toast.success(`Moved to ${status.replace("_", " ")}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to update job");
    }
  };

  const resumeJob = async (job) => {
    try {
      await api.post(`/maintenance/${job.id}/resume`);
      toast.success("Job resumed");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to resume job");
    }
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
    const results = await Promise.allSettled([...selectedIds].map(id => api.patch(`/maintenance/${id}`, { status })));
    const failed = results.filter(r => r.status === "rejected");
    const succeeded = results.length - failed.length;
    if (succeeded > 0) toast.success(`${succeeded} job${succeeded !== 1 ? "s" : ""} moved to ${status.replace("_", " ")}`);
    if (failed.length > 0) toast.error(`${failed.length} job${failed.length !== 1 ? "s" : ""} couldn't be updated — ${failed[0].reason?.response?.data?.detail || "see individual jobs for details"}`);
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
      external_cost: Number(complete.external_cost) || 0,
      actual_cost: Number(complete.actual_cost) || null,
      workshop_name: complete.workshop_name || null,
      technician: complete.technician || null,
      vendor: complete.vendor || null,
      odometer: complete.odometer ? Number(complete.odometer) : null,
      engine_hours: complete.engine_hours ? Number(complete.engine_hours) : null,
      completion_documents: complete.documents,
    };
    try {
      await api.patch(`/maintenance/${selected.id}`, patch);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to complete job");
      return;
    }
    toast.success("Job completed");
    setSelected(null);
    setComplete({ actual_cost: "", parts_cost: "", labor_cost: "", external_cost: "", workshop_name: "", technician: "", vendor: "", odometer: "", engine_hours: "", documents: [] });
    load();
  };

  const addCompletionDocument = (file) => {
    const reader = new FileReader();
    reader.onloadend = () => setComplete((c) => ({ ...c, documents: [...c.documents, { file_name: file.name, file_type: file.type, data_url: reader.result }] }));
    reader.readAsDataURL(file);
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6" data-testid="kanban">
          {COLUMNS.map(col => {
            const items = visibleJobs.filter(j => j.status === col.key);
            return (
              <div key={col.key} className={`bg-[#0d0d0f] border border-border border-t-2 ${col.accent}`} data-testid={`column-${col.key}`}>
                <div className="p-4 flex items-center justify-between border-b border-border">
                  <div>
                    <div className="overline">{col.label}</div>
                    <div className="mono text-2xl font-bold mt-1">{items.length}</div>
                  </div>
                  <div className="mono text-xs text-muted-foreground">{formatMoneyFull(items.reduce((s, i) => s + (i.actual_cost || i.estimated_cost || 0), 0), currency)}</div>
                </div>
                <div className="p-3 space-y-3 min-h-[200px]">
                  {items.map(job => (
                    <div key={job.id} onClick={() => { setDetailJobId(job.id); setSearchParams({ job: job.id }); }}
                      className="bg-[#121214] border border-border p-4 hover:border-primary/60 transition-colors cursor-pointer" data-testid={`job-${job.id}`}>
                      {quotesByJob[job.id]?.stage === actionableStage && (
                        <div className="text-[10px] mono uppercase tracking-widest text-primary mb-2">Awaiting your approval</div>
                      )}
                      {job.status !== "completed" && partsStatusByJob[job.id] === "pending_approval" && (
                        <div className="text-[10px] mono uppercase tracking-widest text-[#A855F7] mb-2">Awaiting parts</div>
                      )}
                      {job.status !== "completed" && partsStatusByJob[job.id] === "approved" && (
                        <div className="text-[10px] mono uppercase tracking-widest text-[#34C759] mb-2">Parts approved</div>
                      )}
                      {job.status !== "completed" && partsStatusByJob[job.id] === "rejected" && (
                        <div className="text-[10px] mono uppercase tracking-widest text-primary mb-2">Parts rejected</div>
                      )}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-display font-bold text-sm leading-tight">{job.title}</div>
                        <span className={`text-[10px] mono uppercase tracking-widest px-1.5 py-0.5 border ${PRIORITY_COLOR[job.priority] || ""}`}>{job.priority}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-1">{vName(job)} · <span className="mono">{vPlate(job)}</span></div>
                      {job.category && <div className="text-[10px] mono uppercase tracking-widest text-[#3B82F6] mb-2">{job.category}</div>}
                      <div className="flex items-center justify-between text-xs">
                        <div className="mono">{formatMoneyFull(job.actual_cost || job.estimated_cost, currency)}</div>
                        <div className="text-muted-foreground">{new Date(job.created_at).toLocaleDateString()}</div>
                      </div>
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border/60">
                        {col.key === "pending" && canManageJobs && (
                          <button onClick={(e) => { e.stopPropagation(); move(job, "in_progress"); }} data-testid={`start-${job.id}`} className="flex-1 flex items-center justify-center gap-1 border border-border text-xs uppercase tracking-widest px-2 py-1.5 hover:border-primary hover:text-primary">
                            <Play size={10} /> Start
                          </button>
                        )}
                        {col.key === "in_progress" && canManageJobs && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setSelected(job); }} data-testid={`complete-${job.id}`} className="flex-1 flex items-center justify-center gap-1 bg-primary/10 border border-primary/40 text-primary text-xs uppercase tracking-widest px-2 py-1.5 hover:bg-primary hover:text-primary-foreground">
                              <CheckCircle size={10} /> Complete
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); move(job, "on_hold"); }} data-testid={`hold-${job.id}`} className="flex items-center justify-center gap-1 border border-border text-xs uppercase tracking-widest px-2 py-1.5 hover:border-[#A855F7] hover:text-[#A855F7]">
                              Hold
                            </button>
                          </>
                        )}
                        {col.key === "on_hold" && canManageJobs && (
                          <button onClick={(e) => { e.stopPropagation(); resumeJob(job); }} data-testid={`resume-${job.id}`} className="flex-1 flex items-center justify-center gap-1 border border-border text-xs uppercase tracking-widest px-2 py-1.5 hover:border-primary hover:text-primary">
                            <Play size={10} /> Resume
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
                      <div className="text-xs text-muted-foreground">{vName(job)} · {vPlate(job)}</div>
                    </td>
                    <td className="px-4 py-3"><span className={`text-[10px] mono uppercase tracking-widest px-1.5 py-0.5 border ${PRIORITY_COLOR[job.priority] || ""}`}>{job.priority}</span></td>
                    <td className="px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground">{job.status.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-xs">{tName(job.assigned_to)}</td>
                    <td className="px-4 py-3 mono">{formatMoneyFull(job.actual_cost || job.estimated_cost, currency)}</td>
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
          <div className="bg-[#121214] border border-border max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="complete-modal">
            <div className="border-b border-border p-4">
              <div className="overline">Complete job</div>
              <h3 className="font-display font-bold text-xl mt-1">{selected.title}</h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <div className="overline mb-2">Basic Information</div>
                <div className="grid grid-cols-2 gap-3">
                  {[["workshop_name", "Workshop Name"], ["technician", "Technician"], ["vendor", "Vendor"]].map(([k, l]) => (
                    <div key={k}>
                      <label className="overline block mb-1">{l}</label>
                      <input value={complete[k]} onChange={(e) => setComplete({ ...complete, [k]: e.target.value })} data-testid={`complete-${k}`}
                        className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="overline mb-2">Cost Information</div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["parts_cost", "Parts Cost"], ["labor_cost", "Labour Cost"],
                    ["external_cost", "External Cost"], ["actual_cost", "Total Cost (auto if empty)"],
                  ].map(([k, l]) => (
                    <div key={k}>
                      <label className="overline block mb-1">{l}</label>
                      <input type="number" value={complete[k]} onChange={(e) => setComplete({ ...complete, [k]: e.target.value })}
                        data-testid={`complete-${k}`}
                        className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="overline mb-2">Meter Reading</div>
                <div className="grid grid-cols-2 gap-3">
                  {[["odometer", "Odometer (km)"], ["engine_hours", "Engine Hours"]].map(([k, l]) => (
                    <div key={k}>
                      <label className="overline block mb-1">{l}</label>
                      <input type="number" value={complete[k]} onChange={(e) => setComplete({ ...complete, [k]: e.target.value })}
                        data-testid={`complete-${k}`}
                        className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="overline mb-2">Documentation</div>
                <label className="flex items-center justify-center gap-2 border border-dashed border-border py-3 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary cursor-pointer" data-testid="complete-doc-upload">
                  Attach invoice, job card, photos, or service report
                  <input type="file" className="hidden" multiple onChange={(e) => { [...e.target.files].forEach(addCompletionDocument); e.target.value = ""; }} />
                </label>
                {complete.documents.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {complete.documents.map((d, i) => <div key={i} className="text-xs text-muted-foreground">{d.file_name}</div>)}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">Downtime is calculated automatically from when the job started to now — no manual entry needed.</div>
              {pendingRequisition && (
                <div className="text-xs text-primary border border-primary/40 bg-primary/10 px-3 py-2">
                  A parts request on this job is awaiting approval — it must be decided before this job can be completed.
                </div>
              )}
              <button onClick={finishJob} disabled={pendingRequisition} data-testid="finish-job-btn"
                className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
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
              <div className="flex gap-2" data-testid="new-job-target-type">
                {[["vehicle", "Vehicle"], ["asset", "Asset"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setNewJobTargetType(v)}
                    className={`flex-1 py-2 text-xs uppercase tracking-widest border ${newJobTargetType === v ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>
                    {l}
                  </button>
                ))}
              </div>
              {newJobTargetType === "vehicle" ? (
                <>
                  <div>
                    <label className="overline block mb-1">Vehicle</label>
                    <select required value={newJob.vehicle_id} onChange={(e) => {
                      const v = vehicles.find(x => x.id === e.target.value);
                      setNewJob({ ...newJob, vehicle_id: e.target.value, odometer: v?.odometer || newJob.odometer });
                    }} data-testid="new-job-vehicle" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                      <option value="">Select vehicle…</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} · {v.plate}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="overline block mb-1">Current odometer (km) *</label>
                    <input required type="number" min="1" value={newJob.odometer} onChange={(e) => setNewJob({ ...newJob, odometer: e.target.value })} data-testid="new-job-odometer" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                  </div>
                </>
              ) : (
                <div>
                  <label className="overline block mb-1">Asset</label>
                  <select required value={newJob.asset_id} onChange={(e) => setNewJob({ ...newJob, asset_id: e.target.value })} data-testid="new-job-asset" className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="">Select asset…</option>
                    {assets.map(a => <option key={a.id} value={a.id}>{a.name} · {a.identifier}</option>)}
                  </select>
                </div>
              )}
              {targetId && (
                <div>
                  <label className="overline block mb-1">Linked schedule (optional)</label>
                  <select value={newJob.schedule_id} onChange={(e) => setNewJob({ ...newJob, schedule_id: e.target.value })} data-testid="new-job-schedule"
                    className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                    <option value="">Not linked to a schedule</option>
                    {eligibleSchedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {eligibleSchedules.length === 0 && (
                    <div className="text-xs text-muted-foreground mt-1">No maintenance schedules cover this {newJobTargetType} yet.</div>
                  )}
                  {newJob.schedule_id && (
                    <div className="text-xs text-primary mt-1">Completing this job will reset the schedule's next-due date.</div>
                  )}
                </div>
              )}
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
