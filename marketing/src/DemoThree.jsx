import { AccessibilitySkipBar } from "@/components/AccessibilitySkipBar";
import { CostSpikeCanvas } from "@/components/CostSpikeCanvas";
import { ScrollVisibilityGate } from "@/components/ScrollVisibilityGate";
import MarketingShowcase from "@/components/MarketingShowcase";

// Motion-style comparison demo only (mounted at /demo3 by main.jsx) -- a third alternative,
// composing two pieces already proven out elsewhere: MarketingShowcase's horizontal-panel scroll
// (as used standalone on /demo2) followed by CostSpikeCanvas (as used on /demo). ARIA landmarks
// (header/main/section) added per a user-provided structure, with the skip target moved to land on
// the CostSpikeCanvas section instead of mid-page inside MarketingShowcase.
//
// MarketingShowcase is rendered with withSkipNav={false}: it normally renders its own skip bar and
// #primary-content target (needed when it's used standalone on /demo2), but composed here that
// would create a duplicate id="primary-content" (invalid HTML, and the skip link would silently
// jump to whichever one comes first in the DOM) and a second skip bar. This page owns the single
// skip bar and target instead.
//
// MarketingShowcase itself is NOT wrapped in ScrollVisibilityGate: it manages its own internal
// loading gate, and its useScroll target needs to mount on this component's first render, not a
// delayed one -- gating it here would reproduce the exact scroll-freeze bug fixed earlier (see
// MarketingShowcase.jsx's comment on why its content always mounts). CostSpikeCanvas has no such
// sensitivity and is well below the fold after the horizontal panels, so it keeps the same gated
// treatment already proven out on /demo.
export default function DemoThree() {
  return (
    <>
      <AccessibilitySkipBar />

      <header role="banner" className="h-20 w-full" />

      <main aria-label="Product showcase visual presentation">
        <MarketingShowcase withSkipNav={false} />
      </main>

      {/* Skip target: tabIndex={-1} so it reliably receives focus on activation (some browsers
          otherwise just scroll without moving focus, which breaks the skip link's purpose). */}
      <section
        id="primary-content"
        tabIndex={-1}
        aria-label="Core feature matrix readout"
        className="demo-theme focus:outline-hidden"
        style={{ background: "var(--color-bg)" }}
      >
        <ScrollVisibilityGate estimatedHeight="100vh">
          <CostSpikeCanvas />
        </ScrollVisibilityGate>
      </section>
    </>
  );
}
