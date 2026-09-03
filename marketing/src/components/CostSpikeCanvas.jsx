import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

// Motion-style comparison demo only (mounted from LuxuryScrollDemo.jsx, /demo route) -- not wired
// into the shipped site. Adapted from a user-provided TSX snippet: stripped the TypeScript
// annotation (this project is plain JS), rgb(var(--x)) token references fixed to var(--color-*)
// directly, and copy rewritten from server-monitoring jargon ("System Vectors", "LATENCY: 0.42ms",
// "throttle synthetic load") to real, honest FleetIntel language -- design.md's copy rules apply
// here too, even in a motion demo.
//
// useTransform's color interpolation needs a real parseable color string, not a CSS var(), so the
// alert-red glow below uses its RGB triplet (222, 59, 61 -- the real oklch(60% 0.20 25) converted).
export function CostSpikeCanvas() {
  const containerRef = useRef(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const gridScale = useTransform(scrollYProgress, [0, 0.5], [0.85, 1]);
  const gridOpacity = useTransform(scrollYProgress, [0.1, 0.4], [0, 0.15]);

  const borderGlow = useTransform(
    scrollYProgress,
    [0.3, 0.5, 0.7, 0.9],
    ["rgba(222, 59, 61, 0)", "rgba(222, 59, 61, 0.4)", "rgba(222, 59, 61, 0.4)", "rgba(222, 59, 61, 0)"]
  );

  const textBlur = useTransform(scrollYProgress, [0.3, 0.5], ["blur(8px)", "blur(0px)"]);
  const textOpacity = useTransform(scrollYProgress, [0.3, 0.5], [0, 1]);

  return (
    <div ref={containerRef} className="min-h-screen w-full flex items-center justify-center relative py-32 overflow-hidden">
      <motion.div
        style={{
          scale: gridScale,
          opacity: gridOpacity,
          backgroundImage: "linear-gradient(to right, var(--color-muted) 1px, transparent 1px), linear-gradient(to bottom, var(--color-muted) 1px, transparent 1px)",
        }}
        className="absolute inset-0 bg-[size:32px_32px] pointer-events-none"
      />

      <motion.div
        style={{ borderColor: borderGlow, boxShadow: useTransform(borderGlow, (v) => `0 0 40px ${v}`) }}
        className="w-full max-w-5xl h-[450px] backdrop-blur-md rounded-2xl border transition-shadow duration-300 flex flex-col justify-between p-12 relative z-10"
        data-testid="cost-spike-canvas"
      >
        <div className="absolute inset-0 rounded-2xl -z-10" style={{ background: "color-mix(in oklab, var(--color-surface) 80%, transparent)" }} />
        <div className="flex justify-between items-start w-full">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Cost intelligence</span>
            <h3 className="text-xl font-display" style={{ color: "var(--color-ink)" }}>Cost spike detected</h3>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-full border"
            style={{ borderColor: "color-mix(in oklab, var(--color-alert) 30%, transparent)", background: "color-mix(in oklab, var(--color-alert) 8%, transparent)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-alert)" }} />
            <span className="text-[10px] font-mono tracking-wider uppercase" style={{ color: "var(--color-alert)" }}>Needs review</span>
          </div>
        </div>

        <motion.div style={{ filter: textBlur, opacity: textOpacity }} className="max-w-xl">
          <h4 className="text-3xl font-display font-bold tracking-tight mb-4" style={{ color: "var(--color-ink)" }}>
            Catch it <span style={{ color: "var(--color-alert)" }}>before</span> it becomes a line item you can't explain.
          </h4>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
            When a vehicle's costs break its normal pattern, it surfaces here automatically. No
            monthly report to wait for, no manual reconciliation.
          </p>
        </motion.div>

        <div className="w-full pt-6 border-t flex justify-between text-[10px] font-mono" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}>
          <span>VEHICLE: FALCON-02</span>
          <span>+247% VS FLEET AVERAGE</span>
        </div>
      </motion.div>
    </div>
  );
}
