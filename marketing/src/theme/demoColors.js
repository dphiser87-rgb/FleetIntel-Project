// Plain JS mirror of the .demo-theme CSS custom properties in index.css (marketing/ has no
// TypeScript dependency and no .ts files, so this is a .js module, not .ts). These are the /demo,
// /demo2, and /demo3 comparison pages' saturated-green/orange palette -- NOT the real Design B
// site's brand colors, which are the oklch tokens documented in marketing/design.md and defined in
// index.css's base @theme block. Keep this in sync with .demo-theme in index.css if either changes.
export const DEMO_THEME_COLORS = {
  bgDark: "#080809",
  primaryGreen: "#00ff66", // saturated operational green accent
  textOffwhite: "#f4f6f4", // muted architectural body text
  mutedGreenGray: "#67776b", // low contrast typography & framing borders
  incidentOrange: "#ea580c", // critical structural incidents only
};
