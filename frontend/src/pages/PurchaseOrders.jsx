import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Receipt, ArrowSquareOut } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { hasAccess } from "@/lib/access";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const STATUS_COLOR = {
  po_issued: "text-[#34C759] border-[#34C759]",
  pending_approval: "text-[#FFCC00] border-[#FFCC00]",
};

export default function PurchaseOrders() {
  const { user } = useAuth();
  const canCreatePO = hasAccess(user, "purchase_orders", "full");
  const [orders, setOrders] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ supplier: "", amount: "", notes: "" });

  const load = () => api.get("/purchase-orders").then((r) => setOrders(r.data || []));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/purchase-orders", { ...form, amount: Number(form.amount) || 0 });
      toast.success("Purchase order created");
      setShowNew(false);
      setForm({ supplier: "", amount: "", notes: "" });
      load();
    } catch { toast.error("Failed to create purchase order"); }
  };

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Procurement</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="po-title">Purchase Orders</h1>
        </div>
        {canCreatePO && (
          <button onClick={() => setShowNew(!showNew)} data-testid="new-po-btn" className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
            <Plus size={14} weight="bold" /> Create PO
          </button>
        )}
      </header>

      {showNew && (
        <form onSubmit={create} className="border-b border-border bg-[#0d0d0f] p-6 grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="new-po-form">
          <div>
            <label className="overline block mb-1">Supplier</label>
            <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="overline block mb-1">Amount</label>
            <input required type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="col-span-2">
            <label className="overline block mb-1">Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="col-span-2 lg:col-span-4 flex gap-2">
            <button type="submit" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Save</button>
            <button type="button" onClick={() => setShowNew(false)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
          </div>
        </form>
      )}

      <div className="p-8">
        <div className="bg-[#121214] border border-border" data-testid="po-list">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left overline">
                <th className="p-3">PO Number</th>
                <th className="p-3">Supplier</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Source</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id} className="border-b border-border/50" data-testid={`po-${po.id}`}>
                  <td className="p-3 mono">{po.po_number}</td>
                  <td className="p-3">{po.supplier || "—"}</td>
                  <td className="p-3 mono">{money(po.amount)}</td>
                  <td className="p-3">
                    <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${STATUS_COLOR[po.status] || ""}`}>{(po.status || "").replace("_", " ")}</span>
                  </td>
                  <td className="p-3">
                    {po.maintenance_id ? (
                      <Link to={`/maintenance?job=${po.maintenance_id}`} className="flex items-center gap-1 text-primary hover:underline text-xs" data-testid={`po-source-${po.id}`}>
                        <Receipt size={12} /> From Workshop Job <ArrowSquareOut size={10} />
                      </Link>
                    ) : <span className="text-muted-foreground text-xs">Manual</span>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(po.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">No purchase orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
