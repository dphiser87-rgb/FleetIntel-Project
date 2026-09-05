import Reveal from "./Reveal";

// Dashboard.png (the screenshot that used to sit in the old boxed Hero, before the hero became a
// full-bleed animated graphic) finds its home here -- its own section, full visible, given real
// estate to speak directly to the decision-maker audience. Copy direction 2026-09-05: lead with the
// word "Dashboard" and the one differentiator that isn't obvious from a screenshot alone --
// per-user KPI configuration -- rather than restating what the image already shows.
export default function Showcase() {
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
            alt="FleetIntel's KPI dashboard, showing real cost, downtime, and fuel figures"
            className="w-full h-auto"
          />
        </div>
      </Reveal>
    </section>
  );
}
