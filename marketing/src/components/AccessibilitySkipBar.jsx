import { trackEvent } from "@/utils/trackEvent";

// .jsx, not .tsx -- this project is plain JS. rgb(var(--x)) fixed to var(--color-*) directly,
// since these tokens are hex/oklch values, not RGB-channel triplets. Points at #primary-content,
// which each page marks on its actual content start (App.jsx for the real site, LuxuryScrollDemo.jsx
// and MarketingShowcase.jsx for the demo pages). `label` defaults to the demo pages' wording; the
// real site passes "Skip to main content" -- there's no scroll-jacking to warn about there, just
// the usual header/nav to bypass.
export function AccessibilitySkipBar({ label = "Skip immersive layout animations" } = {}) {
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
      {label}
    </a>
  );
}
