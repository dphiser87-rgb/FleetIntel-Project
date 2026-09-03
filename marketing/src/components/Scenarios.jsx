import Reveal from "./Reveal";
import ImagePlaceholder from "./ImagePlaceholder";

const SCENARIOS = [
  {
    tag: "Field inspections",
    title: "A driver runs the checklist from the field",
    body: "No signal required. Every answer, photo, and signature queues on the phone and syncs the moment connectivity returns. Nothing gets lost. Nothing gets redone.",
    shot: "screenshot — mobile vehicle checklist / inspection in progress",
  },
  {
    tag: "Incidents",
    title: "An incident happens. The paperwork is already there",
    body: "Photos, description, vehicle and driver details, captured on the spot and structured for the one person who needs them next: your insurer.",
    shot: "screenshot — incident report with insurance-share action",
  },
  {
    tag: "Executive oversight",
    title: "A cost spike gets investigated in minutes, not months",
    body: "A number moves the wrong way. An executive drills straight from the dashboard into the vehicle, the job, and the line item behind it. No report to wait for.",
    shot: "screenshot — executive dashboard, cost-spike drill-down",
    signature: true,
  },
];

export default function Scenarios() {
  return (
    <section id="how-it-works" className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <Reveal>
          <div className="eyebrow mb-3">How it works</div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-16">
            Real fleets. Not stock photos.
          </h2>
        </Reveal>

        <div className="space-y-20">
          {SCENARIOS.map((s, i) => (
            <Reveal key={s.tag} className={`grid md:grid-cols-2 gap-10 items-center ${i % 2 ? "md:[direction:rtl]" : ""}`}>
              <div style={i % 2 ? { direction: "ltr" } : undefined}>
                <div className="eyebrow mb-3">{s.tag}</div>
                <h3 className="font-display font-bold text-2xl mb-3">{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>{s.body}</p>

                {s.signature && (
                  <div
                    className="mt-6 rounded-xl border-l-4 p-4 inline-block"
                    style={{ borderColor: "var(--color-alert)", background: "var(--color-surface)" }}
                    data-testid="signature-cost-spike-card"
                  >
                    <div className="eyebrow mb-1">Maintenance spend, this vehicle</div>
                    <div className="font-mono text-2xl font-bold" style={{ color: "var(--color-alert)" }}>
                      +18% <span className="text-sm font-normal" style={{ color: "var(--color-muted)" }}>vs last month</span>
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
