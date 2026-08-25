import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, PencilSimple, Wrench, Stack } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { hasAccess } from "@/lib/access";
import ScheduleFormPanel from "@/components/maintenance/ScheduleFormPanel";
import ApplyTemplatePanel from "@/components/maintenance/ApplyTemplatePanel";
import MaintenanceSchedulingHub from "@/components/maintenance/MaintenanceSchedulingHub";
import { STATUS_COLOR, STATUS_LABEL, flattenAssets } from "@/components/maintenance/ScheduleAssetList";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const STATUS_RANK = { overdue: 0, due_soon: 1, on_track: 2, awaiting_telematics: 3 };

export default function MaintenanceSchedules() {
  const { user } = useAuth();
  const canManage = hasAccess(user, "maintenance", "full");
  const [schedules, setSchedules] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [assets, setAssets] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [panelSchedule, setPanelSchedule] = useState(null); // schedule object | "new" | null
  const [showApplyTemplate, setShowApplyTemplate] = useState(false);
  const [hubRoot, setHubRoot] = useState(null);

  const load = () => api.get("/maintenance-schedules").then((r) => setSchedules(r.data || []));
  useEffect(() => {
    load();
    api.get("/vehicles").then((r) => setVehicles(r.data));
    api.get("/assets").then((r) => setAssets(r.data)).catch(() => {});
    api.get("/maintenance").then((r) => setJobs(r.data || []));
    api.get("/maintenance-types").then((r) => setMaintenanceTypes(r.data || []));
    api.get("/asset-types").then((r) => setAssetTypes(r.data || []));
    api.get("/maintenance-templates").then((r) => setTemplates(r.data || []));
  }, []);

  const kpis = useMemo(() => {
    const all = flattenAssets(schedules, {});
    const overdue = all.filter((a) => a.status === "overdue").length;
    const dueWeek = all.filter((a) => a.status === "due_soon" && a.remaining_days != null && a.remaining_days <= 7).length;
    const dueMonth = all.filter((a) => a.remaining_days != null && a.remaining_days > 7 && a.remaining_days <= 30).length;
    const upcoming = all.filter((a) => a.status === "on_track" && a.remaining_days != null && a.remaining_days > 30).length;

    const now = new Date();
    const completedThisMonth = jobs.filter((j) => {
      if (j.status !== "completed" || !j.completed_at) return false;
      const d = new Date(j.completed_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const workshopSpend = completedThisMonth.reduce((s, j) => s + (j.actual_cost || 0), 0);
    const distinctAssets = new Set(completedThisMonth.map((j) => j.vehicle_id || j.asset_id));
    const avgCostPerAsset = distinctAssets.size ? workshopSpend / distinctAssets.size : 0;
    const outOfService = vehicles.filter((v) => v.status === "maintenance").length + assets.filter((a) => a.status === "maintenance").length;

    return { overdue, dueWeek, dueMonth, upcoming, completedThisMonth: completedThisMonth.length, workshopSpend, avgCostPerAsset, outOfService };
  }, [schedules, jobs, vehicles, assets]);

  const sortedSchedules = useMemo(
    () => [...schedules].sort((a, b) => STATUS_RANK[a.status_summary] - STATUS_RANK[b.status_summary]),
    [schedules],
  );

  const openAssetList = (root) => setHubRoot(root);

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Preventative Maintenance</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="maintenance-schedules-title">Maintenance Schedules</h1>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowApplyTemplate(true)} data-testid="apply-template-open-btn" className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors">
              <Stack size={14} /> Apply Template
            </button>
            <button onClick={() => setPanelSchedule("new")} data-testid="new-schedule-btn" className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus size={14} weight="bold" /> Create Schedule
            </button>
          </div>
        )}
      </header>

      {/* Feature 4 KPI tiles — action-first ordering (Overdue -> Due This Week -> Due This Month -> Upcoming) first */}
      <div className="px-8 pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders" data-testid="maintenance-kpi-tiles">
          {[
            ["Overdue Maintenance", kpis.overdue, "text-primary", () => openAssetList({ type: "asset-list", filter: "overdue", label: "Overdue Maintenance" })],
            ["Due This Week", kpis.dueWeek, "text-[#FFCC00]", () => openAssetList({ type: "asset-list", filter: "due_week", label: "Due This Week" })],
            ["Due This Month", kpis.dueMonth, "text-[#FFCC00]", () => openAssetList({ type: "asset-list", filter: "due_month", label: "Due This Month" })],
            ["Upcoming", kpis.upcoming, "text-[#34C759]", () => openAssetList({ type: "asset-list", filter: "upcoming", label: "Upcoming" })],
          ].map(([l, v, cls, onClick]) => (
            <button key={l} onClick={onClick} data-testid={`tile-${l.toLowerCase().replace(/\s+/g, "-")}`} className="p-5 bg-[#121214] text-left hover:bg-[#17171a] transition-colors">
              <div className="overline">{l}</div>
              <div className={`mono text-xl font-bold mt-2 ${cls}`}>{v}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 border border-border border-t-0 grid-borders">
          {[
            ["Completed This Month", kpis.completedThisMonth, "text-muted-foreground"],
            ["Workshop Spend", money(kpis.workshopSpend), "text-foreground"],
            ["Average Cost / Asset", money(kpis.avgCostPerAsset), "text-foreground"],
            ["Assets Out of Service", kpis.outOfService, "text-primary"],
          ].map(([l, v, cls]) => (
            <div key={l} className="p-5 bg-[#121214]">
              <div className="overline">{l}</div>
              <div className={`mono text-xl font-bold mt-2 ${cls}`}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-8">
        <div className="bg-[#121214] border border-border overflow-hidden" data-testid="schedules-list">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border overline">
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Assets</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedSchedules.map((s) => (
                <tr key={s.id} className="border-b border-border/50 hover:bg-white/[0.02] cursor-pointer" data-testid={`schedule-row-${s.id}`}
                  onClick={() => openAssetList({ type: "asset-list", scheduleId: s.id, label: s.name })}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Wrench size={16} className="text-muted-foreground shrink-0" />
                      <div>
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.intervals.map((i) => `Every ${i.every_n} ${i.unit}`).join(" OR ")}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground">{s.priority}</td>
                  <td className="px-4 py-3 mono text-xs">{s.assets.length}</td>
                  <td className="px-4 py-3"><span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${STATUS_COLOR[s.status_summary]}`}>{STATUS_LABEL[s.status_summary]}</span></td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {canManage && (
                      <button onClick={() => setPanelSchedule(s)} data-testid={`edit-schedule-${s.id}`} className="border border-border p-2 text-muted-foreground hover:border-primary hover:text-primary"><PencilSimple size={12} /></button>
                    )}
                  </td>
                </tr>
              ))}
              {sortedSchedules.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">No maintenance schedules yet. Create one to get started.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canManage && (
        <>
          <ScheduleFormPanel schedule={panelSchedule} vehicles={vehicles} assets={assets} maintenanceTypes={maintenanceTypes} assetTypes={assetTypes}
            onClose={() => setPanelSchedule(null)} onSaved={() => { setPanelSchedule(null); load(); }} />
          <ApplyTemplatePanel open={showApplyTemplate} templates={templates} vehicles={vehicles} assets={assets}
            onClose={() => setShowApplyTemplate(false)} onApplied={load} />
        </>
      )}

      <MaintenanceSchedulingHub root={hubRoot} schedules={schedules} vehicles={vehicles} assets={assets}
        onClose={() => setHubRoot(null)} onDataChanged={() => { load(); api.get("/maintenance").then((r) => setJobs(r.data || [])); }} />
    </div>
  );
}
