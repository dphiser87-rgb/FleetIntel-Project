import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import GlobalAlertBar from "@/components/GlobalAlertBar";
import NotificationCenter from "@/components/NotificationCenter";
import HelpMenu from "@/components/HelpMenu";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { hasAccess } from "@/lib/access";
import {
  ChartLine, Truck, ClipboardText, Wrench, ChartBar, SignOut, Gauge, Package, UsersThree, ClockCounterClockwise,
  ShieldCheck, UserCircle, Warning, Stack, ListChecks, Receipt, ShieldCheckered, Calculator, CaretDown, WarningOctagon,
  CalendarCheck, Brain, Gear, FileText, Question, List,
} from "@phosphor-icons/react";

// The persistent sidebar is a fixed 256px; below this width it would leave too little for the page
// itself -- on a 390px phone every page started at x=288 with ~100px of usable width.
const DESKTOP_QUERY = "(min-width: 1024px)";

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

const nav = [
  { to: "/", label: "Dashboard", icon: Gauge, end: true, id: "nav-dashboard", moduleKey: "dashboard" },
  { to: "/executive-dashboard", label: "Executive Dashboard", icon: Brain, id: "nav-executive-dashboard", moduleKey: "executive_dashboard" },
  { to: "/fleet", label: "Fleet", icon: Truck, id: "nav-fleet", moduleKey: "fleet" },
  { to: "/assets", label: "Assets", icon: Stack, id: "nav-assets", moduleKey: "assets" },
  { to: "/drivers", label: "Drivers", icon: UserCircle, id: "nav-drivers", moduleKey: "drivers" },
  { to: "/vehicle-checklist", label: "Vehicle Checklist", icon: ClipboardText, id: "nav-vehicle-checklist", moduleKey: "vehicle_checklist", group: "Operations" },
  { to: "/templates", label: "Checklist Templates", icon: ListChecks, id: "nav-templates", moduleKey: "templates", group: "Operations" },
  { to: "/compliance", label: "Compliance Dashboard", icon: ShieldCheckered, id: "nav-compliance", moduleKey: "vehicle_checklist", group: "Operations" },
  { to: "/maintenance", label: "Workshop Management", icon: Wrench, id: "nav-maintenance", moduleKey: "maintenance", group: "Operations" },
  { to: "/maintenance-schedules", label: "Maintenance Schedules", icon: CalendarCheck, id: "nav-maintenance-schedules", moduleKey: "maintenance", group: "Operations" },
  { to: "/maintenance-reports", label: "Maintenance Reports", icon: ChartBar, id: "nav-maintenance-reports", moduleKey: "maintenance", group: "Operations" },
  { to: "/defects", label: "Defect Reporting", icon: WarningOctagon, id: "nav-defects", moduleKey: "defects", group: "Operations" },
  { to: "/incidents", label: "Incidents", icon: Warning, id: "nav-incidents", moduleKey: "incidents", group: "Operations" },
  { to: "/parts", label: "Parts", icon: Package, id: "nav-parts", moduleKey: "parts", group: "Finance" },
  { to: "/purchase-orders", label: "Purchase Orders", icon: Receipt, id: "nav-purchase-orders", moduleKey: "purchase_orders", group: "Finance" },
  { to: "/budgets", label: "Budget vs Actual", icon: Calculator, id: "nav-budgets", moduleKey: "reports", group: "Finance" },
  { to: "/reports", label: "Reports", icon: ChartBar, id: "nav-reports", moduleKey: "reports", group: "Finance" },
  { to: "/report-center", label: "Report Center", icon: FileText, id: "nav-report-center", moduleKey: "reports", group: "Finance" },
  { to: "/team", label: "Team", icon: UsersThree, id: "nav-team", moduleKey: "team" },
  { to: "/audit", label: "Activity", icon: ClockCounterClockwise, id: "nav-audit", moduleKey: "audit" },
  { to: "/security", label: "Security", icon: ShieldCheck, id: "nav-security", moduleKey: "security" },
  { to: "/settings", label: "Account Settings", icon: Gear, id: "nav-settings" },
  { to: "/help", label: "Help & Support", icon: Question, id: "nav-help" },
];

const GROUPS = ["Operations", "Finance"];

function NavItem({ n }) {
  return (
    <NavLink
      to={n.to}
      end={n.end}
      data-testid={n.id}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 text-sm border-l-2 transition-colors ${
          isActive
            ? "bg-[#141416] text-white border-primary"
            : "text-muted-foreground border-transparent hover:text-white hover:bg-[#141416]"
        }`
      }
    >
      <n.icon size={18} weight="regular" />
      <span>{n.label}</span>
    </NavLink>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 bg-primary flex items-center justify-center">
        <ChartLine size={18} weight="bold" color="#fff" />
      </div>
      <div>
        <div className="font-display font-black text-lg tracking-tight leading-none">FleetIntel</div>
        <div className="overline mt-1">Cost intelligence</div>
      </div>
    </div>
  );
}

// Everything in the sidebar, shared by the persistent desktop sidebar and the mobile drawer so the
// two can't drift. `utilities` renders the help and notification controls: the mobile top bar
// carries its own, and NotificationCenter polls every 30s, so they're mounted in exactly one place.
function SidebarContent({ user, visibleNav, topLevel, collapsed, setCollapsed, onLogout, utilities }) {
  return (
    <>
      <div className="px-6 py-6 border-b border-border">
        <Brand />
      </div>

      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-primary/20 border border-primary/40 flex items-center justify-center mono text-xs text-primary">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm truncate" data-testid="user-name">{user?.name}</div>
            <div className="overline truncate" data-testid="user-role">{user?.role}</div>
          </div>
          {utilities && <><HelpMenu /><NotificationCenter /></>}
        </div>
        <button
          data-testid="logout-btn"
          onClick={onLogout}
          className="w-full flex items-center gap-2 justify-center border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
        >
          <SignOut size={14} />
          Sign out
        </button>
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
        {topLevel.map((n) => <NavItem key={n.to} n={n} />)}
        {GROUPS.map((g) => {
          const items = visibleNav.filter((n) => n.group === g);
          if (items.length === 0) return null;
          const isCollapsed = !!collapsed[g];
          return (
            <div key={g} className="pt-2">
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [g]: !c[g] }))}
                data-testid={`nav-group-${g.toLowerCase()}`}
                className="w-full flex items-center justify-between px-3 py-2 overline text-muted-foreground hover:text-white transition-colors"
              >
                {g}
                <CaretDown size={12} className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
              </button>
              {!isCollapsed && <div className="space-y-1">{items.map((n) => <NavItem key={n.to} n={n} />)}</div>}
            </div>
          );
        })}
      </nav>
    </>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const visibleNav = nav.filter((n) => !n.moduleKey || hasAccess(user, n.moduleKey, "read"));
  const topLevel = visibleNav.filter((n) => !n.group);
  const [collapsed, setCollapsed] = useState({});

  // Close the drawer once a link in it has been followed, and if the window grows past the
  // breakpoint while it's open.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname, isDesktop]);

  const handleLogout = () => { logout(); navigate("/login"); };

  // Deep-link guard: a route reachable only by URL (not through the filtered nav above) still
  // needs gating — redirect home instead of rendering a page the user has no module access to.
  const matched = [...nav].sort((a, b) => b.to.length - a.to.length).find(
    (n) => location.pathname === n.to || (n.to !== "/" && location.pathname.startsWith(n.to + "/"))
  );
  if (matched && matched.moduleKey && !hasAccess(user, matched.moduleKey, "read")) {
    return <Navigate to="/" replace />;
  }

  const sidebarProps = { user, visibleNav, topLevel, collapsed, setCollapsed, onLogout: handleLogout };

  // One tree for both shells. Only the navigation chrome in the first slot changes with width; the
  // <main> holding the page stays the same element in the same position, so React keeps the page
  // mounted when the width crosses the breakpoint. Returning two separate trees remounted the whole
  // page instead -- rotating a tablet (820px upright, 1180px sideways) closed open dialogs and wiped
  // half-filled forms.
  return (
    <div className={`min-h-screen bg-background text-foreground ${isDesktop ? "flex" : ""}`}>
      {isDesktop ? (
        <aside key="sidebar" className="w-64 shrink-0 border-r border-border bg-[#0b0b0d] flex flex-col h-screen sticky top-0" data-testid="sidebar">
          <SidebarContent {...sidebarProps} utilities />
        </aside>
      ) : (
        <MobileChrome key="mobile" drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} sidebarProps={sidebarProps} />
      )}

      <main className={`min-w-0 overflow-x-hidden ${isDesktop ? "flex-1" : ""}`}>
        <GlobalAlertBar />
        <Outlet />
      </main>
    </div>
  );
}

function MobileChrome({ drawerOpen, setDrawerOpen, sidebarProps }) {
  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-border bg-[#0b0b0d] px-4 py-3" data-testid="mobile-topbar">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation"
          data-testid="mobile-nav-toggle"
          className="w-9 h-9 flex items-center justify-center border border-border hover:border-primary hover:text-primary"
        >
          <List size={18} />
        </button>
        <Brand />
        <div className="flex items-center gap-1">
          <HelpMenu />
          <NotificationCenter />
        </div>
      </header>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0 bg-[#0b0b0d] border-border flex flex-col" data-testid="mobile-drawer">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">FleetIntel sections</SheetDescription>
          <SidebarContent {...sidebarProps} utilities={false} />
        </SheetContent>
      </Sheet>
    </>
  );
}
