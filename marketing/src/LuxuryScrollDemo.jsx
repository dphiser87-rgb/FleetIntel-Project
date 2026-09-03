import { motion } from "framer-motion";

// Custom luxury easing curve (very slow, smooth deceleration)
const luxuryEase = [0.16, 1, 0.3, 1];

// Motion-style comparison demo only -- copy here is placeholder/generic (not FleetIntel's real
// claims), purely to evaluate the animation feel against the pinned-scrollytelling approach
// already shipped on the main page. If this direction wins, real copy replaces this before it
// goes anywhere near the actual site content.
export default function LuxuryScrollDemo() {
  return (
    <div
      className="min-h-[300vh] px-6 md:px-24 font-sans select-none overflow-x-hidden"
      style={{ background: "var(--color-bg)", color: "var(--color-ink)" }}
    >
      <div className="fixed top-6 left-6 z-50 eyebrow" style={{ color: "var(--color-muted)" }}>
        Motion demo — <a href="/" className="underline" style={{ color: "var(--color-primary)" }}>back to site</a>
      </div>

      {/* SECTION 1: Cinematic Text Mask Reveal */}
      <section className="h-screen flex flex-col justify-center items-start max-w-5xl">
        <div className="overflow-hidden mb-4">
          <motion.span
            initial={{ translateY: "100%" }}
            whileInView={{ translateY: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 1.2, ease: luxuryEase }}
            className="text-xs font-semibold tracking-[0.3em] uppercase block"
            style={{ color: "var(--color-muted)" }}
          >
            Engineered for precision
          </motion.span>
        </div>

        <div className="overflow-hidden">
          <motion.h1
            initial={{ translateY: "100%", rotate: 2 }}
            whileInView={{ translateY: 0, rotate: 0 }}
            viewport={{ once: true, margin: "-15%" }}
            transition={{ duration: 1.4, ease: luxuryEase, delay: 0.1 }}
            className="font-display text-4xl md:text-7xl font-black tracking-tight leading-none max-w-4xl"
          >
            The next paradigm of{" "}
            <span style={{ color: "var(--color-primary)" }}>fleet cost visibility</span>.
          </motion.h1>
        </div>
      </section>

      {/* SECTION 2: Staggered Feature Cards (Smooth Fade + Blur Lift) */}
      <section className="min-h-screen flex flex-col justify-center py-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-7xl w-full mx-auto">
          {[
            { num: "01", title: "Real-time cost tracking", desc: "Every fuel, maintenance, and downtime figure mapped straight to the vehicle it came from." },
            { num: "02", title: "Cost-spike alerts", desc: "Automated thresholds that flag anomalies before they become a budget problem." },
            { num: "03", title: "One unified view", desc: "Your whole fleet's cost picture, rendered clearly in a single dashboard." },
          ].map((item, index) => (
            <motion.div
              key={item.num}
              initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, margin: "-20%" }}
              transition={{ duration: 1.2, ease: luxuryEase, delay: index * 0.15 }}
              className="p-8 rounded-xl border flex flex-col gap-6"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
            >
              <span className="text-sm font-mono tracking-widest" style={{ color: "var(--color-primary)" }}>{item.num}</span>
              <h3 className="text-xl font-display font-bold tracking-tight">{item.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* SECTION 3: Asymmetric Clip-Path Image Reveal (Premium Editorial Style) */}
      <section className="h-screen flex items-center justify-center">
        <motion.div
          initial={{ clipPath: "inset(100% 0% 0% 0%)", scale: 1.1 }}
          whileInView={{ clipPath: "inset(0% 0% 0% 0%)", scale: 1 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ duration: 1.6, ease: luxuryEase }}
          className="relative w-full max-w-4xl h-[500px] rounded-2xl overflow-hidden border flex items-center justify-center p-12"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in oklab, var(--color-muted) 8%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-muted) 8%, transparent) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: luxuryEase, delay: 0.6 }}
            className="text-center relative z-10"
          >
            <h2 className="text-3xl font-display font-bold tracking-wide mb-4">Clarity through simplification.</h2>
            <p className="text-sm max-w-md mx-auto" style={{ color: "var(--color-muted)" }}>
              No noise, no cluttered charts. Just a clear view of what every vehicle actually costs you.
            </p>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}
