import { useState, useEffect } from "react";

// Not wired into any component yet -- available for the heavier /demo* sections (CostSpikeCanvas,
// HorizontalNarrative, MarketingShowcase's horizontal panels) if a specific low-fps fallback is
// wanted later, e.g. dropping their blur/glow effects. Samples rAF frame deltas in batches of
// frameSampleCount and flags isLowPerformance when the batch's average frame time exceeds 22ms
// (~45fps).
export function usePerformanceGuard(frameSampleCount = 30) {
  const [isLowPerformance, setIsLowPerformance] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.requestAnimationFrame) return;

    let frameTimes = [];
    let lastFrameTime = performance.now();
    let animationFrameId;

    const checkFrameRate = (now) => {
      const delta = now - lastFrameTime;
      lastFrameTime = now;

      frameTimes.push(delta);

      if (frameTimes.length >= frameSampleCount) {
        const averageFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        setIsLowPerformance(averageFrameTime > 22);
        frameTimes = [];
      }

      animationFrameId = requestAnimationFrame(checkFrameRate);
    };

    animationFrameId = requestAnimationFrame(checkFrameRate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [frameSampleCount]);

  return isLowPerformance;
}
