import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import HeroVideoBoxed from "@/components/HeroVideoBoxed";

// /hero-a: variant A of the "video in the hero" comparison -- live animated dashboard graphic in
// the existing boxed side-panel, same 2-column layout as the shipped Hero.jsx. See HeroVideoBoxed.jsx.
export default function HeroCompareA() {
  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-ink)" }}>
      <Nav />
      <div className="max-w-6xl mx-auto px-6 pt-6">
        <span className="eyebrow" style={{ color: "var(--color-primary)" }}>Variant A — boxed, same layout as shipped</span>
      </div>
      <HeroVideoBoxed />
      <Footer />
    </div>
  );
}
