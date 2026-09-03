const POINTS = [
  {
    title: "An approval chain that matches how your team actually works",
    body: "Costing doesn't just get submitted — it moves through Workshop, Operations, and Finance in sequence. No dedicated workshop manager? Reassign who approves costing without changing how the workflow runs.",
  },
  {
    title: "Works where the signal doesn't",
    body: "Inspections and job updates queue locally on a mechanic's phone the moment the network drops, and sync automatically the moment it's back — no lost checklists, no re-work.",
  },
  {
    title: "Role-based, not role-flattened",
    body: "Admins, managers, workshop heads, operations, finance, and mechanics each see exactly what their job needs — configurable per person, not a single shared view for everyone.",
  },
];

export default function WhyFleetIntel() {
  return (
    <section id="why" className="border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <div className="overline mb-3">Why FleetIntel</div>
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-14">
          Built for how fleet costing actually happens.
        </h2>
        <div className="space-y-12">
          {POINTS.map((p, i) => (
            <div key={p.title} className="grid md:grid-cols-[auto_1fr] gap-6 md:gap-10 items-start" data-testid={`why-${i}`}>
              <div className="font-mono text-primary text-sm">{String(i + 1).padStart(2, "0")}</div>
              <div className="border-t border-border pt-6 md:border-t-0 md:pt-0">
                <h3 className="font-display font-bold text-xl mb-2">{p.title}</h3>
                <p className="text-muted leading-relaxed max-w-2xl">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
