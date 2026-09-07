import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  Wrench, TrendUp, IdentificationCard, Clock, Package, Warning, ClipboardText,
  WarningCircle, CheckCircle, WarningOctagon, Calculator, X, SpeakerHigh, SpeakerX,
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

const BUCKET_LABEL = {
  maintenance_critical: "Maintenance",
  cost_anomalies: "Cost Anomalies",
  license_expiring: "Licenses",
  pending_jobs: "Pending Jobs",
  low_stock_parts: "Low Stock",
  open_incidents: "Incidents",
  overdue_checklists: "Checklists",
  recent_defects: "Recent Defects",
  approvals: "Approvals",
  open_defect_reports: "Defects",
  budget_overruns: "Budget",
};

const BUCKET_LINK = {
  maintenance_critical: "/maintenance",
  open_incidents: "/incidents",
  overdue_checklists: "/compliance",
  low_stock_parts: "/parts",
  approvals: "/maintenance?approvals=1",
  open_defect_reports: "/defects",
  budget_overruns: "/budgets",
  license_expiring: "/drivers",
  pending_jobs: "/maintenance",
  recent_defects: "/vehicle-checklist",
  cost_anomalies: "/reports",
};

// Bucket key -> key in the /alerts "details" payload that holds its itemized popover rows.
// Most match 1:1; open_incidents is the one exception (kept distinct from the flat "open_incidents"
// summary list the vehicle-share endpoints also read from this same payload).
const BUCKET_DETAILS_KEY = {
  maintenance_critical: "maintenance_critical",
  open_incidents: "open_incidents_popover",
  overdue_checklists: "overdue_checklists",
  low_stock_parts: "low_stock_parts",
  approvals: "approvals",
  open_defect_reports: "open_defect_reports",
  budget_overruns: "budget_overruns",
  license_expiring: "license_expiring",
  pending_jobs: "pending_jobs",
  recent_defects: "recent_defects",
  cost_anomalies: "cost_anomalies",
};

// Colour rule: a bucket's badge colour is the worst tone among its own items, not a fixed colour per
// bucket. "critical" = counted in the backend's critical tally (destructive/red), "warning" = counted
// in the warnings tally (#FFCC00/orange), "info" = not counted in either — purely informational, like a
// job simply sitting in the queue (primary/green). Any bucket can carry any of the three depending on
// what's actually in it right now (e.g. license_expiring is red the moment one licence is expired, not
// just "soon"), so new buckets get correct colour automatically as long as their items set a tone.
const TONE_COLOR = {
  critical: "text-destructive border-destructive/40 bg-destructive/10",
  warning: "text-[#FFCC00] border-[#FFCC00]/40 bg-[#FFCC00]/10",
  info: "text-primary border-primary/40 bg-primary/10",
};
const TONE_TEXT = { critical: "text-destructive", warning: "text-[#FFCC00]", info: "text-primary" };
const TONE_RING = { critical: "border-destructive ring-destructive", warning: "border-[#FFCC00] ring-[#FFCC00]", info: "border-primary ring-primary" };
const TONE_ORDER = { critical: 2, warning: 1, info: 0 };

function worstTone(items) {
  if (!items || items.length === 0) return "warning";
  return items.reduce((worst, item) => (TONE_ORDER[item.tone] > TONE_ORDER[worst] ? item.tone : worst), "info");
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* Web Audio unavailable — fail silently, sound is a nice-to-have */ }
}

export default function GlobalAlertBar() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [openBucket, setOpenBucket] = useState(null);
  const [flashing, setFlashing] = useState(() => new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevBuckets = useRef(null);
  const soundInitialized = useRef(false);

  useEffect(() => {
    if (user?.prefs && !soundInitialized.current) {
      setSoundEnabled(user.prefs.alert_sound_enabled !== false);
      soundInitialized.current = true;
    }
  }, [user]);

  const load = () => {
    api.get("/alerts").then((r) => {
      const next = r.data;
      if (prevBuckets.current) {
        const grew = [];
        for (const [k, n] of Object.entries(next.buckets)) {
          if (n > (prevBuckets.current[k] || 0)) grew.push(k);
        }
        if (grew.length > 0) {
          setFlashing(new Set(grew));
          if (soundEnabled) playBeep();
          setTimeout(() => setFlashing(new Set()), 2500);
        }
      }
      prevBuckets.current = next.buckets;
      setAlerts(next);
    }).catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- soundEnabled read via closure is fine to lag one poll behind a toggle
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    api.put("/users/me/prefs", { alert_sound_enabled: next }).catch(() => {});
  };

  if (!alerts || alerts.total === 0) return null;

  if (hidden) {
    return (
      <div className="bg-[#0b0b0d] border-b border-border px-8 py-1.5 flex items-center justify-end" data-testid="live-alerts-bar-collapsed">
        <button onClick={() => setHidden(false)} data-testid="show-alerts-btn" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
          <Warning size={12} /> Show alerts ({alerts.total})
        </button>
      </div>
    );
  }

  return (
    <div
      className="bg-[#0b0b0d] border-b border-border relative"
      data-testid="live-alerts-bar"
    >
    <div className="px-8 py-3 flex items-center gap-6 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
        <span className="text-xs uppercase tracking-widest text-primary font-bold">Live alerts</span>
      </div>
      <div className="text-sm">
        <span className="text-primary font-bold mono">{alerts.critical}</span> <span className="text-muted-foreground">critical</span> ·{" "}
        <span className="text-[#FFCC00] font-bold mono">{alerts.warnings}</span> <span className="text-muted-foreground">warnings</span> ·{" "}
        <span className="mono">{alerts.total}</span> total
      </div>
      <div className="mono text-xs text-muted-foreground" data-testid="alerts-date">
        {new Date().toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
      </div>
      <div className="flex items-center gap-1 ml-auto flex-wrap">
        {Object.entries(alerts.buckets).filter(([, n]) => n > 0).map(([k, n]) => {
          const Icon = BUCKET_ICON[k] || Warning;
          const detailsKey = BUCKET_DETAILS_KEY[k];
          const items = alerts.details[detailsKey] || [];
          const hasPopover = detailsKey && items.length > 0;
          const tone = worstTone(items);
          const isFlashing = flashing.has(k);
          const isOpen = openBucket === k;
          return (
            <div key={k} className="relative">
              <button
                onClick={() => hasPopover && setOpenBucket(isOpen ? null : k)}
                data-testid={`bucket-${k}`}
                title={BUCKET_LABEL[k] || k}
                className={`flex items-center gap-1.5 text-xs px-2 py-1.5 border transition-all ${
                  isOpen ? "border-white/40 bg-white/5" : "border-transparent hover:border-border"
                } ${isFlashing ? `ring-2 animate-pulse ${TONE_RING[tone]}` : ""} ${hasPopover ? "cursor-pointer" : "cursor-default"}`}
              >
                <Icon size={13} weight="bold" className={TONE_TEXT[tone]} />
                <span className={`mono font-bold ${TONE_TEXT[tone]}`}>{n}</span>
              </button>

              {isOpen && hasPopover && (
                <>
                  <button className="fixed inset-0 z-40 cursor-default" onClick={() => setOpenBucket(null)} aria-label="Close" />
                  <div className="absolute top-full left-0 mt-2 w-72 bg-[#121214] border border-border z-50 shadow-2xl" data-testid={`popover-${k}`}>
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <Icon size={14} className={TONE_TEXT[tone]} /> {BUCKET_LABEL[k] || k}
                        <span className={`mono text-[10px] px-1.5 py-0.5 rounded-full ${TONE_COLOR[tone]}`}>{n}</span>
                      </div>
                      <button onClick={() => setOpenBucket(null)} className="text-muted-foreground hover:text-primary"><X size={14} /></button>
                    </div>
                    <div className="divide-y divide-border/50 max-h-80 overflow-y-auto">
                      {alerts.details[detailsKey].map((item, i) => (
                        <div key={i} className="px-3 py-2.5 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{item.title}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{item.subtitle}</div>
                          </div>
                          <span className={`shrink-0 text-[10px] mono uppercase tracking-widest px-1.5 py-0.5 border whitespace-nowrap ${TONE_COLOR[item.tone] || TONE_COLOR.warning}`}>
                            {item.right}
                          </span>
                        </div>
                      ))}
                    </div>
                    {BUCKET_LINK[k] && (
                      <Link to={BUCKET_LINK[k]} onClick={() => setOpenBucket(null)} className="block text-center text-xs text-primary hover:underline px-3 py-2.5 border-t border-border">
                        View all {(BUCKET_LABEL[k] || k).toLowerCase()} →
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <button onClick={toggleSound} data-testid="toggle-alert-sound" title={soundEnabled ? "Mute alert sound" : "Unmute alert sound"}
          className="flex items-center text-muted-foreground hover:text-primary pl-3 border-l border-border">
          {soundEnabled ? <SpeakerHigh size={14} /> : <SpeakerX size={14} />}
        </button>
        <button onClick={() => setHidden(true)} data-testid="hide-alerts-btn" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
          <X size={12} /> Hide
        </button>
      </div>
    </div>
      <div
        className="h-0.5 w-full"
        style={{
          background: alerts.critical > 0 ? "hsl(var(--destructive))" : alerts.warnings > 0 ? "#F97316" : "#34C759",
          opacity: 0.6,
        }}
      />
    </div>
  );
}
