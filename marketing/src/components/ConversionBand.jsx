import Reveal from "./Reveal";

// No hours/address/map fields -- those are the "local business" spine's conversion essentials,
// which doesn't apply here (see design.md: "something else" spine, adapted). Ours are just the two
// real actions plus Login, already wired with real mailto/link targets, not placeholders.
export default function ConversionBand() {
  return (
    <section className="border-b" style={{ borderColor: "var(--color-border)" }}>
      <Reveal className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight mb-8">
          See your fleet's real costs. Book a call.
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="mailto:hello@fleetintel.africa?subject=Book%20a%20call"
            data-testid="band-book-call"
            className="rounded-full px-6 py-3.5 text-xs uppercase tracking-widest font-semibold transition-[transform,filter] hover:scale-[1.02] hover:brightness-110 active:scale-95"
            style={{ background: "var(--color-primary)", color: "oklch(18% 0.02 155)" }}
          >
            Book a call
          </a>
          <a
            href="mailto:hello@fleetintel.africa?subject=Request%20a%20demo"
            data-testid="band-demo"
            className="rounded-full px-6 py-3.5 text-xs uppercase tracking-widest border transition-[transform,border-color] hover:scale-[1.02] hover:[border-color:var(--color-primary)] active:scale-95"
            style={{ borderColor: "var(--color-border)" }}
          >
            Request a demo
          </a>
        </div>
      </Reveal>
    </section>
  );
}
