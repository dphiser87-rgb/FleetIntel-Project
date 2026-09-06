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
