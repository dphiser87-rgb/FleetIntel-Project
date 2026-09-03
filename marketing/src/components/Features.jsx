import Reveal from "./Reveal";

const FEATURES = [
  {
    name: "Cost-intelligence dashboard",
    body: "KPIs, cost per vehicle, downtime, and anomaly detection in one view. Not a spreadsheet reconciled at month end.",
  },
  {
    name: "Digital inspections & checklists",
    body: "Field teams run structured vehicle checklists from a phone. Offline-capable, syncing automatically once back online.",
  },
  {
    name: "Maintenance & costing approvals",
    body: "Parts requisitions and job costing move through a real approval chain. Workshop, operations, and finance each get their say.",
  },
  {
    name: "Drivers & incidents",
    body: "Driver records, license expiry tracking, and incident reporting with photo evidence. Built for response fleets and depot operations alike.",
  },
  {
    name: "Offline-first mobile app",
    body: "Mechanics and inspectors keep working with no signal. Submissions queue locally and sync the moment connectivity returns.",
  },
  {
    name: "Open API for telematics",
    body: "Already using a telematics provider? Connect it for automatic fuel, kilometer, and driver-assignment data. No need to rip and replace.",
  },
];

export default function Features() {
  return (
    <section id="features" className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <Reveal>
          <div className="eyebrow mb-3">What's inside</div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-14">
            Everything you need to know where the money goes.
          </h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <Reveal key={f.name} delayMs={(i % 3) * 100}>
              <div
                className="h-full rounded-xl border p-6"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                data-testid={`feature-${f.name}`}
              >
                <h3 className="font-display font-bold text-base mb-2">{f.name}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
