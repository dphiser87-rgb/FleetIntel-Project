import { useEffect, useRef } from "react";

// A live-rendered stand-in for a hero "video" -- real dashboard-shaped motion (KPI tiles counting
// up, gauges filling, a trend line drawing in) rather than an actual video file. No file to record,
// encode, host, or keep in sync with the real app; effectively free to load. Values are illustrative
// UI chrome, not asserted as real product claims (matches the existing signature cost-spike card's
// "+18% vs last month" treatment) -- this is a motion graphic of the kind of thing the dashboard
// shows, not a screenshot standing in as evidence. They still need to be plausible, though: this is
// the first number a visitor reads, so it has to look like a real fleet's month.
//
// One shared timeline drives everything (count-up, gauge fill and chart draw happen together) rather
// than several independently-looping pieces -- the same "one coordinated effect, not five competing
// rhythms" reasoning as the rest of this site's motion.
const TILES = [
  { label: "Total monthly cost", value: 84300, prefix: "R", format: (n) => Math.round(n).toLocaleString(), gauge: 0.62 },
  { label: "Cost per vehicle", value: 3240, prefix: "R", format: (n) => Math.round(n).toLocaleString(), gauge: 0.45 },
  { label: "Downtime", value: 4.2, prefix: "", suffix: "d", format: (n) => n.toFixed(1), gauge: 0.3 },
  { label: "Fleet utilization", value: 87, prefix: "", suffix: "%", format: (n) => Math.round(n), gauge: 0.87 },
];

// Ramps up once on mount and then holds the settled figures, rather than looping back down to zero
// every few seconds. The loop it replaced spent roughly 40% of each cycle mid-ramp or counting back
// down, so a visitor arriving at the wrong moment met a fleet-cost product advertising "R213 total
// monthly cost" and "0% utilization" -- captured exactly that way during a review. The entrance
// motion is the part worth having; the reset only risked making the product look broken. The status
// dot keeps pulsing, so the panel still reads as live.
const RAMP_MS = 1400; // count-up / fill / draw

const CHART_POINTS = "0,38 14,32 28,34 42,22 56,26 70,14 84,18 100,6";

export default function DashboardMotionGraphic() {
  const containerRef = useRef(null);
  const valueRefs = useRef([]);
  const gaugeRefs = useRef([]);
  const chartRef = useRef(null);
  const dotRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Freeze at the "settled" end state instead of animating -- still shows a complete dashboard,
      // just not moving.
      TILES.forEach((t, i) => {
        if (valueRefs.current[i]) valueRefs.current[i].textContent = `${t.prefix}${t.format(t.value)}${t.suffix || ""}`;
        if (gaugeRefs.current[i]) gaugeRefs.current[i].style.strokeDashoffset = String(100 - t.gauge * 100);
      });
      if (chartRef.current) chartRef.current.style.strokeDashoffset = "0";
      return;
    }

    let raf;
    const start = performance.now();
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      const elapsed = now - start;
      const progress = elapsed < RAMP_MS ? easeOut(elapsed / RAMP_MS) : 1;

      TILES.forEach((t, i) => {
        const v = t.value * progress;
        if (valueRefs.current[i]) valueRefs.current[i].textContent = `${t.prefix}${t.format(v)}${t.suffix || ""}`;
        if (gaugeRefs.current[i]) gaugeRefs.current[i].style.strokeDashoffset = String(100 - t.gauge * progress * 100);
      });
      if (chartRef.current) chartRef.current.style.strokeDashoffset = String(100 - progress * 100);
      if (dotRef.current) dotRef.current.style.opacity = String(0.5 + 0.5 * Math.sin(elapsed / 260));

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Animated illustration of FleetIntel's cost dashboard: KPI tiles and a cost trend updating"
      className="rounded-xl border p-5 md:p-6"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="flex items-center justify-between mb-5">
        <span className="eyebrow">Fleet operations</span>
        <span className="flex items-center gap-1.5">
          <span ref={dotRef} className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--color-primary)" }} />
          <span className="eyebrow">Live</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 mb-5">
        {TILES.map((t, i) => (
          <div key={t.label} className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--color-muted)" }}>{t.label}</div>
                <div ref={(el) => (valueRefs.current[i] = el)} className="font-mono text-lg md:text-xl font-bold">
                  {t.prefix}0{t.suffix || ""}
                </div>
              </div>
              <svg width="28" height="28" viewBox="0 0 40 40" className="shrink-0 -rotate-90">
                <circle cx="20" cy="20" r="16" fill="none" strokeWidth="4" style={{ stroke: "var(--color-border)" }} />
                <circle
                  ref={(el) => (gaugeRefs.current[i] = el)}
                  cx="20" cy="20" r="16" fill="none" strokeWidth="4" strokeLinecap="round"
                  style={{ stroke: "var(--color-primary)", strokeDasharray: "100 100", strokeDashoffset: 100 }}
                  pathLength="100"
                />
              </svg>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-3" style={{ borderColor: "var(--color-border)" }}>
        <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: "var(--color-muted)" }}>Cost trend, this month</div>
        <svg viewBox="0 0 100 44" className="w-full h-10" preserveAspectRatio="none">
          <polyline points={CHART_POINTS} fill="none" strokeWidth="1" style={{ stroke: "var(--color-border)" }} />
          <polyline
            ref={chartRef}
            points={CHART_POINTS}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            style={{ stroke: "var(--color-primary)", strokeDasharray: "100 100", strokeDashoffset: 100 }}
          />
        </svg>
      </div>
    </div>
  );
}
