const APP_URL = "https://app.fleetintel.africa";

export default function Hero() {
  return (
    <section className="noise-bg border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-24 md:py-32">
        <div className="eyebrow mb-4">Fleet cost intelligence</div>
        <h1 className="font-display font-black text-5xl md:text-7xl leading-[0.95] tracking-tighter max-w-3xl">
          Every dollar,<br />
          <span className="text-primary">every mile,</span><br />
          accounted for.
        </h1>
        <p className="mt-8 text-lg text-muted max-w-xl leading-relaxed">
          Built for African logistics, transport, EMS, and security operators — anyone running a
          fleet of vehicles. KPI dashboards, digital inspections, and a maintenance cost-approval
          pipeline, connected end to end.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href={`${APP_URL}/login`}
            data-testid="hero-login"
            className="bg-primary text-primary-foreground px-6 py-3.5 text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors"
          >
            Login to FleetIntel
          </a>
          <a
            href="mailto:hello@fleetintel.africa?subject=Request%20a%20demo"
            data-testid="hero-demo"
            className="border border-border px-6 py-3.5 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
          >
            Request a demo
          </a>
        </div>
      </div>
    </section>
  );
}
