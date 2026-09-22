import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "@/lib/api";

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

export default function HelpTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    api.get("/support/tickets", { params: { status: status || undefined, priority: priority || undefined, category: category || undefined, search: search || undefined } })
      .then((r) => setTickets(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [status, priority, category]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight">My Tickets</h1>
          <p className="text-muted-foreground mt-1 text-sm">Support requests for your account.</p>
        </div>
        <button
          onClick={() => navigate("/help/new")}
          data-testid="tickets-new-cta"
          className="bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold flex items-center gap-2 hover:bg-primary/90"
        >
          <Plus size={15} weight="bold" /> Create Support Ticket
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ticket # or subject"
            data-testid="tickets-search" className="bg-[#0b0b0d] border border-border pl-8 pr-3 py-2 text-sm focus:border-primary focus:outline-none w-56" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="tickets-filter-status"
          className="bg-[#0b0b0d] border border-border px-2 py-2 text-sm focus:border-primary focus:outline-none">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="tickets-filter-priority"
          className="bg-[#0b0b0d] border border-border px-2 py-2 text-sm focus:border-primary focus:outline-none">
          <option value="">All priorities</option>
          {["low", "normal", "high", "critical"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="tickets-filter-category"
          className="bg-[#0b0b0d] border border-border px-2 py-2 text-sm focus:border-primary focus:outline-none">
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="bg-[#121214] border border-border" data-testid="tickets-list">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-left overline">
              <th className="p-3">Ticket</th>
              <th className="p-3">Subject</th>
              <th className="p-3">Related To</th>
              <th className="p-3">Vehicle</th>
              <th className="p-3">Status</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Created</th>
              <th className="p-3">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} onClick={() => navigate(`/help/tickets/${t.id}`)} data-testid={`ticket-row-${t.ticket_number}`}
                className="border-b border-border/50 cursor-pointer hover:bg-[#17171a]">
                <td className="p-3 mono">{t.ticket_number}</td>
                <td className="p-3 max-w-xs truncate">{t.subject}</td>
                <td className="p-3">{CATEGORY_LABEL[t.category] || t.category}{t.subcategory ? ` · ${t.subcategory}` : ""}</td>
                <td className="p-3">{t.vehicle_name ? `${t.vehicle_name}${t.vehicle_plate ? ` (${t.vehicle_plate})` : ""}` : "—"}</td>
                <td className="p-3"><span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${STATUS_COLOR[t.status] || ""}`}>{STATUS_LABEL[t.status] || t.status}</span></td>
                <td className="p-3"><span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${PRIORITY_COLOR[t.priority] || ""}`}>{t.priority}</span></td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(t.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!loading && tickets.length === 0 && <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">No tickets yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
