import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Industries from "./components/Industries";
import Scenarios from "./components/Scenarios";
import Features from "./components/Features";
import WhyFleetIntel from "./components/WhyFleetIntel";
import ConversionBand from "./components/ConversionBand";
import Footer from "./components/Footer";

export default function App() {
  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)", color: "var(--color-ink)" }}>
      <Nav />
      <Hero />
      <Industries />
      <Scenarios />
      <Features />
      <WhyFleetIntel />
      <ConversionBand />
      <Footer />
    </div>
  );
}
