import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ClockCounterClockwise } from "@phosphor-icons/react";
import QuoteBuilder from "@/components/QuoteBuilder";
import QuoteApprovalPanel from "@/components/QuoteApprovalPanel";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const OPS_ROLES = ["operations_manager", "admin"];
const FINANCE_ROLES = ["finance", "admin"];

export default function MaintenanceDetailPanel({ jobId, currentUser, onClose, onChange }) {
  const [tab, setTab] = useState("overview");
  const [job, setJob] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [activity, setActivity] = useState([]);

  const load = useCallback(async () => {
    if (!jobId) return;
    try {
      const [j, q] = await Promise.all([
        api.get(`/maintenance/${jobId}`),
        api.get(`/maintenance/${jobId}/quotes`),
      ]);
      setJob(j.data);
      setQuotes(q.data || []);
    } catch { toast.error("Unable to load job"); }
  }, [jobId]);

  useEffect(() => { load(); setTab("overview"); }, [jobId, load]);
  useEffect(() => {
    if (tab === "activity" && jobId) {
      api.get("/audit", { params: { entity_id: jobId } }).then((r) => setActivity(r.data || [])).catch(() => {});
    }
  }, [tab, jobId]);

  const latestQuote = quotes[0];
  const canDecide = latestQuote && (
    (latestQuote.stage === "pending_ops" && OPS_ROLES.includes(currentUser?.role)) ||
    (latestQuote.stage === "pending_finance" && FINANCE_ROLES.includes(currentUser?.role))
  );

  const decide = async (decision, reason) => {
    try {
      await api.post(`/quotes/${latestQuote.id}/decide`, { decision, reason });
      toast.success(decision === "approved" ? "Quote approved" : "Quote rejected");
      load();
      onChange();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to record decision");
    }
  };

  const canSubmitQuote = !latestQuote || latestQuote.stage === "rejected";

  return (
    <Sheet open={!!jobId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-2xl flex flex-col overflow-hidden p-0" data-testid="maintenance-detail-panel">
        <SheetTitle className="sr-only">{job?.title || "Maintenance job"}</SheetTitle>
        <SheetDescription className="sr-only">Maintenance job detail, quotation, and activity</SheetDescription>
        {!job ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="border-b border-border p-6 shrink-0">
              <div className="overline">{job.vehicle_name} · {job.vehicle_plate}</div>
              <h2 className="font-display text-2xl font-bold mt-1">{job.title}</h2>
            </div>
            <div className="border-b border-border px-6 flex gap-4 shrink-0">
              {["overview", "quotation", "activity"].map((t) => (
                <button key={t} onClick={() => setTab(t)} data-testid={`job-tab-${t}`}
                  className={`py-3 text-xs uppercase tracking-widest border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {tab === "overview" && (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    ["Status", job.status], ["Priority", job.priority], ["Category", job.category || "—"],
                    ["Assigned to", job.assigned_to_name || "Unassigned"],
                    ["Estimated cost", money(job.estimated_cost)], ["Actual cost", money(job.actual_cost)],
                  ].map(([l, v]) => (
                    <div key={l} className="border border-border p-3">
                      <div className="overline">{l}</div>
                      <div className="text-sm mt-1">{v}</div>
                    </div>
                  ))}
                  {job.description && (
                    <div className="col-span-2 border border-border p-3">
                      <div className="overline mb-1">Description</div>
                      <div className="text-sm text-muted-foreground">{job.description}</div>
                    </div>
                  )}
                </div>
              )}
              {tab === "quotation" && (
                canSubmitQuote ? (
                  <QuoteBuilder maintenanceId={jobId} currentUser={currentUser} onSubmitted={() => { load(); onChange(); }} />
                ) : (
                  <QuoteApprovalPanel quote={latestQuote} canDecide={canDecide} onDecide={decide} />
                )
              )}
              {tab === "activity" && (
                <div className="space-y-2" data-testid="job-activity">
                  {activity.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No activity yet.</div>}
                  {activity.map((e) => (
                    <div key={e.id} className="flex items-start gap-3 border-b border-border/50 py-2 text-sm">
                      <ClockCounterClockwise size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <div>{e.user_name} <span className="text-muted-foreground">· {e.action}</span></div>
                        <div className="text-[10px] mono text-muted-foreground mt-0.5">{new Date(e.at).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
