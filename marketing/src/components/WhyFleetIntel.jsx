import Reveal from "./Reveal";

const POINTS = [
  "An approval chain that matches how your team actually works",
  "Works where the signal doesn't",
  "Role-based, not role-flattened",
];

export default function WhyFleetIntel() {
  return (
    <section id="why" className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <Reveal className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <div className="eyebrow mb-3">Why FleetIntel</div>
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-14">
          <span className="placeholder-copy">[placeholder section heading]</span>
        </h2>
        <div className="space-y-10">
          {POINTS.map((p, i) => (
            <div key={p} className="grid md:grid-cols-[auto_1fr] gap-6 md:gap-10 items-start" data-testid={`why-${i}`}>
              <div className="font-mono text-sm" style={{ color: "var(--color-primary)" }}>{String(i + 1).padStart(2, "0")}</div>
              <div>
                <h3 className="font-display font-bold text-xl mb-2">{p}</h3>
                <p className="placeholder-copy leading-relaxed">[placeholder body copy]</p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
