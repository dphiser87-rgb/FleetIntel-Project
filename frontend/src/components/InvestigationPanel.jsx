import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { X, ArrowDown, ArrowUp } from "@phosphor-icons/react";

const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const isMoney = (k) => /cost|price|amount|spend/i.test(k);
const isPct = (k) => /pct|percent|rate/i.test(k);

export default function InvestigationPanel({ kpiKey, onClose }) {
  const [data, setData] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    if (!kpiKey) return;
    setData(null);
    api.get(`/investigate/${kpiKey}`)
      .then(r => setData(r.data))
      .catch(() => toast.error("Unable to load investigation"));
  }, [kpiKey]);

  if (!kpiKey) return null;

  const rows = data ? [...data.rows].sort((a, b) => {
    if (!sortKey) return 0;
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") return sortDir === "desc" ? bv - av : av - bv;
    return sortDir === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
  }) : [];

  const toggleSort = (k) => {
    if (sortKey === k) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const fmtCell = (col, val) => {
    if (val == null || val === "") return <span className="text-muted-foreground">—</span>;
    if (typeof val === "number" && isMoney(col)) return money(val);
    if (typeof val === "number" && isPct(col)) return `${val}%`;
    if (typeof val === "number") return val.toLocaleString();
    return String(val);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="investigation-panel">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-[#0b0b0d] border-l border-border h-full overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="sticky top-0 z-10 bg-[#0b0b0d] border-b border-border p-6 flex items-start justify-between gap-4">
          <div>
            <div className="overline">Investigation</div>
            <h2 className="font-display font-black text-3xl tracking-tight mt-1">
              {data ? data.title : "Loading…"}
            </h2>
            {data && (
              <div className="mt-2 text-sm">
                <span className="mono text-2xl text-primary">
                  {isMoney(data.unit) || data.unit === "$" ? money(data.total) : `${data.total.toLocaleString()}${data.unit === "%" ? "%" : ""}`}
                </span>
                <span className="text-muted-foreground ml-2">{data.unit !== "$" && data.unit !== "%" ? data.unit : ""} · {rows.length} rows</span>
              </div>
            )}
          </div>
          <button onClick={onClose} data-testid="investigation-close" className="text-muted-foreground hover:text-primary p-1">
            <X size={20} />
          </button>
        </div>
        {data ? (
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr className="text-left overline">
                    {data.columns.map(c => (
                      <th key={c} className="p-2 cursor-pointer hover:text-primary" onClick={() => toggleSort(c)}>
                        <span className="flex items-center gap-1">
                          {c.replace(/_/g, " ")}
                          {sortKey === c && (sortDir === "desc" ? <ArrowDown size={10} /> : <ArrowUp size={10} />)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-[#121214]" data-testid={`row-${i}`}>
                      {data.columns.map(c => (
                        <td key={c} className={`p-2 ${isMoney(c) || typeof r[c] === "number" ? "mono" : ""}`}>{fmtCell(c, r[c])}</td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={data.columns.length} className="p-12 text-center text-muted-foreground">No underlying rows for this KPI yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-12 text-muted-foreground text-sm">Loading investigation…</div>
        )}
      </div>
    </div>
  );
}
