import Nav from "./components/Nav";
import Hero from "./components/Hero";
import Industries from "./components/Industries";
import Features from "./components/Features";
import WhyFleetIntel from "./components/WhyFleetIntel";
import Footer from "./components/Footer";

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero />
      <Industries />
      <Features />
      <WhyFleetIntel />
      <Footer />
    </div>
  );
}
