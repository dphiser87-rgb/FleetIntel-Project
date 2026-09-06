import { useEffect, useRef, useState } from "react";

// Hides while scrolling down, reappears the moment you scroll up -- chosen over a version that
// stayed visible for the whole page after comparing both live. Still neutralized entirely under
// prefers-reduced-motion via the global rule in index.css.
export default function ScrollPrompt() {
  const [isVisible, setIsVisible] = useState(true);
  const lastY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      const goingUp = y < lastY.current;
      setIsVisible(goingUp || y <= 80);
      lastY.current = y;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className={`hidden md:flex fixed bottom-10 left-1/2 -translate-x-1/2 z-40 flex-col items-center gap-3 transition-all duration-500 ease-out select-none
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
