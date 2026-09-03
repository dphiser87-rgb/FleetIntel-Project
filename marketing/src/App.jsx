// Step 1 bare v1 page, per design.md ("Night Ops"). Deliberately minimal -- brand, thesis, lede
// only, bg/ink colors, no sections/effects. Upgraded in Step 2 (Structure & Scroll).
export default function App() {
  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center px-6">
      <div className="max-w-2xl text-center">
        <div className="flex items-center justify-center gap-2.5 mb-10">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "var(--color-primary)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M3 17l6-6 4 4 8-8" stroke="oklch(18% 0.02 155)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-display font-bold text-lg tracking-tight">FleetIntel</span>
        </div>
        <h1 className="font-display font-black text-4xl md:text-6xl leading-[1.05] tracking-tighter">
          See exactly what every vehicle costs you —{" "}
          <span style={{ color: "var(--color-primary)" }}>before it becomes a problem.</span>
        </h1>
        <p className="mt-8 text-lg leading-relaxed" style={{ color: "var(--color-muted)" }}>
          FleetIntel turns scattered vehicle costs — fuel, maintenance, downtime, parts — into one
          number your team can trust. Built for logistics, transport, EMS, and security fleets
          across Africa.
        </p>
      </div>
    </div>
  );
}
