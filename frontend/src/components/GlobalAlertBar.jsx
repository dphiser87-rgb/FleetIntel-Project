import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

export default function GlobalAlertBar() {
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    api.get("/alerts").then((r) => setAlerts(r.data)).catch(() => {});
  }, []);

  if (!alerts || alerts.total === 0) return null;

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
      <div className="flex items-center gap-3 ml-auto flex-wrap">
        {Object.entries(alerts.buckets).filter(([, n]) => n > 0).map(([k, n]) =>
          k === "approvals" ? (
            <Link key={k} to="/maintenance?approvals=1" className="flex items-center gap-1 text-xs hover:text-primary" data-testid={`bucket-${k}`}>
              <span className="mono text-primary font-bold">{n}</span>
              <span className="text-muted-foreground">approvals</span>
            </Link>
          ) : (
            <div key={k} className="flex items-center gap-1 text-xs" data-testid={`bucket-${k}`}>
              <span className="mono text-primary font-bold">{n}</span>
              <span className="text-muted-foreground">{k.replace(/_/g, " ")}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
