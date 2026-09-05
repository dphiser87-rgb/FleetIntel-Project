import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";

const SCENARIOS = [
  {
    tag: "Field inspections",
    title: "A driver runs the checklist from the field",
    body: "No signal required. Every answer, photo, and signature queues on the phone and syncs the moment connectivity returns. Nothing gets lost. Nothing gets redone.",
    shot: "/assets/inspection.png",
    alt: "A digital vehicle inspection checklist, sections for tires, wheels, and brakes, each item marked pass or fail",
  },
  {
    tag: "Incidents",
    title: "An incident happens. The paperwork is already there",
    body: "Photos, description, vehicle and driver details, captured on the spot and structured for the one person who needs them next: your insurer.",
    shot: "/assets/incident-insurance.png",
    alt: "The share-incident dialog, a link and an email-to-insurance form with a note field",
  },
  {
    tag: "Executive oversight",
    title: "A cost spike gets investigated in minutes, not months",
    body: "A number moves the wrong way. An executive drills straight from the dashboard into the vehicle, the job, and the line item behind it. No report to wait for.",
    shot: "/assets/executive-cost-spike.png",
    alt: "A vehicle's cost breakdown and monthly cost trend chart, drilled into from the executive dashboard",
    signature: true,
  },
];

const CostSpikeCard = () => (
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
);

// Pinned scrollytelling on desktop: the image panel stays fixed (sticky) while the three scenario
// captions scroll past on the other side, an IntersectionObserver swapping which screenshot shows.
// On mobile there's no room for a sticky panel, so each block just carries its own inline image.
export default function Scenarios() {
  const [active, setActive] = useState(0);
  const blockRefs = useRef([]);

  useEffect(() => {
    const observers = blockRefs.current.map((el, i) => {
      if (!el) return null;
      const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setActive(i); }, { threshold: 0.5 });
      io.observe(el);
      return io;
    });
    return () => observers.forEach((io) => io && io.disconnect());
  }, []);

  const active_ = SCENARIOS[active];

  return (
    <section id="how-it-works" className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <div className="px-6 md:px-12 lg:px-20 py-20 md:py-28">
        <Reveal>
          <div className="eyebrow mb-3">How it works</div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight max-w-xl mb-16">
            Real fleets. Not stock photos.
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-10">
          <div className="space-y-16 md:space-y-0">
            {SCENARIOS.map((item, i) => (
              <div
                key={item.tag}
                ref={(el) => (blockRefs.current[i] = el)}
                className="md:min-h-[70vh] flex flex-col justify-center"
                data-testid={`scenario-block-${i}`}
              >
                <div className="eyebrow mb-3" style={{ color: active === i ? "var(--color-primary)" : undefined }}>
                  {item.tag}
                </div>
                <h3 className="font-display font-bold text-2xl mb-3">{item.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>{item.body}</p>
                {item.signature && <CostSpikeCard />}

                {/* Mobile only: inline image right under its own block, no sticky panel needed. */}
                <div
                  className="md:hidden mt-6 rounded-xl border overflow-hidden"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <img src={item.shot} alt={item.alt} className="w-full h-auto" />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <div className="sticky top-24">
              <div
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <img key={active_.shot} src={active_.shot} alt={active_.alt} className="w-full h-full object-cover" />
              </div>
              <div className="flex gap-2 mt-4">
                {SCENARIOS.map((_, i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full transition-colors duration-300"
                    style={{ background: active === i ? "var(--color-primary)" : "var(--color-border)" }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
