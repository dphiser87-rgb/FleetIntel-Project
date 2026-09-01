// Matches the web app's actually-shipped dark theme (frontend pages use bg-[#0b0b0d]/#121214 cards,
// border-border, primary electric blue) rather than design_guidelines.json's lighter aspirational
// palette, which isn't what's live in the product today.
export const colors = {
  background: "#0b0b0d",
  surface: "#121214",
  border: "#2a2a2e",
  primary: "#0EA5E9",
  success: "#34C759",
  warning: "#FFCC00",
  danger: "#FF453A",
  text: "#F0F1F3",
  textMuted: "#8E8E93",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
