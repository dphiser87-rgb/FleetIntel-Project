import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { AccessibilitySkipBar } from "@/components/AccessibilitySkipBar";

// Motion-style comparison demo only (mounted at /demo2 by main.jsx) -- a second alternative to
// /demo's HorizontalNarrative, not wired into the shipped site. Adapted from a user-provided TSX
// snippet: stripped the TypeScript annotation, rgb(var(--x)) tokens fixed to var(--color-*)
// (this project's tokens are hex/oklch values, not RGB-channel triplets, so alpha uses color-mix()
// instead of Tailwind's /opacity modifier), and copy rewritten from generic observability-platform
// jargon ("Sub-Millisecond Query Windows", "columnar indices", "runaway internal scripts") to the
// same three real FleetIntel capabilities used on /demo's HorizontalNarrative, for a fair
// comparison of the two scroll techniques. Uses the .demo-theme palette (saturated green/orange).
const luxuryEase = [0.16, 1, 0.3, 1];

const PANELS = [
  { tag: "Structure", title: "One system for every cost", desc: "Fuel, maintenance, parts, downtime: everything a vehicle costs, consolidated into one dashboard instead of scattered across spreadsheets." },
  { tag: "Speed", title: "Spot the spike in minutes", desc: "When a vehicle's costs break its normal pattern, it surfaces immediately. No monthly report to wait for, no manual reconciliation." },
  { tag: "Control", title: "An approval chain that fits your team", desc: "Costing moves through workshop, operations, and finance in sequence. No dedicated workshop manager? Reassign who approves it without changing the workflow." },
];

export default function MarketingShowcase() {
  const [isReady, setIsReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const targetRef = useRef(null);

  useEffect(() => {
    // Simulated loading gate (this is a client-only Vite app, not SSR -- there's no real hydration
    // to wait for). Self-terminating after 1.4s regardless of scroll/interaction, which is why the
    // sweep animation below is allowed to loop: it's bounded to this short window, not persistent
    // decorative motion, and it unmounts via AnimatePresence once isReady flips.
    const timer = setTimeout(() => setIsReady(true), 1400);

    const checkViewport = () => setIsMobile(window.innerWidth < 768);
    checkViewport();
    window.addEventListener("resize", checkViewport, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", checkViewport);
    };
  }, []);

  useEffect(() => {
    // Keep the page from scrolling behind the gate while it's up (the scroll-linked section below
    // is mounted the whole time -- see note above the main content div for why).
    document.body.style.overflow = isReady ? "" : "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isReady]);

  const { scrollYProgress } = useScroll({ target: targetRef });
  const xTranslate = useTransform(scrollYProgress, [0, 1], ["0%", "-66.66%"]);

  return (
    <div className="demo-theme">
      <AccessibilitySkipBar />

      <AnimatePresence>
        {!isReady && (
          <motion.div
            exit={{ opacity: 0, transition: { duration: 0.8, ease: luxuryEase } }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6"
            style={{ background: "var(--color-bg)" }}
          >
            <div
              className="w-48 h-px relative overflow-hidden"
              style={{ background: "color-mix(in oklab, var(--color-muted) 20%, transparent)" }}
            >
              <motion.div
                initial={{ left: "-100%" }}
                animate={{ left: "100%" }}
                transition={{ duration: 1.2, ease: "easeInOut", repeat: Infinity }}
                className="absolute top-0 bottom-0 w-1/2"
                style={{ background: "var(--color-primary)" }}
              />
            </div>
            <span className="eyebrow mt-4">Loading</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Always mounted, even while the gate is up -- framer-motion's useScroll never recovers a
          working scroll listener when its target element mounts on a delayed re-render instead of
          the component's first render (confirmed by bisecting: gating this whole block behind
          isReady left the horizontal scroll permanently frozen at 0%, no console error). The gate
          overlay above hides it, and the effect above blocks scrolling until isReady anyway. */}
      <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-ink)" }}>
        <div className="fixed top-6 left-6 z-40 eyebrow">
          Motion demo — <a href="/" className="underline" style={{ color: "var(--color-primary)" }}>back to site</a>
        </div>

        {isMobile ? (
          <div className="flex flex-col gap-24 px-6 py-24">
            {PANELS.map((panel) => (
              <motion.div
                key={panel.tag}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.8, ease: luxuryEase }}
                className="flex flex-col gap-4 border-b pb-12"
                style={{ borderColor: "color-mix(in oklab, var(--color-muted) 10%, transparent)" }}
              >
                <span className="text-xs font-mono tracking-widest uppercase" style={{ color: "var(--color-primary)" }}>[{panel.tag}]</span>
                <h2 className="text-3xl font-display font-bold tracking-tight">{panel.title}</h2>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>{panel.desc}</p>
              </motion.div>
            ))}
          </div>
        ) : (
          <div ref={targetRef} className="relative h-[300vh]">
            <div className="sticky top-0 h-screen w-screen overflow-hidden flex items-center">
              <motion.div style={{ x: xTranslate }} className="flex h-full w-[300vw] will-change-transform">
                {PANELS.map((panel) => (
                  <div
                    key={panel.tag}
                    className="w-screen h-full flex flex-col justify-center px-24 border-r"
                    style={{ background: "var(--color-bg)", borderColor: "color-mix(in oklab, var(--color-muted) 5%, transparent)" }}
                  >
                    <div className="max-w-3xl flex flex-col gap-6">
                      <span className="text-xs font-mono tracking-[0.4em] uppercase" style={{ color: "var(--color-primary)" }}>[{panel.tag}]</span>
                      <h2 className="font-display text-6xl font-black tracking-tight">{panel.title}</h2>
                      <p className="text-lg leading-relaxed max-w-xl" style={{ color: "var(--color-muted)" }}>{panel.desc}</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        )}

        {/* Skip target: lands here, past the horizontal panels above. tabIndex={-1} so it
            reliably receives focus on activation (some browsers otherwise just scroll without
            moving focus, which breaks the skip link's purpose for keyboard users). */}
        <div id="primary-content" tabIndex={-1} className="py-24 text-center">
          <a href="/" className="underline text-sm" style={{ color: "var(--color-primary)" }}>
            Back to site
          </a>
        </div>
      </div>
    </div>
  );
}
