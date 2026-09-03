// Labelled placeholder for real assets (design.md's Assets plan: real product screenshots, captured
// live from the app -- not stock photography). Named for exactly what belongs here so Step 4 (assets)
// knows what to shoot/crop.
export default function ImagePlaceholder({ label, className = "", aspect = "aspect-video" }) {
  return (
    <div
      className={`${aspect} ${className} rounded-xl border border-dashed flex items-center justify-center text-center px-6`}
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <span className="overline" style={{ color: "var(--color-muted)" }}>{label}</span>
    </div>
  );
}
