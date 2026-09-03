import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Industries from "./components/Industries";
import WhyFleetIntel from "./components/WhyFleetIntel";
import Showcase from "./components/Showcase";
import Scenarios from "./components/Scenarios";
import Features from "./components/Features";
import ConversionBand from "./components/ConversionBand";
import Footer from "./components/Footer";
import ScrollPrompt from "./components/ScrollPrompt";
import { AccessibilitySkipBar } from "./components/AccessibilitySkipBar";

export default function App() {
  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-ink)" }}>
      <AccessibilitySkipBar label="Skip to main content" />
      <Nav />
      {/* Skip target: bypasses the repeated Nav chrome, landing at the actual page content.
          tabIndex={-1} so focus reliably moves here on activation (some browsers otherwise just
          scroll without moving focus). */}
      <div id="primary-content" tabIndex={-1}>
        <Hero />
        <ScrollPrompt />
        <Industries />
        <WhyFleetIntel />
        <Showcase />
        <Scenarios />
        <Features />
        <ConversionBand />
      </div>
      <Footer />
    </div>
  );
}
