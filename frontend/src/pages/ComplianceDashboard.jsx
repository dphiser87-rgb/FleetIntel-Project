import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { usePolling } from "@/hooks/use-polling";

const BREAKDOWN_COLOR = { compliant: "#34C759", due_soon: "#FFCC00", overdue: "#FF3B30", missed: "#22C55E" };
const BREAKDOWN_LABEL = { compliant: "Compliant", due_soon: "Due Soon", overdue: "Overdue", missed: "Missed" };

const scoreColor = (s) => (s >= 80 ? "text-[#34C759]" : s >= 50 ? "text-[#FFCC00]" : "text-primary");
const barColor = (s) => (s >= 80 ? "#34C759" : s >= 50 ? "#FFCC00" : "#FF3B30");

export default function ComplianceDashboard() {
  const [data, setData] = useState(null);

  const load = () => api.get("/compliance/dashboard").then(r => setData(r.data));
  useEffect(() => { load(); }, []);
  usePolling(load);

  if (!data) return <div className="noise-bg min-h-screen p-8 text-sm text-muted-foreground">Loading…</div>;

  const pieData = Object.entries(data.breakdown).filter(([, v]) => v > 0).map(([k, v]) => ({ name: BREAKDOWN_LABEL[k], key: k, value: v }));

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6">
        <div className="overline">Compliance</div>
        <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="compliance-title">Compliance Dashboard</h1>
        <div className="text-sm text-muted-foreground mt-2">Fleet-wide inspection compliance, derived from checklist scheduling and outstanding repairs</div>
      </header>

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 border border-border grid-borders" data-testid="compliance-stats">
          <div className="p-5 bg-[#121214]">
            <div className="overline">Fleet Compliance Score</div>
            <div className={`mono text-3xl font-bold mt-2 ${scoreColor(data.fleet_compliance_score)}`}>{data.fleet_compliance_score}%</div>
          </div>
          <div className="p-5 bg-[#121214]">
            <div className="overline">Missed / Overdue Inspections</div>
            <div className="mono text-3xl font-bold mt-2 text-primary">{data.missed_inspections}</div>
          </div>
          <div className="p-5 bg-[#121214]">
            <div className="overline">Outstanding Repairs</div>
            <div className="mono text-3xl font-bold mt-2 text-[#FFCC00]">{data.outstanding_repairs}</div>
          </div>
        </div>

        <div className="bg-[#121214] border border-border p-6" data-testid="compliance-breakdown">
          <div className="overline mb-4">Compliance breakdown</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                paddingAngle={2}
                label={({ cx, cy, midAngle, outerRadius, name, value, percent }) => {
                  const RADIAN = Math.PI / 180;
                  const r = outerRadius + 24;
                  const x = cx + r * Math.cos(-midAngle * RADIAN);
                  const y = cy + r * Math.sin(-midAngle * RADIAN);
                  return (
                    <text x={x} y={y} fill="#F0F1F3" fontSize={12} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
                      {`${name} ${value} (${Math.round(percent * 100)}%)`}
                    </text>
                  );
                }}
                labelLine={{ stroke: "#636366" }}
              >
                {pieData.map((d) => <Cell key={d.key} fill={BREAKDOWN_COLOR[d.key]} stroke="#0b0b0d" strokeWidth={2} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "#0b0b0d", border: "1px solid #27272a", fontFamily: "JetBrains Mono", fontSize: 12 }} />
              <Legend formatter={(value, entry) => `${value} — ${entry.payload.value}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#121214] border border-border" data-testid="vehicle-compliance-list">
          <div className="p-4 border-b border-border overline">Vehicle Compliance Status</div>
          <div className="divide-y divide-border">
            {data.vehicles.map(v => (
              <div key={v.vehicle_id} className="p-4" data-testid={`compliance-row-${v.vehicle_id}`}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <Link to={`/fleet/${v.vehicle_id}`} className="text-sm font-bold hover:text-primary">{v.vehicle_name} <span className="text-muted-foreground font-normal">· {v.vehicle_plate}</span></Link>
                  <div className={`mono text-lg font-bold ${scoreColor(v.compliance_score)}`}>{v.compliance_score}%</div>
                </div>
                <div className="h-1.5 bg-white/5 mb-2">
                  <div className="h-full" style={{ width: `${v.compliance_score}%`, background: barColor(v.compliance_score) }} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  {v.overdue_templates.length > 0 ? (
                    <span className="text-primary">Overdue: {v.overdue_templates.join(", ")}</span>
                  ) : (
                    <span className="text-[#34C759]">All checklists up to date</span>
                  )}
                  {v.outstanding_repairs > 0 && <span>· {v.outstanding_repairs} outstanding repair{v.outstanding_repairs !== 1 && "s"}</span>}
                </div>
              </div>
            ))}
            {data.vehicles.length === 0 && <div className="text-sm text-muted-foreground py-12 text-center">No vehicles in this workspace.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
