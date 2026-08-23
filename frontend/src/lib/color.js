// WCAG AA contrast utilities for the group color picker — pure math, no dependencies.

export function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

export function isValidHex(hex) {
  return !!hexToRgb(hex);
}

function channelLuminance(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(hex1, hex2) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return 0;
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

const WHITE = "#FFFFFF";
const NEAR_BLACK = "#0B0B0D";
const AA_MIN = 4.5;

// FleetIntel's dark app surface — group colors are shown as foreground content (swatches, dots,
// text) against this background almost everywhere in the UI, not as a background behind text. That's
// the pairing that actually needs AA validation; white/black-text-on-swatch (checkContrast below) is
// only relevant for the one spot a color IS used as a background (the preview badge).
export const APP_BG = "#0B0B0D";

/** Is this color legible as foreground content (text/icon/swatch) against the app's dark background? */
export function checkLegibility(hex) {
  const ratio = contrastRatio(hex, APP_BG);
  return { passes: ratio >= AA_MIN, ratio };
}

/**
 * Checks a candidate background color against both white and near-black text.
 * Returns { passes, textColor, ratio } — textColor is whichever passes AA (white preferred
 * when both pass, since this app's UI is dark-themed), or null if neither reaches 4.5:1.
 */
export function checkContrast(bgHex) {
  const whiteRatio = contrastRatio(bgHex, WHITE);
  const blackRatio = contrastRatio(bgHex, NEAR_BLACK);
  if (whiteRatio >= AA_MIN) return { passes: true, textColor: WHITE, ratio: whiteRatio };
  if (blackRatio >= AA_MIN) return { passes: true, textColor: NEAR_BLACK, ratio: blackRatio };
  return { passes: false, textColor: null, ratio: Math.max(whiteRatio, blackRatio) };
}

export const DEFAULT_GROUP_COLOR = "#3B82F6";
