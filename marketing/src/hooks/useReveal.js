import { useEffect, useRef, useState } from "react";

// "Smooth & premium" reveal: fade + rise once when a section first enters view. Motion budget is
// spent here and on the hero only, per design.md's restraint rule -- no per-card stagger grids,
// no infinite/looping animation. prefers-reduced-motion is handled globally in index.css.
export function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return [ref, visible];
}

// Lightweight scroll-tied parallax for the hero only (per design.md restraint: hero + reveals,
// nothing more) -- a plain rAF-throttled scroll listener rather than a new dependency.
export function useParallax(strength = 0.15) {
  const ref = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        el.style.transform = `translateY(${window.scrollY * strength}px)`;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [strength]);

  return ref;
}
