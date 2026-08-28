import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Minus, Warning, Package, Trash, DownloadSimple } from "@phosphor-icons/react";
import { api, API } from "@/lib/api";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";
import { useAuth } from "@/contexts/AuthContext";
import PartsRequisitionPanel from "@/components/PartsRequisitionPanel";

const REQUISITION_APPROVER_ROLES = ["workshop_head", "admin"];
const REQUISITION_STATUS_LABEL = { pending_approval: "Pending", approved: "Approved", rejected: "Rejected" };
const REQUISITION_STATUS_COLOR = {
  pending_approval: "text-[#FFCC00] border-[#FFCC00]",
  approved: "text-[#34C759] border-[#34C759]",
  rejected: "text-primary border-primary",
};

export default function Parts() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const [tab, setTab] = useState("inventory");
  const [parts, setParts] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [openRequisition, setOpenRequisition] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", sku: "", category: "general", stock: 0, reorder_point: 5, unit_cost: 0, supplier: "", supplier_email: "" });

  const load = () => api.get("/parts").then(r => setParts(r.data));
  useEffect(() => { load(); }, []);

  const loadRequisitions = () => api.get("/parts-requisitions").then(r => setRequisitions(r.data || [])).catch(() => {});
  useEffect(() => { if (tab === "requisitions") loadRequisitions(); }, [tab]);

  const decideRequisition = async (decision, reason) => {
    try {
      await api.post(`/parts-requisitions/${openRequisition.id}/decide`, { decision, reason });
      toast.success(decision === "approved" ? "Parts request approved" : "Parts request rejected");
      setOpenRequisition(null);
      loadRequisitions();
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to record decision");
    }
  };

  const adjust = async (p, delta) => {
    await api.post(`/parts/${p.id}/adjust`, { delta, reason: delta > 0 ? "restock" : "consume" });
    toast.success(delta > 0 ? "Stock added" : "Stock consumed");
    load();
  };

  const save = async (e) => {
    e.preventDefault();
    await api.post("/parts", { ...form, stock: Number(form.stock), reorder_point: Number(form.reorder_point), unit_cost: Number(form.unit_cost) });
    toast.success("Part added");
    setShowAdd(false);
    setForm({ name: "", sku: "", category: "general", stock: 0, reorder_point: 5, unit_cost: 0, supplier: "", supplier_email: "" });
    load();
  };

  const del = async (id) => {
    if (!window.confirm("Delete this part?")) return;
    await api.delete(`/parts/${id}`);
    toast.success("Deleted");
    load();
  };

  const lowStock = parts.filter(p => (p.stock || 0) <= (p.reorder_point || 0));
  const totalValue = parts.reduce((s, p) => s + ((p.stock || 0) * (p.unit_cost || 0)), 0);

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Inventory</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="parts-title">Parts</h1>
        </div>
        <div className="flex items-center gap-6">
          <div>
            <div className="overline">Total value</div>
            <div className="mono text-xl font-bold mt-1">{formatMoneyFull(totalValue, currency, 2)}</div>
          </div>
          <div>
            <div className="overline">Low stock</div>
            <div className={`mono text-xl font-bold mt-1 ${lowStock.length ? "text-primary" : ""}`}>{lowStock.length}</div>
          </div>
          <button data-testid="add-part-btn" onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
            <Plus size={14} weight="bold" /> Add part
          </button>
          <button data-testid="export-parts-csv" onClick={() => {
            const token = localStorage.getItem("token");
            window.open(`${API}/export/parts.csv?token=${encodeURIComponent(token)}`, "_blank");
          }} className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
            <DownloadSimple size={14} /> Export CSV
          </button>
          <label className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary cursor-pointer" data-testid="import-parts-csv">
            <DownloadSimple size={14} className="rotate-180" /> Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const text = await file.text();
              try {
                const { data } = await api.post("/import/parts", { csv: text });
                toast.success(`Imported ${data.created} part${data.created !== 1 ? "s" : ""}${data.errors.length ? ` · ${data.errors.length} error(s)` : ""}`);
                load();
              } catch { toast.error("Import failed"); }
              e.target.value = "";
            }} />
          </label>
        </div>
      </header>

      <div className="border-b border-border px-8 flex gap-4">
        {["inventory", "requisitions"].map((t) => (
          <button key={t} onClick={() => setTab(t)} data-testid={`parts-tab-${t}`}
            className={`py-3 text-xs uppercase tracking-widest border-b-2 -mb-px ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"}`}>
            {t === "inventory" ? "Inventory" : "Requisitions"}
          </button>
        ))}
      </div>

      {tab === "inventory" && showAdd && (
        <form onSubmit={save} className="border-b border-border bg-[#0d0d0f] p-6 grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="add-part-form">
          {[
            ["name", "Name", "text"], ["sku", "SKU", "text"], ["category", "Category", "text"], ["supplier", "Supplier", "text"],
            ["supplier_email", "Supplier email (for auto-reorder)", "email"],
            ["stock", "Stock", "number"], ["reorder_point", "Reorder point", "number"], ["unit_cost", "Unit cost ($)", "number"],
          ].map(([k, l, t]) => (
            <div key={k}>
              <label className="overline block mb-1">{l}</label>
              <input required={k !== "supplier" && k !== "category"} type={t} value={form[k]} onChange={(e) => setForm({...form, [k]: e.target.value})} data-testid={`part-${k}`}
                className="w-full bg-[#121214] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </div>
          ))}
          <div className="col-span-2 lg:col-span-4 flex gap-2">
            <button type="submit" data-testid="save-part" className="bg-primary px-4 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">Save part</button>
            <button type="button" onClick={() => setShowAdd(false)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">Cancel</button>
          </div>
        </form>
      )}

      {tab === "inventory" && lowStock.length > 0 && (
        <div className="bg-primary/10 border-b border-primary/40 px-8 py-3 flex items-center gap-3">
          <Warning size={18} className="text-primary" />
          <div className="text-sm">
            <span className="text-primary font-bold">{lowStock.length}</span> part{lowStock.length !== 1 && "s"} at or below reorder point.
          </div>
        </div>
      )}

      {tab === "inventory" && (
      <div className="p-8">
        <div className="bg-[#121214] border border-border" data-testid="parts-table">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left overline">
                <th className="p-3">Part</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-right">Stock</th>
                <th className="p-3 text-right">Reorder pt</th>
                <th className="p-3 text-right">Unit cost</th>
                <th className="p-3 text-right">Value</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {parts.map(p => {
                const low = (p.stock || 0) <= (p.reorder_point || 0);
                return (
                  <tr key={p.id} className={`border-b border-border/50 hover:bg-[#141416] ${low ? "bg-primary/5" : ""}`} data-testid={`part-row-${p.sku}`}>
                    <td className="p-3 flex items-center gap-2">
                      <Package size={16} className={low ? "text-primary" : "text-muted-foreground"} />
                      <span>{p.name}</span>
                      {low && <span className="text-[9px] mono uppercase tracking-widest px-1.5 py-0.5 border border-primary text-primary">Low</span>}
                    </td>
                    <td className="p-3 mono text-xs">{p.sku}</td>
                    <td className="p-3 text-xs text-muted-foreground uppercase tracking-wider">{p.category}</td>
                    <td className="p-3 text-right mono">{p.stock}</td>
                    <td className="p-3 text-right mono text-muted-foreground">{p.reorder_point}</td>
                    <td className="p-3 text-right mono">{formatMoneyFull(p.unit_cost, currency, 2)}</td>
                    <td className="p-3 text-right mono">{formatMoneyFull((p.stock || 0) * (p.unit_cost || 0), currency, 2)}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => adjust(p, 1)} data-testid={`add-stock-${p.sku}`} className="border border-border p-1 hover:border-[#34C759] hover:text-[#34C759]"><Plus size={12} /></button>
                        <button onClick={() => adjust(p, -1)} data-testid={`sub-stock-${p.sku}`} className="border border-border p-1 hover:border-primary hover:text-primary"><Minus size={12} /></button>
                        <button onClick={() => del(p.id)} className="border border-border p-1 hover:border-primary hover:text-primary"><Trash size={12} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {parts.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No parts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {tab === "requisitions" && (
        <div className="p-8">
          <div className="bg-[#121214] border border-border" data-testid="requisitions-table">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left overline">
                  <th className="p-3">Job</th>
                  <th className="p-3">Requested by</th>
                  <th className="p-3">Parts</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {requisitions.map((r) => (
                  <tr key={r.id} onClick={() => setOpenRequisition(r)} data-testid={`requisition-row-${r.id}`}
                    className="border-b border-border/50 hover:bg-[#141416] cursor-pointer">
                    <td className="p-3 mono text-xs text-muted-foreground">{r.maintenance_id?.slice(0, 8)}</td>
                    <td className="p-3">{r.requested_by_name}</td>
                    <td className="p-3 text-xs text-muted-foreground">{(r.items || []).length} item{(r.items || []).length !== 1 ? "s" : ""}</td>
                    <td className="p-3">
                      <span className={`text-[10px] mono uppercase tracking-widest px-2 py-1 border ${REQUISITION_STATUS_COLOR[r.status] || ""}`}>
                        {REQUISITION_STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {requisitions.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No parts requests yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openRequisition && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setOpenRequisition(null)}>
          <div className="bg-[#0b0b0d] border border-border max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()} data-testid="requisition-modal">
            <PartsRequisitionPanel
              requisition={openRequisition}
              canDecide={openRequisition.status === "pending_approval" && REQUISITION_APPROVER_ROLES.includes(user?.role)}
              onDecide={decideRequisition}
            />
          </div>
        </div>
      )}
    </div>
  );
}
