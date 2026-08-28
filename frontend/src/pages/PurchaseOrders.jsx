import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Receipt, ArrowSquareOut, CurrencyCircleDollar, DownloadSimple } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { hasAccess } from "@/lib/access";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";

const STATUS_COLOR = {
  po_issued: "text-[#34C759] border-[#34C759]",
  pending_approval: "text-[#FFCC00] border-[#FFCC00]",
  paid: "text-muted-foreground border-border",
};
const FINANCE_ROLES = ["finance", "admin"];

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function PurchaseOrders() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const canCreatePO = hasAccess(user, "purchase_orders", "full");
  const canMarkPaid = FINANCE_ROLES.includes(user?.role);
  const [orders, setOrders] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ supplier: "", amount: "", notes: "" });
  const [payingPO, setPayingPO] = useState(null);
  const [proofFiles, setProofFiles] = useState([]);
  const [paying, setPaying] = useState(false);

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

  const openPay = (po) => { setPayingPO(po); setProofFiles([]); };

  const addProofFiles = async (fileList) => {
    for (const file of Array.from(fileList || [])) {
      const dataUrl = await fileToDataUrl(file);
      setProofFiles((f) => [...f, {
        id: crypto.randomUUID(), file_name: file.name, file_type: file.type, file_size: file.size,
        uploaded_by: user?.name || "", uploaded_at: new Date().toISOString(), data_url: dataUrl,
      }]);
    }
  };

  const markPaid = async () => {
    if (proofFiles.length === 0) { toast.error("Attach at least one proof-of-payment file"); return; }
    setPaying(true);
    try {
      await api.post(`/purchase-orders/${payingPO.id}/mark-paid`, { proof_of_payment: proofFiles });
      toast.success("Purchase order marked paid");
      setPayingPO(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to mark paid");
    } finally {
      setPaying(false);
    }
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
                <th className="p-3">Payment</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id} className="border-b border-border/50" data-testid={`po-${po.id}`}>
                  <td className="p-3 mono">{po.po_number}</td>
                  <td className="p-3">{po.supplier || "—"}</td>
                  <td className="p-3 mono">{formatMoneyFull(po.amount, currency, 2)}</td>
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
                  <td className="p-3">
                    {po.status === "paid" ? (
                      <div className="text-xs text-muted-foreground">
                        <div>Paid {new Date(po.paid_at).toLocaleDateString()}</div>
                        {(po.proof_of_payment || []).map((a) => (
                          <a key={a.id} href={a.data_url} download={a.file_name} className="flex items-center gap-1 text-primary hover:underline mt-0.5" data-testid={`proof-of-payment-${po.id}`}>
                            <DownloadSimple size={10} /> {a.file_name}
                          </a>
                        ))}
                      </div>
                    ) : po.status === "po_issued" && canMarkPaid ? (
                      <button onClick={() => openPay(po)} data-testid={`mark-paid-${po.id}`}
                        className="flex items-center gap-1 border border-border px-2 py-1.5 text-xs uppercase tracking-widest hover:border-[#34C759] hover:text-[#34C759]">
                        <CurrencyCircleDollar size={12} /> Mark Paid
                      </button>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-muted-foreground">No purchase orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {payingPO && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setPayingPO(null)}>
          <div className="bg-[#0b0b0d] border border-border max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()} data-testid="mark-paid-modal">
            <div>
              <div className="overline">Mark paid</div>
              <h3 className="font-display text-xl font-bold mt-1">{payingPO.po_number}</h3>
              <div className="text-sm text-muted-foreground mt-1">{formatMoneyFull(payingPO.amount, currency, 2)} to {payingPO.supplier || "supplier"}</div>
            </div>
            <div>
              <label className="overline block mb-1">Proof of payment</label>
              <label className="flex items-center gap-2 border border-dashed border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary cursor-pointer" data-testid="add-proof-of-payment">
                <DownloadSimple size={14} className="rotate-180" /> Attach file(s)
                <input type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => { addProofFiles(e.target.files); e.target.value = ""; }} />
              </label>
              <div className="space-y-1 mt-2">
                {proofFiles.map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-xs border border-border px-2 py-1.5">
                    <span className="truncate">{f.file_name}</span>
                    <button onClick={() => setProofFiles((arr) => arr.filter((x) => x.id !== f.id))} className="text-muted-foreground hover:text-destructive ml-2">×</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={markPaid} disabled={paying} data-testid="confirm-mark-paid"
                className="flex-1 bg-primary text-primary-foreground px-3 py-2 text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50">
                Confirm paid
              </button>
              <button onClick={() => setPayingPO(null)} className="border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
