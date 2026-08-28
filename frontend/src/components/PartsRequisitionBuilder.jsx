import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";

const emptyLine = { part_id: "", qty_requested: 1 };

// Mirrors QuoteBuilder.jsx's shape (line-item table + submit button), but sources lines from the
// Parts catalog instead of free text — this is a "cart of parts" against one job, not an open quote.
export default function PartsRequisitionBuilder({ maintenanceId, onSubmitted }) {
  const { currency } = useCurrency();
  const [parts, setParts] = useState([]);
  const [lines, setLines] = useState([{ ...emptyLine }]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.get("/parts").then((r) => setParts(r.data || [])).catch(() => {}); }, []);

  const partMap = Object.fromEntries(parts.map((p) => [p.id, p]));
  const setLine = (i, patch) => setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((arr) => [...arr, { ...emptyLine }]);
  const removeLine = (i) => setLines((arr) => arr.filter((_, idx) => idx !== i));

  const lineTotal = (l) => {
    const part = partMap[l.part_id];
    return part ? (Number(l.qty_requested) || 0) * (Number(part.unit_cost) || 0) : 0;
  };
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);

  const submit = async () => {
    const valid = lines.filter((l) => l.part_id && Number(l.qty_requested) > 0);
    if (valid.length === 0) { toast.error("Add at least one part"); return; }
    setSubmitting(true);
    try {
      await api.post(`/maintenance/${maintenanceId}/parts-requisitions`, {
        items: valid.map((l) => ({ part_id: l.part_id, qty_requested: Number(l.qty_requested) })),
      });
      toast.success("Parts request sent to the Workshop Manager for approval");
      onSubmitted();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to submit parts request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="parts-requisition-builder">
      <div className="border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-left overline">
              <th className="p-2">Part</th>
              <th className="p-2 w-24">In stock</th>
              <th className="p-2 w-20">Qty</th>
              <th className="p-2 w-24">Total</th>
              <th className="p-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const part = partMap[l.part_id];
              const short = part && Number(l.qty_requested) > (Number(part.stock) || 0);
              return (
                <tr key={i} className="border-b border-border/50" data-testid={`requisition-line-${i}`}>
                  <td className="p-1">
                    <select value={l.part_id} onChange={(e) => setLine(i, { part_id: e.target.value })}
                      data-testid={`requisition-part-select-${i}`}
                      className="w-full bg-[#0b0b0d] border border-border px-1.5 py-1 text-xs focus:border-primary focus:outline-none">
                      <option value="">Select a part…</option>
                      {parts.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ""}</option>
                      ))}
                    </select>
                  </td>
                  <td className={`p-1 mono text-xs ${short ? "text-primary" : "text-muted-foreground"}`}>
                    {part ? (part.stock ?? 0) : "—"}
                  </td>
                  <td className="p-1">
                    <input type="number" min="0" value={l.qty_requested} onChange={(e) => setLine(i, { qty_requested: e.target.value })}
                      data-testid={`requisition-qty-${i}`}
                      className="w-full bg-[#0b0b0d] border border-border px-1.5 py-1 text-xs mono focus:border-primary focus:outline-none" />
                  </td>
                  <td className="p-1 mono text-xs">{formatMoneyFull(lineTotal(l), currency, 2)}</td>
                  <td className="p-1">
                    <button onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive"><Trash size={12} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button onClick={addLine} data-testid="add-requisition-line" className="flex items-center gap-1 text-xs uppercase tracking-widest text-primary hover:underline p-2">
          <Plus size={12} /> Add part
        </button>
        <div className="flex justify-end p-3 border-t border-border text-sm">
          <div className="font-bold">Estimated total <span className="mono ml-2 text-primary">{formatMoneyFull(total, currency, 2)}</span></div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Any quantity not currently in stock will automatically become a quote for Operations/Finance
        approval — the Workshop Manager still reviews every request either way.
      </div>

      <button onClick={submit} disabled={submitting} data-testid="submit-requisition"
        className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50">
        Send for approval
      </button>
    </div>
  );
}
