import { useEffect, useState } from "react";
import { useParallax } from "../hooks/useReveal";
import ImagePlaceholder from "./ImagePlaceholder";
import { trackEvent } from "@/utils/trackEvent";

export default function Hero() {
  const [mounted, setMounted] = useState(false);
  const parallaxRef = useParallax(0.08);

  // Alive before the first scroll -- plays on mount, not gated behind an IntersectionObserver.
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <section className="border-b overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-2 gap-14 items-center">
        <div
          className={`transition-[opacity,transform] duration-700 ease-out ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="eyebrow mb-4">Fleet cost intelligence · Africa</div>
          <h1 className="font-display font-black text-4xl md:text-6xl leading-[1.02] tracking-tighter">
            See exactly what every vehicle costs you.{" "}
            <span style={{ color: "var(--color-primary)" }}>Before it becomes a problem.</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed" style={{ color: "var(--color-muted)" }}>
            Fuel, maintenance, downtime, parts: FleetIntel turns scattered vehicle costs into one
            number your team can trust. Built for logistics, transport, EMS, and security fleets
            across Africa.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="mailto:hello@fleetintel.africa?subject=Book%20a%20call"
              data-testid="hero-book-call"
              onClick={() => trackEvent("book_call_click")}
              className="rounded-full px-6 py-3.5 text-xs uppercase tracking-widest font-semibold transition-transform active:scale-95"
              style={{ background: "var(--color-primary)", color: "oklch(18% 0.02 155)" }}
            >
              Book a call
            </a>
            <a
              href="mailto:hello@fleetintel.africa?subject=Request%20a%20demo"
              data-testid="hero-demo"
              onClick={() => trackEvent("request_demo_click")}
              className="rounded-full px-6 py-3.5 text-xs uppercase tracking-widest border transition-transform active:scale-95"
              style={{ borderColor: "var(--color-border)" }}
            >
              Request a demo
            </a>
          </div>
        </div>

        <div
          ref={parallaxRef}
          className={`transition-[opacity,transform] duration-700 delay-150 ease-out ${
            mounted ? "opacity-100" : "opacity-0"
          }`}
        >
          <ImagePlaceholder
            src="/assets/dashboard.png"
            alt="FleetIntel's KPI dashboard, showing real cost, downtime, and fuel figures"
            aspect="aspect-[4/3]"
          />
        </div>
      </div>
    </section>
  );
}
