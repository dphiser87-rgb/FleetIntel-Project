const APP_URL = "https://app.fleetintel.africa";

export default function Nav() {
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-xl border-b"
      style={{ background: "color-mix(in oklab, var(--color-bg) 80%, transparent)", borderColor: "var(--color-border)" }}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: "var(--color-primary)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M3 17l6-6 4 4 8-8" stroke="oklch(18% 0.02 155)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="flex flex-col leading-none">
            <span className="font-display font-bold text-lg tracking-tight">FleetIntel</span>
            <span
              className="font-display font-semibold text-[10px] tracking-tight mt-1"
              style={{ color: "var(--color-muted)" }}
              data-testid="nav-slogan"
            >
              Your Fleet. Your Control. Your Savings.
            </span>
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#how-it-works" className="text-sm hover:opacity-100 transition-opacity" style={{ color: "var(--color-muted)" }}>How it works</a>
          <a href="#features" className="text-sm hover:opacity-100 transition-opacity" style={{ color: "var(--color-muted)" }}>Features</a>
          <a href="#why" className="text-sm hover:opacity-100 transition-opacity" style={{ color: "var(--color-muted)" }}>Why FleetIntel</a>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={`${APP_URL}/login`}
            data-testid="nav-login"
            className="rounded-full px-4 py-2 text-xs uppercase tracking-widest border transition-colors"
            style={{ borderColor: "var(--color-border)" }}
          >
            Login
          </a>
        </div>
      </div>
    </header>
  );
}
