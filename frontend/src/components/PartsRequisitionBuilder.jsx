import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash, MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";

const emptyLine = { part_id: "", qty_requested: 1 };

// No existing searchable-combobox pattern in this codebase to reuse (components/ui/command.jsx is
// scaffolded but unused anywhere) -- a small self-contained search+list replaces the plain <select>,
// which becomes unusable to scroll through once a workspace has a real-sized parts catalog.
function PartSearchSelect({ parts, value, onChange, testId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);
  const selected = parts.find((p) => p.id === value);

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = parts.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
  });

  return (
    <div className="relative" ref={wrapRef} data-testid={testId}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(""); }}
        className="w-full flex items-center justify-between gap-1 bg-[#0b0b0d] border border-border px-1.5 py-1 text-xs text-left focus:border-primary focus:outline-none"
      >
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? `${selected.name}${selected.sku ? ` (${selected.sku})` : ""}` : "Select a part…"}
        </span>
        <MagnifyingGlass size={12} className="text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-64 max-h-64 overflow-y-auto bg-[#121214] border border-border shadow-lg">
          <div className="p-1.5 border-b border-border sticky top-0 bg-[#121214]">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search parts…"
              className="w-full bg-[#0b0b0d] border border-border px-2 py-1 text-xs focus:border-primary focus:outline-none"
            />
          </div>
          {filtered.length === 0 && <div className="p-2 text-xs text-muted-foreground">No parts match.</div>}
          {filtered.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => { onChange(p.id); setOpen(false); }}
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-primary/10 hover:text-primary flex items-center justify-between gap-2"
            >
              <span>{p.name} {p.sku ? <span className="text-muted-foreground">({p.sku})</span> : ""}</span>
              <span className="mono text-muted-foreground shrink-0">{p.stock ?? 0} in stock</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
                    <PartSearchSelect
                      parts={parts}
                      value={l.part_id}
                      onChange={(id) => setLine(i, { part_id: id })}
                      testId={`requisition-part-select-${i}`}
                    />
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
