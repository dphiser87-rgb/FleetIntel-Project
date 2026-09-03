import Reveal from "./Reveal";

// The Executive Dashboard screenshot, given real estate as its own section instead of a dimmed
// hero background -- full visible, speaks directly to the decision-maker audience.
export default function Showcase() {
  return (
    <section className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <Reveal className="max-w-6xl mx-auto px-6 py-20 md:py-24">
        <div className="eyebrow mb-3">See it in action</div>
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-10">
          The view your executives actually check.
        </h2>
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <img
            src="/assets/executive-dashboard-overview.png"
            alt="FleetIntel's Executive Dashboard: KPI tiles, AI cost insights, and a monthly fleet cost breakdown chart"
            className="w-full h-auto"
          />
        </div>
      </Reveal>
    </section>
  );
}
