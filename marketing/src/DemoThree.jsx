import { CostSpikeCanvas } from "@/components/CostSpikeCanvas";
import { ScrollVisibilityGate } from "@/components/ScrollVisibilityGate";
import MarketingShowcase from "@/components/MarketingShowcase";

// Motion-style comparison demo only (mounted at /demo3 by main.jsx) -- a third alternative,
// composing two pieces already proven out elsewhere: MarketingShowcase's horizontal-panel scroll
// (as used standalone on /demo2) followed by CostSpikeCanvas (as used on /demo).
//
// MarketingShowcase is rendered directly, NOT wrapped in ScrollVisibilityGate: it manages its own
// internal loading gate and its useScroll target needs to mount on this component's first render,
// not a delayed one -- gating it here would reproduce the exact scroll-freeze bug fixed earlier
// (see MarketingShowcase.jsx's comment on why its content is always mounted). CostSpikeCanvas has
// no such sensitivity and is well below the fold after the horizontal panels, so it's gated the
// same way as on /demo, to defer its mount until it's actually approaching the viewport.
export default function DemoThree() {
  return (
    // MarketingShowcase already wraps itself in .demo-theme, so no extra wrapper needed here.
    <main>
      <MarketingShowcase />

      <div className="demo-theme" style={{ background: "var(--color-bg)" }}>
        <ScrollVisibilityGate estimatedHeight="100vh">
          <CostSpikeCanvas />
        </ScrollVisibilityGate>
      </div>
    </main>
  );
}
