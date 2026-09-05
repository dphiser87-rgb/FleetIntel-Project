import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import HeroVideoBleed from "@/components/HeroVideoBleed";

// /hero-b: variant B of the "video in the hero" comparison -- the full-bleed Webfleet-style
// treatment, animated graphic as the hero background with text over a scrim. See HeroVideoBleed.jsx.
export default function HeroCompareB() {
  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-ink)" }}>
      <Nav />
      <div className="max-w-6xl mx-auto px-6 pt-6">
        <span className="eyebrow" style={{ color: "var(--color-primary)" }}>Variant B — full-bleed background</span>
      </div>
      <HeroVideoBleed />
      <Footer />
    </div>
  );
}
