import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { AccessibilitySkipBar } from "@/components/AccessibilitySkipBar";
import { trackEvent } from "@/utils/trackEvent";

// Dedicated /contact page (mounted by main.jsx's existing pathname-check pattern -- no router).
// Contact details only, no form: this static site has no backend to submit one to yet. Only real,
// verified contact info is used -- hello@fleetintel.africa, the same address already live in
// Hero's and Footer's mailto links -- no fabricated phone number or physical address.
export default function Contact() {
  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-ink)" }}>
      <AccessibilitySkipBar label="Skip to main content" />
      <Nav />

      <div id="primary-content" tabIndex={-1}>
        <section className="max-w-3xl mx-auto px-6 py-20 md:py-28">
          <div className="eyebrow mb-4">Contact</div>
          <h1 className="font-display font-black text-4xl md:text-5xl leading-[1.05]">
            Talk to us.
          </h1>
          <p className="mt-6 text-lg leading-relaxed" style={{ color: "var(--color-muted)" }}>
            For a call, a demo, or anything else, reach us directly at{" "}
            <a
              href="mailto:hello@fleetintel.africa"
              onClick={() => trackEvent("contact_email_click")}
              className="underline opacity-90 hover:opacity-100 transition-opacity"
              style={{ color: "var(--color-primary)" }}
            >
              hello@fleetintel.africa
            </a>
            .
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href="mailto:hello@fleetintel.africa?subject=Book%20a%20call"
              data-testid="contact-book-call"
              onClick={() => trackEvent("book_call_click", { source: "contact_page" })}
              className="rounded-full px-6 py-3.5 text-xs uppercase tracking-widest font-semibold transition-[transform,filter] hover:scale-[1.02] hover:brightness-110 active:scale-95"
              style={{ background: "var(--color-primary)", color: "oklch(18% 0.02 155)" }}
            >
              Book a call
            </a>
            <a
              href="mailto:hello@fleetintel.africa?subject=Request%20a%20demo"
              data-testid="contact-demo"
              onClick={() => trackEvent("request_demo_click", { source: "contact_page" })}
              className="rounded-full px-6 py-3.5 text-xs uppercase tracking-widest border transition-[transform,border-color] hover:scale-[1.02] hover:[border-color:var(--color-primary)] active:scale-95"
              style={{ borderColor: "var(--color-border)" }}
            >
              Request a demo
            </a>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}
