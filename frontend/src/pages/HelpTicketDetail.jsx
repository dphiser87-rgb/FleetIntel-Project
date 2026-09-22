import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Paperclip, X as XIcon, PaperPlaneTilt, ClockCounterClockwise, Truck } from "@phosphor-icons/react";
import { api, formatApiErrorDetail } from "@/lib/api";

const STATUS_LABEL = { open: "Open", in_progress: "In Progress", waiting_on_customer: "Waiting on Customer", resolved: "Resolved", closed: "Closed" };
const STATUS_COLOR = {
  open: "text-[#3B82F6] border-[#3B82F6]",
  in_progress: "text-[#FFCC00] border-[#FFCC00]",
  waiting_on_customer: "text-[#A855F7] border-[#A855F7]",
  resolved: "text-[#34C759] border-[#34C759]",
  closed: "text-muted-foreground border-border",
};
const PRIORITY_COLOR = { low: "text-muted-foreground border-border", normal: "text-[#3B82F6] border-[#3B82F6]", high: "text-[#FFCC00] border-[#FFCC00]", critical: "text-[#FF3B30] border-[#FF3B30]" };
const CATEGORY_LABEL = { account: "Account", vehicle: "Vehicle", billing: "Billing", reports_data: "Reports & Data", mobile_app: "Mobile App", other: "Other" };

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function HelpTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);

  // Block body, not an implicit-return arrow expression -- useEffect(load, deps) below calls this
  // directly as the effect function, and an effect whose return value isn't undefined/a cleanup
  // function throws "destroy is not a function" on unmount. An implicit-return chain here would
  // return the fetch's Promise itself.
  const load = () => { api.get(`/support/tickets/${id}`).then((r) => setTicket(r.data)).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const feed = useMemo(() => {
    if (!ticket) return [];
    const items = [
      ...ticket.messages.map((m) => ({ kind: "message", ...m })),
      ...ticket.activity.map((a) => ({ kind: "activity", ...a })),
    ];
    return items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [ticket]);

  const ticketAttachments = (ticket?.attachments || []).filter((a) => !a.message_id);
  const attachmentsFor = (messageId) => (ticket?.attachments || []).filter((a) => a.message_id === messageId);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (attachments.length + files.length > 5) { toast.error("You can attach at most 5 files"); return; }
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      setAttachments((a) => [...a, { id: crypto.randomUUID(), file_name: file.name, file_type: file.type, file_size: file.size, uploaded_by: "", uploaded_at: new Date().toISOString(), data_url: dataUrl }]);
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/support/tickets/${id}/messages`, { body: reply.trim(), attachments });
      setReply(""); setAttachments([]);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!ticket) return <div className="p-8 text-muted-foreground">Ticket not found.</div>;

  return (
    <div className="p-8 max-w-3xl">
      <button onClick={() => navigate("/help/tickets")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-white mb-6" data-testid="ticket-detail-back">
        <ArrowLeft size={15} /> My Tickets
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mono text-xs text-muted-foreground">{ticket.ticket_number}</div>
          <h1 className="font-display text-2xl font-black tracking-tight mt-1">{ticket.subject}</h1>
        </div>
        <div className="flex gap-2 shrink-0">
          <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${STATUS_COLOR[ticket.status] || ""}`}>{STATUS_LABEL[ticket.status] || ticket.status}</span>
          <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${PRIORITY_COLOR[ticket.priority] || ""}`}>{ticket.priority}</span>
        </div>
      </div>

      <div className="bg-[#121214] border border-border p-5 mt-6 grid grid-cols-2 gap-4 text-sm">
        <div><div className="overline mb-1">Category</div>{CATEGORY_LABEL[ticket.category] || ticket.category}{ticket.subcategory ? ` · ${ticket.subcategory}` : ""}</div>
        {ticket.vehicle && (
          <div>
            <div className="overline mb-1">Vehicle</div>
            <div className="flex items-center gap-1.5"><Truck size={14} className="text-primary" /> {ticket.vehicle.name}{ticket.vehicle.plate ? ` (${ticket.vehicle.plate})` : ""}</div>
          </div>
        )}
        <div><div className="overline mb-1">Created</div>{new Date(ticket.created_at).toLocaleString()}</div>
        <div><div className="overline mb-1">Last Updated</div>{new Date(ticket.updated_at).toLocaleString()}</div>
      </div>

      <div className="mt-6">
        <div className="overline mb-2">Description</div>
        <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        {ticketAttachments.length > 0 && (
          <div className="mt-3 space-y-1">
            {ticketAttachments.map((a) => (
              <a key={a.id} href={a.data_url} download={a.file_name} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <Paperclip size={12} /> {a.file_name}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <div className="overline mb-3 flex items-center gap-1.5"><ClockCounterClockwise size={13} /> Activity</div>
        <div className="space-y-3">
          {feed.map((item) => item.kind === "activity" ? (
            <div key={item.id} className="text-xs text-muted-foreground pl-3 border-l-2 border-border">
              {item.event_type === "created" ? "Ticket created" : `Status changed from ${(item.old_value || "").replace("_", " ")} to ${(item.new_value || "").replace("_", " ")}`}
              {" · "}{new Date(item.created_at).toLocaleString()}
            </div>
          ) : (
            <div key={item.id} className={`p-3 border ${item.author_type === "support" ? "bg-primary/5 border-primary/30" : "bg-[#121214] border-border"}`} data-testid={`ticket-message-${item.id}`}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold">{item.author_type === "support" ? (item.author_name || "FleetIntel Support") : (item.author_name || "You")}</span>
                <span className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{item.body}</p>
              {attachmentsFor(item.id).map((a) => (
                <a key={a.id} href={a.data_url} download={a.file_name} className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1.5">
                  <Paperclip size={12} /> {a.file_name}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-6">
        <textarea
          value={reply} onChange={(e) => setReply(e.target.value)} rows={3}
          placeholder="Add a reply…" data-testid="ticket-reply-input"
          className="w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <label className="cursor-pointer text-primary hover:underline text-xs flex items-center gap-1" data-testid="ticket-reply-attach">
            <Paperclip size={12} /> Attach file
            <input type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <button onClick={sendReply} disabled={sending || !reply.trim()} data-testid="ticket-reply-send"
            className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50">
            <PaperPlaneTilt size={14} /> {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs border border-border px-2 py-1.5">
                <span className="truncate">{a.file_name}</span>
                <button onClick={() => setAttachments((arr) => arr.filter((f) => f.id !== a.id))} className="text-muted-foreground hover:text-white"><XIcon size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
