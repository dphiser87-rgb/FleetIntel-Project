import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Wrench, TrendUp, IdentificationCard, Clock, Package, Warning, ClipboardText,
  WarningCircle, CheckCircle, WarningOctagon, Calculator, X,
} from "@phosphor-icons/react";

const BUCKET_ICON = {
  maintenance_critical: Wrench,
  cost_anomalies: TrendUp,
  license_expiring: IdentificationCard,
  pending_jobs: Clock,
  low_stock_parts: Package,
  open_incidents: Warning,
  overdue_checklists: ClipboardText,
  recent_defects: WarningCircle,
  approvals: CheckCircle,
  open_defect_reports: WarningOctagon,
  budget_overruns: Calculator,
};

const BUCKET_LINK = {
  approvals: "/maintenance?approvals=1",
  open_defect_reports: "/defects",
  budget_overruns: "/budgets",
  overdue_checklists: "/compliance",
};

export default function GlobalAlertBar() {
  const [alerts, setAlerts] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    api.get("/alerts").then((r) => setAlerts(r.data)).catch(() => {});
  }, []);

  if (!alerts || alerts.total === 0 || hidden) return null;

  return (
    <div className="bg-[#0b0b0d] border-b border-border px-8 py-3 flex items-center gap-6 flex-wrap" data-testid="live-alerts-bar">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
        <span className="text-xs uppercase tracking-widest text-primary font-bold">Live alerts</span>
      </div>
      <div className="text-sm">
        <span className="text-primary font-bold mono">{alerts.critical}</span> <span className="text-muted-foreground">critical</span> ·{" "}
        <span className="text-[#FFCC00] font-bold mono">{alerts.warnings}</span> <span className="text-muted-foreground">warnings</span> ·{" "}
        <span className="mono">{alerts.total}</span> total
      </div>
      <div className="flex items-center gap-4 ml-auto flex-wrap">
        {Object.entries(alerts.buckets).filter(([, n]) => n > 0).map(([k, n]) => {
          const Icon = BUCKET_ICON[k] || Warning;
          const content = (
            <>
              <Icon size={13} weight="bold" />
              <span className="mono text-primary font-bold">{n}</span>
              <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
            </>
          );
          return BUCKET_LINK[k] ? (
            <Link key={k} to={BUCKET_LINK[k]} className="flex items-center gap-1.5 text-xs hover:text-primary" data-testid={`bucket-${k}`}>{content}</Link>
          ) : (
            <div key={k} className="flex items-center gap-1.5 text-xs" data-testid={`bucket-${k}`}>{content}</div>
          );
        })}
        <button onClick={() => setHidden(true)} data-testid="hide-alerts-btn" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary pl-3 border-l border-border">
          <X size={12} /> Hide
        </button>
      </div>
    </div>
  );
}
