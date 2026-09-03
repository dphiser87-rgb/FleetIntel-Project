import { useEffect } from "react";
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
  useEffect(() => {
    // The browser's native scroll-to-fragment only fires once, right after the initial HTML
    // loads -- at that point this is a client-rendered app, so the #hash target (e.g. #features)
    // doesn't exist in the DOM yet, and the browser gives up silently. Needed now that Nav/Footer
    // are shared with /contact: a link like /#features triggers a real page load (not a same-page
    // anchor click), which is exactly the case the browser can't handle on its own.
    if (!window.location.hash) return;
    const id = window.location.hash.slice(1);
    const scrollToHash = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView();
    };
    // Scroll once immediately (element exists once React's initial render commits), then again
    // once every image has finished loading -- section images loading in below the fold shift the
    // page's layout after that first scroll, silently undoing it. If 'load' already fired before
    // this effect ran, the listener would never fire, so fall back to a second immediate call.
    scrollToHash();
    if (document.readyState === "complete") {
      scrollToHash();
    } else {
      window.addEventListener("load", scrollToHash);
      return () => window.removeEventListener("load", scrollToHash);
    }
  }, []);

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
