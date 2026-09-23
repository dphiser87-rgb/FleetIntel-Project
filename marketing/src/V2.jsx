import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/utils/trackEvent";

// --- Design C, "Datasheet" -- an alternative structure for the same site, at /v2 ------------------
//
// Same content, same palette, same fonts as the live site. What changes is composition. The live
// site applies one section shell eight times (full-bleed dark band, border-b, eyebrow -> heading ->
// content, identical padding), and that repetition -- not the colours or the copy -- is what reads
// as machine-made. Every move here exists to break that:
//
//   1. A fixed left rail carries the section index, so sections are numbered parts of one document
//      rather than eight interchangeable slabs.
//   2. Sections sit on a 12-column grid at different spans and offsets instead of all being full
//      width, so the eye lands somewhere different each time.
//   3. Features becomes a spec table, not a 3x2 card grid -- design.md flags that grid as the
//      closest thing on the site to the "identical card grid" anti-pattern.
//   4. One inverted band. Eight dark sections in a row is the strongest tell of a generated page;
//      a single light section breaks the run and gives the page a middle.
//   5. Deliberate density contrast: the hero and CTA are airy, the spec table and index are tight.
//   6. One screenshot breaks the container and bleeds to the viewport edge.
//
// Content below is copied verbatim from the live components rather than imported, so this page can
// be deleted or promoted without touching the shipped site. If it wins, consolidate then.

const APP_URL = "https://app.fleetintel.africa";

const SECTIONS = [
  { id: "v2-intro", label: "Intro" },
  { id: "v2-sectors", label: "Sectors" },
  { id: "v2-why", label: "Why" },
  { id: "v2-inside", label: "Inside" },
  { id: "v2-field", label: "In the field" },
  { id: "v2-contact", label: "Contact" },
];

const INDUSTRIES = [
  "Logistics & distribution",
  "Transportation",
  "Emergency medical services",
  "Security & armed response",
  "Services",
  "Any business with a moving vehicle",
];

const POINTS = [
  {
    title: "An approval chain that matches how your team works",
    body: "Costing does not just get submitted. It moves through workshop, operations, and finance in sequence. No dedicated workshop manager? Reassign who approves costing without changing how the workflow runs.",
  },
  {
    title: "Works where the signal doesn't",
    body: "Whether it's a mechanic, technician, or driver, inspections and job updates queue locally on their phone the moment the network drops, and sync automatically the moment it's back. No lost checklists. No re-work.",
  },
  {
    title: "Different roles. Different access. One platform.",
    body: "Admins, managers, workshop heads, operations, finance, and mechanics each see exactly what their job needs. Configurable per person, not one shared view for everyone.",
  },
];

const FEATURES = [
  { name: "Cost-intelligence dashboard", body: "KPIs, cost per vehicle, downtime, and anomaly detection in one view. Not a spreadsheet reconciled at month end." },
  { name: "Digital inspections & checklists", body: "Field teams run structured vehicle checklists from a phone. Offline-capable, syncing automatically once back online." },
  { name: "Maintenance & costing approvals", body: "Parts requisitions and job costing move through a real approval chain. Workshop, operations, and finance each get their say." },
  { name: "Drivers & incidents", body: "Driver records, license expiry tracking, and incident reporting with photo evidence. Built for response fleets and depot operations alike." },
  { name: "Offline-first mobile app", body: "Mechanics and inspectors keep working with no signal. Submissions queue locally and sync the moment connectivity returns." },
  { name: "Open API for telematics", body: "Already using a telematics provider? Connect it for automatic fuel, kilometer, and driver-assignment data. No need to rip and replace." },
];

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
  },
];

const HERO_STATS = [
  { k: "Total monthly cost", v: "R162,400" },
  { k: "Cost per vehicle", v: "R5,800" },
  { k: "Fleet utilization", v: "85.7%" },
  { k: "Downtime / vehicle", v: "1.4d" },
];

// --- primitives ----------------------------------------------------------------------------------

function useReveal() {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { rootMargin: "-40px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, shown];
}

function Rise({ children, delay = 0, className = "" }) {
  const [ref, shown] = useReveal();
  return (
    <div
      ref={ref}
      className={`${className} transition-[opacity,translate] duration-700 ease-out ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

// The page's ruling unit: a hairline plus a mono label. Used instead of a bordered card wherever
// something needs separating, which is what keeps the page from turning back into a grid of boxes.
function Rule({ label, tone = "dark" }) {
  const line = tone === "dark" ? "var(--color-border)" : "rgba(8,8,9,0.18)";
  const text = tone === "dark" ? "var(--color-muted)" : "rgba(8,8,9,0.55)";
  return (
    <div className="flex items-center gap-4">
      <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] shrink-0" style={{ color: text }}>{label}</span>
      <span className="h-px flex-1" style={{ background: line }} />
    </div>
  );
}

// Shared shell. Sections choose their own column span, so "full width" stops being automatic.
function Band({ id, children, tone = "dark", tight = false, className = "" }) {
  return (
    <section
      id={id}
      className={className}
      style={tone === "light"
        ? { background: "var(--color-ink)", color: "#08080a" }
        : { background: "var(--color-bg)", color: "var(--color-ink)" }}
    >
      <div className={`mx-auto w-full max-w-[1400px] px-6 md:px-10 lg:pl-28 lg:pr-16 ${tight ? "py-16 md:py-20" : "py-24 md:py-36"}`}>
        {children}
      </div>
    </section>
  );
}

// --- the fixed index rail ------------------------------------------------------------------------

function Spine({ active }) {
  return (
    <nav
      aria-label="Section index"
      className="hidden lg:flex fixed left-0 top-0 bottom-0 z-40 w-20 flex-col items-center justify-center gap-5 border-r"
      style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
    >
      {SECTIONS.map((s, i) => {
        const on = active === i;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            title={s.label}
            className="group flex flex-col items-center gap-1.5 transition-opacity duration-300"
            style={{ opacity: on ? 1 : 0.32 }}
          >
            <span className="font-mono text-[0.65rem] tracking-widest" style={{ color: on ? "var(--color-primary)" : "var(--color-muted)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span
              className="w-px transition-all duration-500"
              style={{ height: on ? 26 : 12, background: on ? "var(--color-primary)" : "var(--color-border)" }}
            />
          </a>
        );
      })}
    </nav>
  );
}

// --- sections ------------------------------------------------------------------------------------

function TopBar() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    // Opaque rather than translucent once scrolled. Over the inverted band a blurred dark bar reads
    // as a rendering artifact -- a solid one reads as deliberate chrome.
    const f = () => setSolid(window.scrollY > 80);
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <header
      className="sticky top-0 z-30 border-b transition-colors duration-500"
      style={{
        background: solid ? "var(--color-bg)" : "transparent",
        borderColor: solid ? "var(--color-border)" : "transparent",
      }}
    >
      <div className="mx-auto w-full max-w-[1400px] px-6 md:px-10 lg:pl-28 lg:pr-16 py-5 flex items-center justify-between gap-6">
        <a href="/v2" className="flex items-baseline gap-3">
          <span className="font-display font-black text-lg tracking-tight">FleetIntel</span>
          <span className="hidden sm:inline font-mono text-[0.6rem] uppercase tracking-[0.25em]" style={{ color: "var(--color-muted)" }}>
            Fleet cost intelligence
          </span>
        </a>
        <div className="flex items-center gap-8">
          <a href="/" className="hidden md:inline font-mono text-[0.65rem] uppercase tracking-[0.2em] hover:opacity-100 opacity-60 transition-opacity">
            Current site
          </a>
          <a
            href={`${APP_URL}/login`}
            className="font-mono text-[0.65rem] uppercase tracking-[0.2em] border px-4 py-2 transition-colors hover:[border-color:var(--color-primary)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            Login
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <Band id="v2-intro" className="relative overflow-hidden">
      <div className="grid grid-cols-12 gap-y-14">
        {/* headline sits on 7 of 12 and starts at the left edge -- not centred, not 50/50 */}
        <div className="col-span-12 lg:col-span-7">
          <Rise>
            <div className="font-mono text-[0.65rem] uppercase tracking-[0.25em] mb-8" style={{ color: "var(--color-primary)" }}>
              01 / Fleet cost intelligence, Africa
            </div>
            <h1 className="font-display font-black text-[2.7rem] sm:text-6xl xl:text-7xl leading-[0.98]">
              See exactly what every vehicle costs you.
              <span className="block mt-2" style={{ color: "var(--color-primary)" }}>Before it becomes a liability.</span>
            </h1>
          </Rise>
          <Rise delay={120}>
            <p className="mt-10 text-lg leading-relaxed max-w-[54ch]" style={{ color: "var(--color-muted)" }}>
              Fuel. Maintenance. Downtime. Parts. FleetIntel brings every vehicle cost together, giving
              your team one clear number to understand, control, and reduce fleet costs.
            </p>
            <p className="mt-4 font-mono text-sm" style={{ color: "var(--color-muted)" }}>Built for African fleets.</p>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <a
                href="mailto:hello@fleetintel.africa?subject=Book%20a%20call"
                onClick={() => trackEvent("book_call_click")}
                className="font-mono text-[0.7rem] uppercase tracking-[0.2em] px-7 py-4 transition-[filter,transform] hover:brightness-110 active:scale-95"
                style={{ background: "var(--color-primary)", color: "oklch(18% 0.02 155)" }}
              >
                Book a call
              </a>
              <a
                href="mailto:hello@fleetintel.africa?subject=Request%20a%20demo"
                onClick={() => trackEvent("request_demo_click")}
                className="font-mono text-[0.7rem] uppercase tracking-[0.2em] px-7 py-4 border transition-colors hover:[border-color:var(--color-primary)]"
                style={{ borderColor: "var(--color-border)" }}
              >
                Request a demo
              </a>
            </div>
            <p className="mt-6 font-mono text-xs" style={{ color: "var(--color-muted)" }}>
              Works offline. Syncs the moment signal returns.
            </p>
          </Rise>
        </div>

        {/* the numbers as a ruled readout, not a floating card */}
        <div className="col-span-12 lg:col-span-4 lg:col-start-9 lg:pt-4">
          <Rise delay={220}>
            <Rule label="Live readout" />
            <dl className="mt-2">
              {HERO_STATS.map((s) => (
                <div
                  key={s.k}
                  className="flex items-baseline justify-between gap-6 py-5 border-b"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <dt className="font-mono text-[0.65rem] uppercase tracking-[0.18em]" style={{ color: "var(--color-muted)" }}>{s.k}</dt>
                  <dd className="font-mono text-xl xl:text-2xl font-bold tabular-nums">{s.v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 font-mono text-[0.6rem] uppercase tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
              Illustrative figures
            </p>
          </Rise>
        </div>
      </div>
    </Band>
  );
}

function Sectors() {
  return (
    <Band id="v2-sectors" tight className="border-y" >
      <Rise>
        <Rule label="02 / Built for" />
        {/* a running index, not a row of pills */}
        <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-16">
          {INDUSTRIES.map((n, i) => (
            <li
              key={n}
              className="flex items-baseline gap-5 py-4 border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="font-mono text-[0.65rem] tabular-nums" style={{ color: "var(--color-primary)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[0.95rem]">{n}</span>
            </li>
          ))}
        </ul>
      </Rise>
    </Band>
  );
}

function Why() {
  return (
    <Band id="v2-why">
      <Rise>
        <Rule label="03 / Why FleetIntel" />
        <h2 className="mt-10 font-display font-bold text-3xl md:text-5xl tracking-tight max-w-[18ch]">
          Built for how fleet costing actually happens.
        </h2>
      </Rise>
      <div className="mt-20">
        {POINTS.map((p, i) => (
          <Rise key={p.title} delay={i * 90}>
            {/* hanging numeral in the margin, copy on an indented span -- an editorial list, and
                each row steps further right so the block reads as a staircase, not a stack */}
            <div
              className="grid grid-cols-12 gap-y-4 md:gap-x-6 py-12 border-t"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="col-span-12 md:col-span-2">
                <span className="font-mono text-4xl md:text-5xl font-bold tabular-nums" style={{ color: "var(--color-primary)", opacity: 0.35 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className={`col-span-12 md:col-span-6 ${i === 1 ? "md:col-start-4" : i === 2 ? "md:col-start-5" : "md:col-start-3"}`}>
                <h3 className="font-display font-bold text-xl md:text-2xl mb-4">{p.title}</h3>
                <p className="leading-relaxed max-w-[62ch]" style={{ color: "var(--color-muted)" }}>{p.body}</p>
              </div>
            </div>
          </Rise>
        ))}
      </div>
    </Band>
  );
}

// The inverted band, and the section that most needed to stop being a card grid.
function Inside() {
  return (
    <Band id="v2-inside" tone="light">
      <Rise>
        <Rule label="04 / What's inside" tone="light" />
        <h2 className="mt-10 font-display font-black text-3xl md:text-5xl tracking-tight max-w-[16ch]">
          Know more. Spend less. Run smarter.
        </h2>
      </Rise>
      <Rise delay={120}>
        <div className="mt-16 border-t" style={{ borderColor: "rgba(8,8,9,0.18)" }}>
          {FEATURES.map((f, i) => (
            <div
              key={f.name}
              className="group grid grid-cols-12 md:gap-x-6 gap-y-2 py-7 border-b transition-colors duration-300"
              style={{ borderColor: "rgba(8,8,9,0.18)" }}
              data-testid={`v2-feature-${i}`}
            >
              <div className="col-span-2 md:col-span-1 font-mono text-[0.7rem] tabular-nums pt-1" style={{ color: "rgba(8,8,9,0.45)" }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="col-span-10 md:col-span-4">
                <h3 className="font-display font-bold text-lg md:text-xl">{f.name}</h3>
              </div>
              <div className="col-span-12 md:col-span-7 md:col-start-6">
                <p className="text-[0.95rem] leading-relaxed" style={{ color: "rgba(8,8,9,0.7)" }}>{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Rise>
    </Band>
  );
}

// Breaks the container on purpose: the only element on the page that touches both viewport edges.
function Bleed() {
  return (
    <section style={{ background: "var(--color-bg)" }}>
      <div className="mx-auto w-full max-w-[1400px] px-6 md:px-10 lg:pl-28 lg:pr-16 pt-24 md:pt-32">
        <Rise>
          <Rule label="Command centre" />
          <h2 className="mt-8 font-display font-bold text-2xl md:text-4xl tracking-tight max-w-[22ch]">
            Every KPI tile can be set, configured, and rearranged.
          </h2>
          <p className="mt-5 max-w-[58ch] leading-relaxed" style={{ color: "var(--color-muted)" }}>
            Each user's layout is theirs alone, and stays that way across every device they log in from.
          </p>
        </Rise>
      </div>
      <Rise delay={140}>
        <div className="mt-14 lg:ml-20 border-y" style={{ borderColor: "var(--color-border)" }}>
          <img
            src="/assets/dashboard.png"
            alt="FleetIntel's Fleet Operations dashboard, showing configurable KPI tiles with a 10/10 tiles indicator"
            className="w-full h-auto block"
          />
        </div>
      </Rise>
    </section>
  );
}

function Field() {
  return (
    <Band id="v2-field">
      <Rise>
        <Rule label="05 / In the field" />
      </Rise>
      <div className="mt-16 space-y-28 md:space-y-40">
        {SCENARIOS.map((s, i) => {
          const flip = i % 2 === 1;
          return (
            <Rise key={s.tag}>
              {/* alternating offsets: the caption and the shot swap sides and change span, so no two
                  scenarios share a composition */}
              <div className="grid grid-cols-12 gap-y-10 md:gap-x-10 items-center">
                <div className={`col-span-12 md:col-span-5 ${flip ? "md:col-start-8 md:order-2" : ""}`}>
                  <div className="font-mono text-[0.65rem] uppercase tracking-[0.2em] mb-5" style={{ color: "var(--color-primary)" }}>
                    {s.tag}
                  </div>
                  <h3 className="font-display font-bold text-2xl md:text-3xl leading-tight mb-5">{s.title}</h3>
                  <p className="leading-relaxed max-w-[52ch]" style={{ color: "var(--color-muted)" }}>{s.body}</p>
                  {i === 2 && (
                    <div className="mt-8 border-l-2 pl-5 py-1" style={{ borderColor: "var(--color-alert)" }}>
                      <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
                        Maintenance spend, this vehicle
                      </div>
                      <div className="font-mono text-3xl font-bold mt-1" style={{ color: "var(--color-alert)" }}>
                        +18%
                        <span className="text-sm font-normal ml-2" style={{ color: "var(--color-muted)" }}>vs last month</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className={`col-span-12 md:col-span-6 ${flip ? "md:col-start-1 md:order-1" : "md:col-start-7"}`}>
                  <div className="border" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                    <img src={s.shot} alt={s.alt} className="w-full h-auto block" loading="lazy" />
                  </div>
                </div>
              </div>
            </Rise>
          );
        })}
      </div>
    </Band>
  );
}

function Close() {
  return (
    <Band id="v2-contact" className="border-t">
      <div className="grid grid-cols-12 gap-y-10">
        <div className="col-span-12 lg:col-span-7">
          <Rise>
            <Rule label="06 / Next" />
            {/* left-aligned, not centred -- the live site centres this and it's the most template-ish
                moment on the page */}
            <h2 className="mt-10 font-display font-black text-4xl md:text-6xl tracking-tight leading-[1.02] max-w-[16ch]">
              See your fleet's real costs.
              <span className="block" style={{ color: "var(--color-primary)" }}>Book a call.</span>
            </h2>
            <div className="mt-12 flex flex-wrap items-center gap-4">
              <a
                href="mailto:hello@fleetintel.africa?subject=Book%20a%20call"
                onClick={() => trackEvent("book_call_click")}
                className="font-mono text-[0.7rem] uppercase tracking-[0.2em] px-7 py-4 transition-[filter,transform] hover:brightness-110 active:scale-95"
                style={{ background: "var(--color-primary)", color: "oklch(18% 0.02 155)" }}
              >
                Book a call
              </a>
              <a
                href="mailto:hello@fleetintel.africa?subject=Request%20a%20demo"
                className="font-mono text-[0.7rem] uppercase tracking-[0.2em] px-7 py-4 border transition-colors hover:[border-color:var(--color-primary)]"
                style={{ borderColor: "var(--color-border)" }}
              >
                Request a demo
              </a>
            </div>
          </Rise>
        </div>
        <div className="col-span-12 lg:col-span-4 lg:col-start-9 lg:pt-6">
          <Rise delay={120}>
            <Rule label="Direct" />
            <a href="mailto:hello@fleetintel.africa" className="block mt-5 font-mono text-sm hover:opacity-100 opacity-80 transition-opacity">
              hello@fleetintel.africa
            </a>
            <p className="mt-6 text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
              Works offline. Syncs the moment signal returns.
            </p>
          </Rise>
        </div>
      </div>
    </Band>
  );
}

function FooterV2() {
  return (
    <footer style={{ background: "var(--color-bg)" }} className="border-t" >
      <div className="mx-auto w-full max-w-[1400px] px-6 md:px-10 lg:pl-28 lg:pr-16 py-14 flex flex-col md:flex-row md:items-end justify-between gap-10">
        <div>
          <div className="font-display font-black text-base tracking-tight">FleetIntel</div>
          <p className="mt-3 font-display font-bold text-sm tracking-tight max-w-xs">
            Your Fleet. Your Control. Your Savings.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {[["Current site", "/"], ["Why", "#v2-why"], ["Inside", "#v2-inside"],
            ["In the field", "#v2-field"], ["Contact", "/contact"], ["Login", `${APP_URL}/login`]].map(([l, h]) => (
            <a key={l} href={h} className="font-mono text-[0.65rem] uppercase tracking-[0.2em] opacity-60 hover:opacity-100 transition-opacity">
              {l}
            </a>
          ))}
        </div>
      </div>
      <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
        <div className="mx-auto w-full max-w-[1400px] px-6 md:px-10 lg:pl-28 lg:pr-16 py-5 font-mono text-[0.6rem] uppercase tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
          © {new Date().getFullYear()} FleetIntel. Alternative layout at /v2.
        </div>
      </div>
    </footer>
  );
}

// --- page ----------------------------------------------------------------------------------------

export default function V2() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        // whichever tracked section currently covers the middle of the viewport wins
        const vis = entries.filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!vis) return;
        const i = SECTIONS.findIndex((s) => s.id === vis.target.id);
        if (i >= 0) setActive(i);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div style={{ background: "var(--color-bg)", color: "var(--color-ink)" }} className="min-h-screen">
      <Spine active={active} />
      <TopBar />
      <main>
        <Hero />
        <Sectors />
        <Why />
        <Inside />
        <Bleed />
        <Field />
        <Close />
      </main>
      <FooterV2 />
    </div>
  );
}
