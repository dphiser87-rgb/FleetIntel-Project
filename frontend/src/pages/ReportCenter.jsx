import React, { useEffect, useMemo, useState } from "react";
import { api, API, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Plus, DownloadSimple, Trash, PencilSimple, ArrowUp, ArrowDown, Eye, X } from "@phosphor-icons/react";
import { usePolling } from "@/hooks/use-polling";

const FILE_TYPES = [
  { value: "pdf", label: "PDF" },
  { value: "csv", label: "CSV" },
];

function ColumnPicker({ allColumns, selected, onChange }) {
  const selectedCols = selected.map((k) => allColumns.find((c) => c.key === k)).filter(Boolean);
  const unselectedCols = allColumns.filter((c) => !selected.includes(c.key));

  const remove = (key) => onChange(selected.filter((k) => k !== key));
  const add = (key) => onChange([...selected, key]);
  const move = (idx, dir) => {
    const next = [...selected];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Columns (order matters)</label>
      <div className="border border-border divide-y divide-border/50">
        {selectedCols.map((c, i) => (
          <div key={c.key} className="flex items-center gap-2 px-3 py-2" data-testid={`report-col-${c.key}`}>
            <input type="checkbox" checked readOnly onClick={() => remove(c.key)} className="cursor-pointer" />
            <span className="text-sm flex-1">{c.label}</span>
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowUp size={14} /></button>
            <button type="button" disabled={i === selectedCols.length - 1} onClick={() => move(i, 1)} className="text-muted-foreground hover:text-primary disabled:opacity-30"><ArrowDown size={14} /></button>
          </div>
        ))}
        {unselectedCols.map((c) => (
          <label key={c.key} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#141416]" data-testid={`report-col-${c.key}`}>
            <input type="checkbox" checked={false} onChange={() => add(c.key)} />
            <span className="text-sm text-muted-foreground">{c.label}</span>
          </label>
        ))}
      </div>
      {selectedCols.length === 0 && <div className="text-xs text-[#FF3B30] mt-1.5">Pick at least one column.</div>}
    </div>
  );
}

function FilterFields({ typeDef, filters, onChange, vehicles }) {
  if (!typeDef) return null;
  const set = (key, val) => onChange({ ...filters, [key]: val });
  return (
    <div className="space-y-3">
      {typeDef.filters.map((f) => {
        if (f.key === "start" || f.key === "end") {
          return (
            <div key={f.key}>
              <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">{f.label}</label>
              <input type="date" value={filters[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} data-testid={`report-filter-${f.key}`}
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </div>
          );
        }
        if (f.key === "vehicle_id") {
          return (
            <div key={f.key}>
              <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">{f.label}</label>
              <select value={filters.vehicle_id || ""} onChange={(e) => set("vehicle_id", e.target.value || undefined)} data-testid="report-filter-vehicle_id"
                className="w-full bg-[#0b0b0d] border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none">
                <option value="">All vehicles</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.plate})</option>)}
              </select>
            </div>
          );
        }
        if (f.key === "year") {
          return (
            <div key={f.key}>
              <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">{f.label}</label>
              <input type="number" value={filters.year || new Date().getFullYear()} onChange={(e) => set("year", Number(e.target.value))} data-testid="report-filter-year"
                className="w-32 bg-[#0b0b0d] border border-border px-3 py-2 text-sm mono focus:border-primary focus:outline-none" />
            </div>
          );
        }
        return null;
      })}
      {typeDef.filters.length === 0 && <div className="text-xs text-muted-foreground">No filters for this report type.</div>}
    </div>
  );
}

export default function ReportCenter() {
  const [types, setTypes] = useState([]);
  const [definitions, setDefinitions] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [mode, setMode] = useState(null); // null | "picker" | "editor"
  const [editing, setEditing] = useState(null); // existing definition being edited, or null for new
  const [form, setForm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get("/reports/definitions").then((r) => setDefinitions(r.data || [])).catch(() => {});
  };
  useEffect(() => {
    api.get("/reports/types").then((r) => setTypes(r.data || [])).catch(() => {});
    api.get("/vehicles").then((r) => setVehicles(r.data || [])).catch(() => {});
    load();
  }, []);
  usePolling(load);

  const typeByKey = useMemo(() => Object.fromEntries(types.map((t) => [t.key, t])), [types]);

  const startNew = () => setMode("picker");

  const pickType = (typeKey) => {
    const t = typeByKey[typeKey];
    setEditing(null);
    setForm({ name: t.label, report_type: typeKey, file_type: "pdf", page_format: "portrait", columns: t.default_columns, filters: {} });
    setPreview(null);
    setMode("editor");
  };

  const openEdit = (def) => {
    setEditing(def);
    setForm({ name: def.name, report_type: def.report_type, file_type: def.file_type, page_format: def.page_format || "portrait",
      columns: def.columns?.length ? def.columns : typeByKey[def.report_type]?.default_columns || [], filters: def.filters || {} });
    setPreview(null);
    setMode("editor");
  };

  const close = () => { setMode(null); setEditing(null); setForm(null); setPreview(null); };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const { data } = await api.post("/reports/preview", { report_type: form.report_type, columns: form.columns, filters: form.filters });
      setPreview(data);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Preview failed"); }
    finally { setPreviewing(false); }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.columns.length === 0) { toast.error("Pick at least one column"); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/reports/definitions/${editing.id}`, form);
        toast.success("Report updated");
      } else {
        await api.post("/reports/definitions", form);
        toast.success("Report saved");
      }
      load();
      close();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to save"); }
    finally { setSaving(false); }
  };

  const remove = async (def) => {
    if (!window.confirm(`Delete "${def.name}"?`)) return;
    await api.delete(`/reports/definitions/${def.id}`);
    toast.success("Report deleted");
    load();
  };

  const download = (def, format) => {
    const token = localStorage.getItem("token");
    const url = `${API}/reports/definitions/${def.id}/download?format=${format || def.file_type}&token=${encodeURIComponent(token)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Analytics</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="report-center-title">Report Center</h1>
        </div>
        <button onClick={startNew} data-testid="new-report-btn" className="flex items-center gap-2 bg-primary px-3 py-2 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
          <Plus size={14} weight="bold" /> New report
        </button>
      </header>

      <div className="p-8">
        <div className="bg-[#121214] border border-border" data-testid="report-list">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr className="text-left overline">
                <th className="p-3">Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Format</th>
                <th className="p-3">Columns</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((d) => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-[#141416]" data-testid={`report-row-${d.id}`}>
                  <td className="p-3 cursor-pointer" onClick={() => openEdit(d)}>{d.name}</td>
                  <td className="p-3 text-muted-foreground">{typeByKey[d.report_type]?.label || d.report_type}</td>
                  <td className="p-3"><span className="overline">{d.file_type}</span></td>
                  <td className="p-3 text-muted-foreground">{(d.columns || []).length} column(s)</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-3">
                      <button onClick={() => download(d)} data-testid={`download-report-${d.id}`} title="Download" className="text-muted-foreground hover:text-primary"><DownloadSimple size={16} /></button>
                      <button onClick={() => openEdit(d)} title="Edit" className="text-muted-foreground hover:text-primary"><PencilSimple size={16} /></button>
                      <button onClick={() => remove(d)} data-testid={`delete-report-${d.id}`} title="Delete" className="text-muted-foreground hover:text-[#FF3B30]"><Trash size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {definitions.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No saved reports yet. Click "New report" to build one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Type picker */}
      <Sheet open={mode === "picker"} onOpenChange={(o) => !o && close()}>
        <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-xl overflow-y-auto" data-testid="report-type-picker">
          <SheetTitle className="font-display text-2xl font-bold">Which report would you like?</SheetTitle>
          <SheetDescription className="sr-only">Pick a report type to configure</SheetDescription>
          <div className="mt-6 divide-y divide-border/50 border border-border">
            {types.map((t) => (
              <button key={t.key} onClick={() => pickType(t.key)} data-testid={`report-type-${t.key}`}
                className="w-full text-left px-4 py-3 hover:bg-[#141416]">
                <div className="text-sm font-bold">{t.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Editor */}
      <Sheet open={mode === "editor"} onOpenChange={(o) => !o && close()}>
        <SheetContent side="right" className="border-border bg-[#0b0b0d] w-full sm:max-w-2xl flex flex-col overflow-hidden p-0" data-testid="report-editor">
          {form && (
            <>
              <div className="border-b border-border px-6 py-4 shrink-0">
                <SheetTitle className="font-display text-xl font-bold">{typeByKey[form.report_type]?.label}</SheetTitle>
                <SheetDescription className="sr-only">Configure and save this report</SheetDescription>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="report-name-input"
                    className="w-full bg-[#121214] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">File type</label>
                    <div className="flex gap-2">
                      {FILE_TYPES.map((f) => (
                        <button key={f.value} type="button" onClick={() => setForm({ ...form, file_type: f.value })} data-testid={`report-filetype-${f.value}`}
                          className={`px-3 py-1.5 text-xs uppercase tracking-widest border ${form.file_type === f.value ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {form.file_type === "pdf" && (
                    <div>
                      <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5 block">Page format</label>
                      <div className="flex gap-2">
                        {["portrait", "landscape"].map((p) => (
                          <button key={p} type="button" onClick={() => setForm({ ...form, page_format: p })} data-testid={`report-pageformat-${p}`}
                            className={`px-3 py-1.5 text-xs uppercase tracking-widest border capitalize ${form.page_format === p ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="overline mb-2">Filters</div>
                  <FilterFields typeDef={typeByKey[form.report_type]} filters={form.filters} onChange={(f) => setForm({ ...form, filters: f })} vehicles={vehicles} />
                </div>

                <ColumnPicker allColumns={typeByKey[form.report_type]?.columns || []} selected={form.columns} onChange={(cols) => setForm({ ...form, columns: cols })} />

                <div className="border-t border-border pt-4">
                  <button onClick={runPreview} disabled={previewing} data-testid="report-preview-btn"
                    className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary disabled:opacity-60">
                    <Eye size={14} /> {previewing ? "Loading…" : "Preview"}
                  </button>
                  {preview && (
                    <div className="mt-4 border border-border overflow-x-auto" data-testid="report-preview-table">
                      <table className="w-full text-xs">
                        <thead className="border-b border-border bg-[#141416]">
                          <tr>{preview.columns.map((c) => <th key={c.key} className="p-2 text-left overline">{c.label}</th>)}</tr>
                        </thead>
                        <tbody>
                          {preview.rows.map((r, i) => (
                            <tr key={i} className="border-b border-border/50">
                              {preview.columns.map((c) => <td key={c.key} className="p-2">{String(r[c.key] ?? "")}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="p-2 text-xs text-muted-foreground border-t border-border">
                        Showing {preview.rows.length} of {preview.total} row(s)
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="border-t border-border p-4 flex gap-2 shrink-0">
                <button onClick={save} disabled={saving} data-testid="save-report-btn"
                  className="bg-primary text-primary-foreground px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60">
                  {saving ? "Saving…" : editing ? "Save changes" : "Save report"}
                </button>
                {editing && (
                  <button onClick={() => download(editing, form.file_type)} data-testid="editor-download-btn"
                    className="flex items-center gap-2 border border-border px-4 py-2.5 text-xs uppercase tracking-widest hover:border-primary hover:text-primary">
                    <DownloadSimple size={14} /> Download
                  </button>
                )}
                <button onClick={close} className="flex items-center gap-1 ml-auto text-xs uppercase tracking-widest text-muted-foreground hover:text-white">
                  <X size={14} /> Cancel
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
