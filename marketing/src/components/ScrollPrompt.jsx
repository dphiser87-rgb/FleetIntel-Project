import { useEffect, useState } from "react";

// Fades out once the visitor scrolls past the hero -- a wayfinding cue, not decorative motion, so
// it's the one deliberate exception to the "no looping animation" rule in design.md (still fully
// neutralized under prefers-reduced-motion via the global rule in index.css).
export default function ScrollPrompt() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleScroll = () => setIsVisible(window.scrollY <= 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-3 transition-all duration-500 ease-out select-none
        ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}
      aria-hidden="true"
      data-testid="scroll-prompt"
    >
      <div
        className="w-6 h-10 rounded-full border flex justify-center p-1.5 backdrop-blur-xs"
        style={{ borderColor: "var(--color-muted)" }}
      >
        <div className="w-1 h-2 rounded-full animate-scroll-dot" style={{ background: "var(--color-primary)" }} />
      </div>
      <span className="eyebrow">Scroll</span>
    </div>
  );
}
