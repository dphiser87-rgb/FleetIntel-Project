import React, { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash, Paperclip, X as XIcon } from "@phosphor-icons/react";
import { api } from "@/lib/api";

const emptyItem = { type: "part", description: "", qty: 1, unit_cost: 0, vat_pct: 0 };
const MAX_ATTACHMENTS = 5;

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function QuoteBuilder({ maintenanceId, currentUser, onSubmitted }) {
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((arr) => [...arr, { ...emptyItem }]);
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const lineTotal = (it) => (Number(it.qty) || 0) * (Number(it.unit_cost) || 0) * (1 + (Number(it.vat_pct) || 0) / 100);
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_cost) || 0), 0);
  const vatTotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_cost) || 0) * ((Number(it.vat_pct) || 0) / 100), 0);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      toast.error(`You can attach at most ${MAX_ATTACHMENTS} files`);
      return;
    }
    for (const file of files) {
      const dataUrl = await fileToDataUrl(file);
      setAttachments((a) => [...a, {
        id: crypto.randomUUID(), file_name: file.name, file_type: file.type, file_size: file.size,
        uploaded_by: currentUser?.name || "", uploaded_at: new Date().toISOString(), data_url: dataUrl,
      }]);
    }
  };
  const removeAttachment = (id) => setAttachments((a) => a.filter((f) => f.id !== id));

  const submit = async () => {
    const valid = items.filter((it) => it.description.trim() && Number(it.qty) > 0);
    if (valid.length === 0) { toast.error("Add at least one line item"); return; }
    setSubmitting(true);
    try {
      await api.post(`/maintenance/${maintenanceId}/quotes`, { items: valid, attachments });
      toast.success("Quote submitted to Operations for approval");
      onSubmitted();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to submit quote");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="quote-builder">
      <div className="border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-left overline">
              <th className="p-2">Type</th>
              <th className="p-2">Description</th>
              <th className="p-2 w-16">Qty</th>
              <th className="p-2 w-24">Unit cost</th>
              <th className="p-2 w-20">VAT %</th>
              <th className="p-2 w-24">Total</th>
              <th className="p-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-border/50" data-testid={`quote-item-${i}`}>
                <td className="p-1">
                  <select value={it.type} onChange={(e) => setItem(i, { type: e.target.value })}
                    className="w-full bg-[#0b0b0d] border border-border px-1.5 py-1 text-xs focus:border-primary focus:outline-none">
                    <option value="part">Part</option>
                    <option value="labour">Labour</option>
                    <option value="other">Other</option>
                  </select>
                </td>
                <td className="p-1">
                  <input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Description"
                    className="w-full bg-[#0b0b0d] border border-border px-1.5 py-1 text-xs focus:border-primary focus:outline-none" />
                </td>
                <td className="p-1">
                  <input type="number" min="0" value={it.qty} onChange={(e) => setItem(i, { qty: e.target.value })}
                    className="w-full bg-[#0b0b0d] border border-border px-1.5 py-1 text-xs mono focus:border-primary focus:outline-none" />
                </td>
                <td className="p-1">
                  <input type="number" min="0" value={it.unit_cost} onChange={(e) => setItem(i, { unit_cost: e.target.value })}
                    className="w-full bg-[#0b0b0d] border border-border px-1.5 py-1 text-xs mono focus:border-primary focus:outline-none" />
                </td>
                <td className="p-1">
                  <input type="number" min="0" value={it.vat_pct} onChange={(e) => setItem(i, { vat_pct: e.target.value })}
                    className="w-full bg-[#0b0b0d] border border-border px-1.5 py-1 text-xs mono focus:border-primary focus:outline-none" />
                </td>
                <td className="p-1 mono text-xs">${lineTotal(it).toFixed(2)}</td>
                <td className="p-1">
                  <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive"><Trash size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addItem} data-testid="add-quote-item" className="flex items-center gap-1 text-xs uppercase tracking-widest text-primary hover:underline p-2">
          <Plus size={12} /> Add line item
        </button>
        <div className="flex justify-end gap-6 p-3 border-t border-border text-sm">
          <div>Subtotal <span className="mono ml-2">${subtotal.toFixed(2)}</span></div>
          <div>VAT <span className="mono ml-2">${vatTotal.toFixed(2)}</span></div>
          <div className="font-bold">Total <span className="mono ml-2 text-primary">${(subtotal + vatTotal).toFixed(2)}</span></div>
        </div>
      </div>

      <div>
        <div className="overline mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1"><Paperclip size={12} /> Attachments ({attachments.length}/{MAX_ATTACHMENTS})</span>
          {attachments.length < MAX_ATTACHMENTS && (
            <label className="cursor-pointer text-primary hover:underline normal-case tracking-normal text-xs" data-testid="add-attachment">
              + Add file
              <input type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          )}
        </div>
        <div className="space-y-1">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-xs border border-border px-2 py-1.5" data-testid={`attachment-row-${a.id}`}>
              <span className="truncate flex-1">{a.file_name} <span className="text-muted-foreground">· {(a.file_size / 1024).toFixed(0)} KB</span></span>
              <button onClick={() => removeAttachment(a.id)} className="text-muted-foreground hover:text-destructive shrink-0 ml-2"><XIcon size={12} /></button>
            </div>
          ))}
          {attachments.length === 0 && <div className="text-xs text-muted-foreground">No attachments yet.</div>}
        </div>
      </div>

      <button onClick={submit} disabled={submitting} data-testid="submit-quote"
        className="w-full bg-primary text-primary-foreground py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50">
        Send for approval
      </button>
    </div>
  );
}
