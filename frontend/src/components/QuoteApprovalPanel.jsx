import React, { useState } from "react";
import { CheckCircle, XCircle, Paperclip, DownloadSimple } from "@phosphor-icons/react";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const STAGE_LABEL = {
  pending_ops: "Pending — Operations",
  pending_finance: "Pending — Finance",
  approved: "Approved",
  rejected: "Rejected",
};
const STAGE_COLOR = {
  pending_ops: "text-[#FFCC00] border-[#FFCC00]",
  pending_finance: "text-[#FFCC00] border-[#FFCC00]",
  approved: "text-[#34C759] border-[#34C759]",
  rejected: "text-primary border-primary",
};

// Shared read-only quote view + decision action block, used by both the Operations Manager and
// Finance review steps — which actions render (or whether any do) is driven entirely by `canDecide`.
export default function QuoteApprovalPanel({ quote, canDecide, onDecide }) {
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const items = quote.items || [];
  const attachments = quote.attachments || [];

  const submitReject = () => {
    if (!reason.trim()) return;
    onDecide("rejected", reason.trim());
  };

  return (
    <div className="space-y-4" data-testid="quote-approval-panel">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${STAGE_COLOR[quote.stage] || ""}`}>
          {STAGE_LABEL[quote.stage] || quote.stage}
        </span>
        <span className="text-xs text-muted-foreground">Submitted by {quote.submitted_by_name}</span>
      </div>

      <div className="border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-left overline">
              <th className="p-2">Type</th>
              <th className="p-2">Description</th>
              <th className="p-2">Qty</th>
              <th className="p-2">Unit cost</th>
              <th className="p-2">VAT</th>
              <th className="p-2">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="p-2 text-xs uppercase text-muted-foreground">{it.type}</td>
                <td className="p-2">{it.description}</td>
                <td className="p-2 mono">{it.qty}</td>
                <td className="p-2 mono">{money(it.unit_cost)}</td>
                <td className="p-2 mono">{it.vat_pct}%</td>
                <td className="p-2 mono">{money(it.qty * it.unit_cost * (1 + it.vat_pct / 100))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end gap-6 p-3 border-t border-border text-sm">
          <div>Subtotal <span className="mono ml-2">{money(quote.subtotal)}</span></div>
          <div>VAT <span className="mono ml-2">{money(quote.vat_total)}</span></div>
          <div className="font-bold">Total <span className="mono ml-2 text-primary">{money(quote.total)}</span></div>
        </div>
      </div>

      {attachments.length > 0 && (
        <div>
          <div className="overline mb-2 flex items-center gap-1"><Paperclip size={12} /> Attachments ({attachments.length})</div>
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((a) => (
              <div key={a.id} className="border border-border p-2" data-testid={`quote-attachment-${a.id}`}>
                {a.file_type?.startsWith("image/") ? (
                  <img src={a.data_url} alt={a.file_name} className="w-full h-20 object-cover mb-1" />
                ) : (
                  <a href={a.data_url} download={a.file_name} className="flex items-center gap-1 text-xs text-primary hover:underline mb-1">
                    <DownloadSimple size={12} /> Open file
                  </a>
                )}
                <div className="text-[10px] text-muted-foreground truncate">{a.file_name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {quote.ops_decision && (
        <div className="border border-border p-3 text-sm" data-testid="ops-decision">
          <div className="overline mb-1">Operations decision</div>
          <div>
            <span className={quote.ops_decision.decision === "approved" ? "text-[#34C759]" : "text-primary"}>
              {quote.ops_decision.decision}
            </span> by {quote.ops_decision.by_name}
            {quote.ops_decision.reason && <span className="text-muted-foreground"> — {quote.ops_decision.reason}</span>}
          </div>
        </div>
      )}

      {quote.finance_decision && (
        <div className="border border-border p-3 text-sm" data-testid="finance-decision">
          <div className="overline mb-1">Finance decision</div>
          <div>
            <span className={quote.finance_decision.decision === "approved" ? "text-[#34C759]" : "text-primary"}>
              {quote.finance_decision.decision}
            </span> by {quote.finance_decision.by_name}
            {quote.finance_decision.reason && <span className="text-muted-foreground"> — {quote.finance_decision.reason}</span>}
          </div>
        </div>
      )}

      {canDecide && (
        <div className="border-t border-border pt-4 space-y-2">
          {!showReject ? (
            <div className="flex gap-2">
              <button onClick={() => onDecide("approved", "")} data-testid="approve-quote"
                className="flex-1 flex items-center justify-center gap-1 bg-[#34C759]/10 border border-[#34C759]/40 text-[#34C759] px-3 py-2 text-xs uppercase tracking-widest hover:bg-[#34C759] hover:text-white">
                <CheckCircle size={14} /> Approve
              </button>
              <button onClick={() => setShowReject(true)} data-testid="show-reject-quote"
                className="flex-1 flex items-center justify-center gap-1 border border-primary/40 text-primary px-3 py-2 text-xs uppercase tracking-widest hover:bg-primary hover:text-primary-foreground">
                <XCircle size={14} /> Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for rejection (required)…" data-testid="reject-reason"
                className={`w-full bg-[#0b0b0d] border px-3 py-2 text-sm focus:outline-none ${!reason.trim() ? "border-primary" : "border-border"}`}
              />
              <div className="flex gap-2">
                <button onClick={submitReject} disabled={!reason.trim()} data-testid="confirm-reject-quote"
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
