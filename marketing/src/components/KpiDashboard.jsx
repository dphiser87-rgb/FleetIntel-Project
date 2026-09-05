import Reveal from "./Reveal";

// A separate section from Showcase.jsx (the Executive Dashboard) -- this one tells the everyday-use
// story: the main Fleet Operations dashboard, and specifically that its KPI tiles are configurable
// per user. dashboard.png is a fresh capture of the real thing (logged in live), including the
// sidebar and the "10/10 TILES" configure badge, which is direct visual proof of the claim below
// rather than just an illustration of it.
export default function KpiDashboard() {
  return (
    <section className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <Reveal className="max-w-6xl mx-auto px-6 py-20 md:py-24">
        <div className="eyebrow mb-3">See it in action</div>
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-4">
          Dashboard.
        </h2>
        <p className="text-lg leading-relaxed max-w-xl mb-10" style={{ color: "var(--color-muted)" }}>
          Every KPI tile can be set, configured, and rearranged. Each user's layout is theirs alone,
          and stays that way across every device they log in from.
        </p>
        <div
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <img
            src="/assets/dashboard.png"
            alt="FleetIntel's Fleet Operations dashboard, showing configurable KPI tiles with a 10/10 tiles indicator"
            className="w-full h-auto"
          />
        </div>
      </Reveal>
    </section>
  );
}
