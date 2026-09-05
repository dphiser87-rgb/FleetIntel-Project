import { useEffect, useState } from "react";
import DashboardMotionGraphic from "./DashboardMotionGraphic";
import { trackEvent } from "@/utils/trackEvent";

// Full-bleed hero background: chosen 2026-09-05 after comparing this against a boxed-panel
// alternative at /hero-a and /hero-b. The background is DashboardMotionGraphic, a live-rendered
// animation (KPI tiles counting up, gauges filling, a trend line drawing), not an actual video file
// or a real screenshot -- see that component's own comment for why. This replaces the earlier boxed
// real-screenshot treatment; the real screenshot itself is still used elsewhere (Showcase.jsx).
export default function Hero() {
  const [mounted, setMounted] = useState(false);

  // Alive before the first scroll -- plays on mount, not gated behind an IntersectionObserver.
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <section className="relative border-b overflow-hidden" style={{ borderColor: "var(--color-border)" }}>
      {/* Desktop only: the background bleed needs real width to sit beside the text without
          colliding with it. At full width on a phone it renders directly underneath the text --
          confirmed broken during comparison (numbers/labels overlapping the headline). */}
      <div
        className={`hidden md:flex absolute inset-y-0 right-0 w-2/3 items-center pr-10 transition-opacity duration-700 ${mounted ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      >
        <div className="w-full max-w-xl ml-auto">
          <DashboardMotionGraphic />
        </div>
      </div>

      {/* Scrim: solid at the text edge, fully transparent by the graphic's side, so the graphic still
          reads clearly on its own half while the text stays legible over its own. Desktop only, same
          reason as above -- on mobile there's no bleed underneath to scrim against. */}
      <div
        className="hidden md:block absolute inset-0"
        style={{ background: "linear-gradient(to right, var(--color-bg) 0%, var(--color-bg) 38%, color-mix(in oklab, var(--color-bg) 55%, transparent) 60%, transparent 85%)" }}
      />

      <div className="relative max-w-6xl mx-auto px-6 py-20 md:py-32">
        <div
          className={`max-w-xl transition-[opacity,translate] duration-700 ease-out ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <div className="eyebrow mb-4">Fleet cost intelligence · Africa · Offline-first</div>
          <h1 className="font-display font-black text-4xl md:text-6xl leading-[1.02]">
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
              className="rounded-full px-6 py-3.5 text-xs uppercase tracking-widest font-semibold transition-[transform,filter] hover:scale-[1.02] hover:brightness-110 active:scale-95"
              style={{ background: "var(--color-primary)", color: "oklch(18% 0.02 155)" }}
            >
              Book a call
            </a>
            <a
              href="mailto:hello@fleetintel.africa?subject=Request%20a%20demo"
              data-testid="hero-demo"
              onClick={() => trackEvent("request_demo_click")}
              className="rounded-full px-6 py-3.5 text-xs uppercase tracking-widest border transition-[transform,border-color] hover:scale-[1.02] hover:[border-color:var(--color-primary)] active:scale-95"
              style={{ borderColor: "var(--color-border)" }}
            >
              Request a demo
            </a>
          </div>
          <p className="mt-4 text-xs" style={{ color: "var(--color-muted)" }}>
            Works offline. Syncs the moment signal returns.
          </p>

          {/* Mobile fallback: the graphic stacks below the text instead of bleeding behind it. */}
          <div className="md:hidden mt-10">
            <DashboardMotionGraphic />
          </div>
        </div>
      </div>
    </section>
  );
}
