import { trackEvent } from "@/utils/trackEvent";

// .jsx, not .tsx -- this project is plain JS. rgb(var(--x)) fixed to var(--color-*) directly,
// since these tokens are hex/oklch values, not RGB-channel triplets. Points at #primary-content,
// which each demo page marks on its actual content start (see LuxuryScrollDemo.jsx and
// MarketingShowcase.jsx).
export function AccessibilitySkipBar() {
  const handleSkipLayout = () => {
    trackEvent("accessibility_skip_used", { viewport: window.innerWidth });
  };

  return (
    <a
      href="#primary-content"
      onClick={handleSkipLayout}
      className="sr-only focus:not-sr-only fixed top-4 left-4 z-[100] px-4 py-2 rounded-md font-mono text-xs uppercase tracking-wider font-semibold focus:outline-hidden focus:ring-2 focus:ring-offset-2"
      style={{ background: "var(--color-primary)", color: "var(--color-bg)" }}
    >
      Skip immersive layout animations
    </a>
  );
}
