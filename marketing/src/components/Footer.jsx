const APP_URL = "https://app.fleetintel.africa";

export default function Footer() {
  return (
    <footer>
      <div className="max-w-6xl mx-auto px-6 py-16 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-6 h-6 bg-primary flex items-center justify-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M3 17l6-6 4 4 8-8" stroke="#080809" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="font-display font-black text-base tracking-tight">FleetIntel</span>
          </div>
          <p className="text-sm text-muted max-w-xs">A cost-intelligence layer for African fleet operations.</p>
        </div>

        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <a href="#features" className="text-sm text-muted hover:text-foreground transition-colors">Features</a>
          <a href="#why" className="text-sm text-muted hover:text-foreground transition-colors">Why FleetIntel</a>
          <a href={`${APP_URL}/login`} className="text-sm text-muted hover:text-foreground transition-colors">Login</a>
          <a href="mailto:hello@fleetintel.africa" className="text-sm text-muted hover:text-foreground transition-colors">hello@fleetintel.africa</a>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-6 eyebrow">
          © {new Date().getFullYear()} FleetIntel. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
