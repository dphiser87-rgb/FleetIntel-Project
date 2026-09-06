import { useRef, useState, useEffect } from "react";

// Motion-style comparison demo only. Adapted from a user-provided TSX snippet (stripped the
// TypeScript interface/annotations -- this project is plain JS) that unmounted children whenever
// they scrolled out of view, remounting on re-entry. That broke both patterns used on /demo and
// /demo2: useScroll's listener never recovers when its target mounts on a delayed re-render (the
// bug fixed in HorizontalNarrative/MarketingShowcase), and whileInView's viewport={{ once: true }}
// would replay its entrance animation every re-entry instead of firing once, ever.
//
// This version only ever mounts once (on first approach, via the same 30%-rootMargin early
// trigger) and then stays mounted for good -- it still avoids paying render/layout cost for
// sections far below the fold on initial load, without the unmount-driven regressions above.
export function ScrollVisibilityGate({ children, estimatedHeight }) {
  const containerRef = useRef(null);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    if (hasEntered) return;
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setHasEntered(true);
      },
      { rootMargin: "30% 0px 30% 0px", threshold: 0.01 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasEntered]);

  return (
    <div ref={containerRef} style={{ minHeight: !hasEntered ? estimatedHeight : undefined }} className="w-full relative">
      {hasEntered ? children : <div className="absolute inset-0 pointer-events-none bg-transparent" />}
    </div>
  );
}
