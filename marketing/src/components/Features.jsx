const FEATURES = [
  {
    title: "Cost-intelligence dashboard",
    body: "KPIs, cost-per-vehicle, downtime, and anomaly detection in one view — not a spreadsheet reconciled at month-end.",
  },
  {
    title: "Digital inspections & checklists",
    body: "Field teams run structured vehicle checklists from a phone, offline-capable, syncing automatically once back online.",
  },
  {
    title: "Maintenance & costing approvals",
    body: "Parts requisitions and job costing flow through a real approval chain — workshop, operations, and finance each get their say.",
  },
  {
    title: "Drivers & incidents",
    body: "Driver records, license expiry tracking, and incident reporting with photo evidence — built for response fleets and depot operations alike.",
  },
  {
    title: "Offline-first mobile app",
    body: "Mechanics and inspectors keep working with no signal — submissions queue locally and sync the moment connectivity returns.",
  },
  {
    title: "Built for African currencies",
    body: "Multi-currency support across the continent, so every cost figure is in the currency your team actually works in.",
  },
];

export default function Features() {
  return (
    <section id="features" className="border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <div className="eyebrow mb-3">What's inside</div>
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-14">
          Everything a fleet team needs to know where the money goes.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-background p-8" data-testid={`feature-${f.title}`}>
              <div className="w-8 h-8 border border-primary/40 mb-6 flex items-center justify-center">
                <div className="w-2 h-2 bg-primary" />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
