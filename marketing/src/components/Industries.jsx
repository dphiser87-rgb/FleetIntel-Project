import Reveal from "./Reveal";

const INDUSTRIES = [
  "Logistics & distribution",
  "Transportation",
  "Emergency medical services",
  "Security & armed response",
  "Services",
  "Any company with vehicles",
];

export default function Industries() {
  return (
    <section className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <Reveal className="max-w-6xl mx-auto px-6 py-10">
        <div className="overline mb-4">Built for</div>
        <div className="flex flex-wrap gap-3">
          {INDUSTRIES.map((i) => (
            <span
              key={i}
              data-testid={`industry-${i}`}
              className="text-xs uppercase tracking-widest rounded-full border px-4 py-2"
              style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}
            >
              {i}
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
