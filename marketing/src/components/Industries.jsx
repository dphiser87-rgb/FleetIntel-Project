const INDUSTRIES = [
  "Logistics & distribution",
  "Transportation",
  "Emergency medical services",
  "Security & armed response",
  "Any fleet-operated business",
];

export default function Industries() {
  return (
    <section className="border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="eyebrow mb-4">Built for</div>
        <div className="flex flex-wrap gap-3">
          {INDUSTRIES.map((i) => (
            <span
              key={i}
              data-testid={`industry-${i}`}
              className="text-xs uppercase tracking-widest border border-border px-3 py-2 text-muted"
            >
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
