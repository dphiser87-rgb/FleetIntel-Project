import Reveal from "./Reveal";
import ImagePlaceholder from "./ImagePlaceholder";

const SCENARIOS = [
  {
    tag: "Field inspections",
    title: "A driver or controller runs the checklist, right from the field",
    body: "[placeholder body copy — the offline-capable inspection flow, mechanic or driver, on a phone]",
    shot: "screenshot — mobile vehicle checklist / inspection in progress",
  },
  {
    tag: "Incidents",
    title: "An incident happens — the paperwork insurance needs is already there",
    body: "[placeholder body copy — the incident report → insurance-share flow, a real shipped feature]",
    shot: "screenshot — incident report with insurance-share action",
  },
  {
    tag: "Executive oversight",
    title: "A cost spike shows up — and gets investigated in minutes, not months",
    body: "[placeholder body copy — the executive dashboard's drill-down/investigation view]",
    shot: "screenshot — executive dashboard, cost-spike drill-down",
    signature: true,
  },
];

export default function Scenarios() {
  return (
    <section id="how-it-works" className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <Reveal>
          <div className="overline mb-3">How it works</div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-16">
            <span className="placeholder-copy">[placeholder section heading — real fleet moments, not stock photos]</span>
          </h2>
        </Reveal>

        <div className="space-y-20">
          {SCENARIOS.map((s, i) => (
            <Reveal key={s.tag} className={`grid md:grid-cols-2 gap-10 items-center ${i % 2 ? "md:[direction:rtl]" : ""}`}>
              <div style={i % 2 ? { direction: "ltr" } : undefined}>
                <div className="overline mb-3">{s.tag}</div>
                <h3 className="font-display font-bold text-2xl mb-3">{s.title}</h3>
                <p className="placeholder-copy text-sm leading-relaxed">{s.body}</p>

                {s.signature && (
                  <div
                    className="mt-6 rounded-xl border-l-4 p-4 inline-block"
                    style={{ borderColor: "var(--color-alert)", background: "var(--color-surface)" }}
                    data-testid="signature-cost-spike-card"
                  >
                    <div className="overline mb-1">Cost spike detected</div>
                    <div className="font-mono text-2xl font-bold" style={{ color: "var(--color-alert)" }}>
                      [placeholder]%
                    </div>
                  </div>
                )}
              </div>
              <div style={i % 2 ? { direction: "ltr" } : undefined}>
                <ImagePlaceholder label={s.shot} />
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
