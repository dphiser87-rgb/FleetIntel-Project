const APP_URL = "https://app.fleetintel.africa";

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="#" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary flex items-center justify-center rounded-sharp">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 17l6-6 4 4 8-8" stroke="#080809" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-display font-black text-lg tracking-tight">FleetIntel</span>
        </a>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-muted hover:text-foreground transition-colors">Features</a>
          <a href="#why" className="text-sm text-muted hover:text-foreground transition-colors">Why FleetIntel</a>
          <a href="mailto:hello@fleetintel.africa" className="text-sm text-muted hover:text-foreground transition-colors">Contact</a>
        </nav>

        <a
          href={`${APP_URL}/login`}
          data-testid="nav-login"
          className="border border-border px-4 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
        >
          Login
        </a>
      </div>
    </header>
  );
}
