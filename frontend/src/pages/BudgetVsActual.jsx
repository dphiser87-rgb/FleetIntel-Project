import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { FloppyDisk } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { hasAccess } from "@/lib/access";
import { useCurrency } from "@/lib/CurrencyContext";
import { formatMoneyFull } from "@/lib/currency";

const STATUS_LABEL = { on_track: "On Track", near_limit: "Near Limit", over_budget: "Over Budget" };
const STATUS_COLOR = {
  on_track: "border-[#34C759] text-[#34C759] bg-[#34C759]/10",
  near_limit: "border-[#FFCC00] text-[#FFCC00] bg-[#FFCC00]/10",
  over_budget: "border-primary text-primary bg-primary/10",
};

export default function BudgetVsActual() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const canEdit = hasAccess(user, "reports", "full");
  const year = new Date().getFullYear();
  const [data, setData] = useState(null);
  const [edits, setEdits] = useState({});

  const load = () => api.get("/budgets/summary", { params: { year } }).then(r => setData(r.data));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- year is fixed per page load, load() is re-created but stable in intent
  useEffect(() => { load(); }, []);

  const save = async () => {
    const rows = Object.entries(edits).map(([category, amount]) => ({ category, year, amount: Number(amount) || 0 }));
    if (rows.length === 0) return;
    try {
      await api.put("/budgets", rows);
      toast.success("Budgets updated");
      setEdits({});
      load();
    } catch { toast.error("Failed to save budgets"); }
  };

  if (!data) return <div className="noise-bg min-h-screen p-8 text-sm text-muted-foreground">Loading…</div>;

  const utilization = data.ytd_budget > 0 ? Math.round((data.ytd_actual / data.ytd_budget) * 100) : 0;
  const overruns = data.categories.filter(c => c.status === "over_budget");
  const monthlyBudgetLine = data.ytd_budget / 12;

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="overline">Finance · {year}</div>
          <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="budget-title">Budget vs Actual</h1>
          <div className="text-sm text-muted-foreground mt-2">Compare planned maintenance budgets against actual spend by category</div>
        </div>
        {canEdit && Object.keys(edits).length > 0 && (
          <button onClick={save} data-testid="save-budgets-btn" className="flex items-center gap-2 bg-primary px-4 py-2.5 text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90">
            <FloppyDisk size={14} weight="bold" /> Save budgets
          </button>
        )}
      </header>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 border border-border grid-borders" data-testid="budget-stats">
          {[["YTD Budget", formatMoneyFull(data.ytd_budget, currency), "text-foreground"], ["YTD Actual", formatMoneyFull(data.ytd_actual, currency), "text-foreground"],
            ["Total Variance", formatMoneyFull(data.ytd_actual - data.ytd_budget, currency), data.ytd_actual > data.ytd_budget ? "text-primary" : "text-[#34C759]"],
            ["Budget Utilisation", `${utilization}%`, utilization > 100 ? "text-primary" : "text-foreground"]].map(([l, v, cls]) => (
            <div key={l} className="p-5 bg-[#121214]">
              <div className="overline">{l}</div>
              <div className={`mono text-xl font-bold mt-2 ${cls}`}>{v}</div>
            </div>
          ))}
        </div>

        {overruns.length > 0 && (
          <div className="border border-primary/40 bg-primary/5 p-4" data-testid="overrun-banner">
            <div className="text-xs uppercase tracking-widest text-primary font-bold mb-2">Budget overruns detected</div>
            <div className="flex gap-4 flex-wrap text-sm">
              {overruns.map(c => (
                <div key={c.category} className="text-primary">
                  {c.category} <span className="mono">+{formatMoneyFull(c.variance, currency)} over budget</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[#121214] border border-border p-6">
          <div className="overline mb-4">Monthly actual spend</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.monthly}>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <YAxis stroke="#636366" tick={{ fontSize: 11, fontFamily: "JetBrains Mono" }} />
              <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontFamily: "JetBrains Mono", fontSize: 12 }} />
              <Bar dataKey="actual" fill="#34C759" />
              {monthlyBudgetLine > 0 && <ReferenceLine y={monthlyBudgetLine} stroke="#FFCC00" strokeDasharray="5 3" label={{ value: "Monthly budget", fill: "#FFCC00", fontSize: 10 }} />}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#121214] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border">
                {["Category", "Budget", "Actual", "Variance", "Utilisation", "Status"].map(h => (
                  <th key={h} className="overline px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.categories.map(c => (
                <tr key={c.category} className="border-b border-border/50" data-testid={`budget-row-${c.category}`}>
                  <td className="px-4 py-3 font-semibold capitalize">{c.category}</td>
                  <td className="px-4 py-3 mono">
                    {canEdit ? (
                      <input type="number" min="0" defaultValue={c.budget} data-testid={`budget-input-${c.category}`}
                        onChange={(e) => setEdits({ ...edits, [c.category]: e.target.value })}
                        className="w-28 bg-[#0b0b0d] border border-border px-2 py-1 text-sm focus:border-primary focus:outline-none" />
                    ) : formatMoneyFull(c.budget, currency)}
                  </td>
                  <td className="px-4 py-3 mono">{formatMoneyFull(c.actual, currency)}</td>
                  <td className={`px-4 py-3 mono ${c.variance > 0 ? "text-primary" : "text-[#34C759]"}`}>{c.variance > 0 ? "+" : ""}{formatMoneyFull(c.variance, currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-white/5">
                        <div className="h-full" style={{ width: `${Math.min(100, c.utilization)}%`, background: c.status === "over_budget" ? "#FF3B30" : c.status === "near_limit" ? "#FFCC00" : "#34C759" }} />
                      </div>
                      <span className="mono text-xs">{c.utilization}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] mono uppercase tracking-widest px-2 py-0.5 border ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
