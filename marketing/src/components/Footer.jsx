const APP_URL = "https://app.fleetintel.africa";

export default function Footer() {
  return (
    <footer>
      <div className="max-w-6xl mx-auto px-6 py-16 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "var(--color-primary)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M3 17l6-6 4 4 8-8" stroke="oklch(18% 0.02 155)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-display font-bold text-base tracking-tight">FleetIntel</span>
          </div>
          <p className="text-sm max-w-xs font-display font-bold tracking-tight" data-testid="footer-motto">
            Your Fleet. Your Control. Your Savings.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <a href="/#how-it-works" className="text-sm hover:opacity-100 transition-opacity" style={{ color: "var(--color-muted)" }}>How it works</a>
          <a href="/#features" className="text-sm hover:opacity-100 transition-opacity" style={{ color: "var(--color-muted)" }}>Features</a>
          <a href="/#why" className="text-sm hover:opacity-100 transition-opacity" style={{ color: "var(--color-muted)" }}>Why FleetIntel</a>
          <a href="/contact" className="text-sm hover:opacity-100 transition-opacity" style={{ color: "var(--color-muted)" }}>Contact</a>
          <a href={`${APP_URL}/login`} className="text-sm hover:opacity-100 transition-opacity" style={{ color: "var(--color-muted)" }}>Login</a>
          <a href="mailto:hello@fleetintel.africa" className="text-sm hover:opacity-100 transition-opacity" style={{ color: "var(--color-muted)" }}>hello@fleetintel.africa</a>
        </div>
      </div>
      <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
        <div className="max-w-6xl mx-auto px-6 py-6 eyebrow">
          © {new Date().getFullYear()} FleetIntel. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
