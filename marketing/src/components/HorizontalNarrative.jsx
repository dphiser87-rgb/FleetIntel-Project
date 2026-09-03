import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

// Motion-style comparison demo only (mounted from LuxuryScrollDemo.jsx, /demo route). Adapted from
// a user-provided TSX snippet: stripped the TypeScript annotation, rgb(var(--x)) tokens fixed to
// var(--color-*), and copy rewritten from generic observability-platform jargon ("Sub-Millisecond
// Query Windows", "columnar indices", "runaway internal scripts") to three real FleetIntel
// capabilities -- design.md's copy rules apply here too.
const PANELS = [
  {
    tag: "Structure",
    title: "One system for every cost",
    desc: "Fuel, maintenance, parts, downtime: everything a vehicle costs, consolidated into one dashboard instead of scattered across spreadsheets.",
  },
  {
    tag: "Speed",
    title: "Spot the spike in minutes",
    desc: "When a vehicle's costs break its normal pattern, it surfaces immediately. No monthly report to wait for, no manual reconciliation.",
  },
  {
    tag: "Control",
    title: "An approval chain that fits your team",
    desc: "Costing moves through workshop, operations, and finance in sequence. No dedicated workshop manager? Reassign who approves it without changing the workflow.",
  },
];

export function HorizontalNarrative() {
  const targetRef = useRef(null);

  const { scrollYProgress } = useScroll({ target: targetRef });
  const xTranslate = useTransform(scrollYProgress, [0, 1], ["0%", "-66.66%"]);

  return (
    <div ref={targetRef} className="relative h-[300vh] -mx-6 md:-mx-24" style={{ background: "var(--color-bg)" }}>
      <div className="sticky top-0 h-screen w-screen overflow-hidden flex items-center">
        <motion.div style={{ x: xTranslate }} className="flex h-full w-[300vw]">
          {PANELS.map((panel) => (
            <div
              key={panel.tag}
              className="w-screen h-full flex flex-col justify-center px-6 md:px-24 border-r"
              style={{ background: "var(--color-bg)", borderColor: "var(--color-border)" }}
            >
              <div className="max-w-3xl flex flex-col gap-6">
                <span className="text-xs font-mono tracking-[0.4em] uppercase" style={{ color: "var(--color-primary)" }}>
                  [{panel.tag}]
                </span>
                <h2 className="font-display text-4xl md:text-6xl font-black tracking-tight" style={{ color: "var(--color-ink)" }}>
                  {panel.title}
                </h2>
                <p className="text-base md:text-lg leading-relaxed max-w-xl" style={{ color: "var(--color-muted)" }}>
                  {panel.desc}
                </p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
