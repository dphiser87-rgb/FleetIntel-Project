import React, { useState } from "react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";

const STATUS_LABEL = { pending_approval: "Pending — Workshop Manager", approved: "Approved", rejected: "Rejected" };
const STATUS_COLOR = {
  pending_approval: "text-[#FFCC00] border-[#FFCC00]",
  approved: "text-[#34C759] border-[#34C759]",
  rejected: "text-primary border-primary",
};

// Mirrors QuoteApprovalPanel.jsx's shape (read-only line table + decision block). `canDecide` is
// computed by the caller from REQUISITION_APPROVER_ROLES (workshop_head/admin), same pattern as quotes.
export default function PartsRequisitionPanel({ requisition, canDecide, onDecide }) {
  const { currency } = useCurrency();
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const items = requisition.items || [];
  const total = items.reduce((s, it) => s + (Number(it.qty_requested) || 0) * (Number(it.unit_cost) || 0), 0);

  const submitReject = () => {
    if (!reason.trim()) return;
    onDecide("rejected", reason.trim());
  };

  return (
    <div className="space-y-4" data-testid="parts-requisition-panel">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${STATUS_COLOR[requisition.status] || ""}`}>
          {STATUS_LABEL[requisition.status] || requisition.status}
        </span>
        <span className="text-xs text-muted-foreground">Requested by {requisition.requested_by_name}</span>
      </div>

      <div className="border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-left overline">
              <th className="p-2">Part</th>
              <th className="p-2">Qty requested</th>
              <th className="p-2">Unit cost</th>
              <th className="p-2">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="p-2">{it.part_name}</td>
                <td className="p-2 mono">{it.qty_requested}</td>
                <td className="p-2 mono">{formatMoneyFull(it.unit_cost, currency, 2)}</td>
                <td className="p-2 mono">{formatMoneyFull((it.qty_requested || 0) * (it.unit_cost || 0), currency, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end p-3 border-t border-border text-sm">
          <div className="font-bold">Estimated total <span className="mono ml-2 text-primary">{formatMoneyFull(total, currency, 2)}</span></div>
        </div>
      </div>

      {requisition.decision && (
        <div className="border border-border p-3 text-sm" data-testid="requisition-decision">
          <div className="overline mb-1">Workshop Manager decision</div>
          <div>
            <span className={requisition.status === "approved" ? "text-[#34C759]" : "text-primary"}>
              {requisition.status}
            </span> by {requisition.decision.by_name}
            {requisition.decision.reason && <span className="text-muted-foreground"> — {requisition.decision.reason}</span>}
          </div>
          {requisition.resulting_quote_id && (
            <div className="text-muted-foreground mt-1">
              A quote was created for the out-of-stock portion — see the Quotation tab.
            </div>
          )}
        </div>
      )}

      {canDecide && (
        <div className="border-t border-border pt-4 space-y-2">
          {!showReject ? (
            <div className="flex gap-2">
              <button onClick={() => onDecide("approved", "")} data-testid="approve-requisition"
                className="flex-1 flex items-center justify-center gap-1 bg-[#34C759]/10 border border-[#34C759]/40 text-[#34C759] px-3 py-2 text-xs uppercase tracking-widest hover:bg-[#34C759] hover:text-white">
                <CheckCircle size={14} /> Approve
              </button>
              <button onClick={() => setShowReject(true)} data-testid="show-reject-requisition"
                className="flex-1 flex items-center justify-center gap-1 border border-primary/40 text-primary px-3 py-2 text-xs uppercase tracking-widest hover:bg-primary hover:text-primary-foreground">
                <XCircle size={14} /> Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for rejection (required)…" data-testid="reject-reason-requisition"
                className={`w-full bg-[#0b0b0d] border px-3 py-2 text-sm focus:outline-none ${!reason.trim() ? "border-primary" : "border-border"}`}
              />
              <div className="flex gap-2">
                <button onClick={submitReject} disabled={!reason.trim()} data-testid="confirm-reject-requisition"
                  className="flex-1 bg-primary text-primary-foreground px-3 py-2 text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
                  Confirm rejection
                </button>
                <button onClick={() => { setShowReject(false); setReason(""); }} className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
