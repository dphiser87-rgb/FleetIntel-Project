import Reveal from "./Reveal";

const POINTS = [
  {
    title: "An approval chain that matches how your team works",
    body: "Costing does not just get submitted. It moves through workshop, operations, and finance in sequence. No dedicated workshop manager? Reassign who approves costing without changing how the workflow runs.",
  },
  {
    title: "Works where the signal doesn't",
    body: "Inspections and job updates queue locally on a mechanic's phone the moment the network drops, and sync automatically the moment it's back. No lost checklists. No re-work.",
  },
  {
    title: "Role-based, not role-flattened",
    body: "Admins, managers, workshop heads, operations, finance, and mechanics each see exactly what their job needs. Configurable per person, not one shared view for everyone.",
  },
];

export default function WhyFleetIntel() {
  return (
    <section id="why" className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <Reveal className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <div className="eyebrow mb-3">Why FleetIntel</div>
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-14">
          Built for how fleet costing actually happens.
        </h2>
        <div className="space-y-10">
          {POINTS.map((p, i) => (
            <div key={p.title} className="grid md:grid-cols-[auto_1fr] gap-6 md:gap-10 items-start" data-testid={`why-${i}`}>
              <div className="font-mono text-sm" style={{ color: "var(--color-primary)" }}>{String(i + 1).padStart(2, "0")}</div>
              <div>
                <h3 className="font-display font-bold text-xl mb-2">{p.title}</h3>
                <p className="leading-relaxed" style={{ color: "var(--color-muted)" }}>{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
