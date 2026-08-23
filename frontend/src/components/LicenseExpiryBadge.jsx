import React from "react";
import { Warning } from "@phosphor-icons/react";

export default function LicenseExpiryBadge({ expiry, warningDays = 30 }) {
  if (!expiry) return <span className="text-muted-foreground text-xs">—</span>;
  const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0) {
    return (
      <span className="flex items-center gap-1 text-[10px] mono uppercase tracking-widest px-2 py-1 border border-primary text-primary bg-primary/10" data-testid="license-badge-overdue">
        <Warning size={10} /> +{Math.abs(days)}d
      </span>
    );
  }
  if (days <= warningDays) {
    return (
      <span className="text-[10px] mono uppercase tracking-widest px-2 py-1 border border-[#FFCC00] text-[#FFCC00] bg-[#FFCC00]/10" data-testid="license-badge-warning">
        {days}d
      </span>
    );
  }
  return <span className="mono text-xs text-muted-foreground">{expiry}</span>;
}
