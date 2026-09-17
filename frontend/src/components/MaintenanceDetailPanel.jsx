import React, { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ClockCounterClockwise, DownloadSimple } from "@phosphor-icons/react";
import { API } from "@/lib/api";
import QuoteBuilder from "@/components/QuoteBuilder";
import QuoteApprovalPanel from "@/components/QuoteApprovalPanel";
import PartsRequisitionBuilder from "@/components/PartsRequisitionBuilder";
import PartsRequisitionPanel from "@/components/PartsRequisitionPanel";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";
import { hasAccess } from "@/lib/access";

const OPS_ROLES = ["operations_manager", "admin"];
const FINANCE_ROLES = ["finance", "admin"];
const REQUISITION_APPROVER_ROLES = ["workshop_manager", "admin"];

export default function MaintenanceDetailPanel({ jobId, currentUser, onClose, onChange }) {
  const { currency } = useCurrency();
  const [tab, setTab] = useState("overview");
  const [job, setJob] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [activity, setActivity] = useState([]);

  const load = useCallback(async () => {
    if (!jobId) return;
    try {
      const [j, q, r] = await Promise.all([
        api.get(`/maintenance/${jobId}`),
        api.get(`/maintenance/${jobId}/quotes`),
        api.get(`/maintenance/${jobId}/parts-requisitions`),
      ]);
      setJob(j.data);
      setQuotes(q.data || []);
      setRequisitions(r.data || []);
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

  // Gated by the "quotes" System Right rather than a hardcoded role, mirroring the backend's
  // require_module("quotes", "full") on POST /maintenance/{mid}/quotes -- workshop_manager/admin/manager
  // get it by default, but a workspace with no Workshop Manager can grant it to Operations or Finance
  // instead via Team permissions.
  const canSubmitQuote = (!latestQuote || latestQuote.stage === "rejected") && hasAccess(currentUser, "quotes", "full");

  const latestRequisition = requisitions[0];
  const canDecideRequisition = latestRequisition && latestRequisition.status === "pending_approval"
    && REQUISITION_APPROVER_ROLES.includes(currentUser?.role);
  const canSubmitRequisition = !latestRequisition || latestRequisition.status !== "pending_approval";

  const decideRequisition = async (decision, reason) => {
    try {
      await api.post(`/parts-requisitions/${latestRequisition.id}/decide`, { decision, reason });
      toast.success(decision === "approved" ? "Parts request approved" : "Parts request rejected");
      load();
      onChange();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to record decision");
    }
  };

  return (
    <Sheet open={!!jobId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-2xl flex flex-col overflow-hidden p-0" data-testid="maintenance-detail-panel">
        <SheetTitle className="sr-only">{job?.title || "Maintenance job"}</SheetTitle>
        <SheetDescription className="sr-only">Maintenance job detail, quotation, and activity</SheetDescription>
        {!job ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="border-b border-border p-6 pr-14 shrink-0 flex items-start justify-between gap-4">
              <div>
                <div className="overline">{job.vehicle_name} · {job.vehicle_plate}</div>
                <h2 className="font-display text-2xl font-bold mt-1">{job.title}</h2>
              </div>
              <button
                onClick={() => {
                  const token = localStorage.getItem("token");
                  window.open(`${API}/maintenance/${jobId}/pdf?token=${encodeURIComponent(token)}`, "_blank");
                }}
                data-testid="download-job-pdf"
                className="flex items-center gap-1 border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary shrink-0"
              >
                <DownloadSimple size={14} /> Download PDF
              </button>
            </div>
            <div className="border-b border-border px-6 flex gap-4 shrink-0">
              {["overview", "parts", "quotation", "activity"].map((t) => (
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
                    ["Estimated cost", formatMoneyFull(job.estimated_cost, currency)], ["Actual cost", formatMoneyFull(job.actual_cost, currency)],
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
              {tab === "parts" && (
                <div className="space-y-6">
                  {latestRequisition && (
                    <PartsRequisitionPanel requisition={latestRequisition} canDecide={canDecideRequisition} onDecide={decideRequisition} />
                  )}
                  {canSubmitRequisition && (
                    <div className={latestRequisition ? "border-t border-border pt-6" : ""}>
                      {latestRequisition && <div className="overline mb-3">Request more parts</div>}
                      <PartsRequisitionBuilder maintenanceId={jobId} onSubmitted={() => { load(); onChange(); }} />
                    </div>
                  )}
                </div>
              )}
              {tab === "quotation" && (
                canSubmitQuote ? (
                  <QuoteBuilder maintenanceId={jobId} currentUser={currentUser} onSubmitted={() => { load(); onChange(); }} />
                ) : latestQuote ? (
                  <QuoteApprovalPanel quote={latestQuote} canDecide={canDecide} onDecide={decide} />
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No costing has been submitted for this job yet — the Workshop Manager submits costing here.
                  </div>
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
