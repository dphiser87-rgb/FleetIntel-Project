// Not currently used anywhere -- every string rendered on these pages today is hardcoded copy
// (e.g. the PANELS arrays in HorizontalNarrative/MarketingShowcase/CostSpikeCanvas), and React
// already HTML-escapes JSX {} text interpolation on its own, so applying this to that copy would
// double-escape it (an apostrophe or ampersand would render as the literal entity, e.g. &#x27;,
// instead of the character). Kept available for if/when a demo page ever renders real external or
// user-submitted input through dangerouslySetInnerHTML or a non-JSX sink where React's own escaping
// doesn't apply -- that's the actual case this guards against.
export function sanitizeText(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
