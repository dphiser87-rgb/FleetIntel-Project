// Renders a real screenshot when src is provided (Step 4). Falls back to the labelled dashed
// placeholder when it isn't -- kept around for any future slot that doesn't have a real asset yet.
export default function ImagePlaceholder({ label, src, alt, className = "", aspect = "aspect-video" }) {
  if (src) {
    return (
      <div
        className={`${aspect} ${className} rounded-xl border overflow-hidden`}
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <img src={src} alt={alt || label} className="w-full h-full object-cover object-top" />
      </div>
    );
  }
  return (
    <div
      className={`${aspect} ${className} rounded-xl border border-dashed flex items-center justify-center text-center px-6`}
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <span className="eyebrow" style={{ color: "var(--color-muted)" }}>{label}</span>
    </div>
  );
}
