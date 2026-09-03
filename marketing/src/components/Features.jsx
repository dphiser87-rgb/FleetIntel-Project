import Reveal from "./Reveal";

const FEATURES = [
  "Cost-intelligence dashboard",
  "Digital inspections & checklists",
  "Maintenance & costing approvals",
  "Drivers & incidents",
  "Offline-first mobile app",
  "Open API — connect your telematics provider",
];

export default function Features() {
  return (
    <section id="features" className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <Reveal className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <div className="eyebrow mb-3">What's inside</div>
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-14">
          <span className="placeholder-copy">[placeholder section heading]</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f}
              data-testid={`feature-${f}`}
              className="rounded-xl border p-6"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
            >
              <h3 className="font-display font-bold text-base mb-2">{f}</h3>
              <p className="placeholder-copy text-sm leading-relaxed">[placeholder body copy]</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
