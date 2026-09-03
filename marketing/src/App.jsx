// Step 1 bare v1 page, per design.md ("Night Ops"). Deliberately minimal -- brand, thesis, lede
// only, bg/ink colors, no sections/effects. Upgraded in Step 2 (Structure & Scroll).
export default function App() {
  return (
    <div className="min-h-screen bg-bg text-ink flex items-center justify-center px-6">
      <div className="max-w-2xl text-center">
        <div className="overline mb-6">FleetIntel</div>
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
