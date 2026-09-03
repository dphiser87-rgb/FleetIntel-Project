import { useEffect, useState } from "react";
import { trackEvent } from "@/utils/trackEvent";

const APP_URL = "https://app.fleetintel.africa";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#why", label: "Why FleetIntel" },
  { href: "/contact", label: "Contact" },
];

export default function Nav() {
  // Quiet/transparent over the hero, settles into the blurred bar once you scroll past it -- same
  // 80px threshold ScrollPrompt uses for its own fade, so both read as one coordinated "past the
  // hero" moment rather than two effects firing at different points.
  const [isScrolled, setIsScrolled] = useState(false);
  // Below md, the link row (hidden md:flex) simply disappeared with nothing replacing it -- Contact
  // and every anchor section were unreachable from the nav on mobile. This menu is the fix.
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setIsMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMenuOpen]);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-[background-color,backdrop-filter,border-color] duration-500 ${isScrolled ? "backdrop-blur-xl" : "backdrop-blur-none"}`}
      style={{
        background: isScrolled ? "color-mix(in oklab, var(--color-bg) 80%, transparent)" : "transparent",
        borderColor: isScrolled ? "var(--color-border)" : "transparent",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5">
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
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm opacity-70 hover:opacity-100 transition-opacity" style={{ color: "var(--color-muted)" }}>{l.label}</a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={`${APP_URL}/login`}
            data-testid="nav-login"
            onClick={() => trackEvent("login_click")}
            className="rounded-full px-4 py-2 text-xs uppercase tracking-widest border transition-colors hover:[border-color:var(--color-primary)] hover:[color:var(--color-primary)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            Login
          </a>

          <button
            type="button"
            onClick={() => setIsMenuOpen((v) => !v)}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav-menu"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            data-testid="nav-menu-toggle"
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-md border shrink-0"
            style={{ borderColor: "var(--color-border)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              {isMenuOpen ? (
                <path d="M5 5l14 14M19 5L5 19" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <>
                  <path d="M3 6h18" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
                  <path d="M3 12h18" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
                  <path d="M3 18h18" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <nav
          id="mobile-nav-menu"
          className="md:hidden border-t px-6 py-4 flex flex-col gap-1"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg)" }}
        >
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setIsMenuOpen(false)}
              className="py-3 text-sm border-b last:border-b-0"
              style={{ color: "var(--color-ink)", borderColor: "var(--color-border)" }}
            >
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
