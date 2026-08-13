import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChartLine, Truck, ClipboardText, Wrench, ChartBar, SignOut, Gauge, Package, UsersThree,
} from "@phosphor-icons/react";

const nav = [
  { to: "/", label: "Dashboard", icon: Gauge, end: true, id: "nav-dashboard" },
  { to: "/fleet", label: "Fleet", icon: Truck, id: "nav-fleet" },
  { to: "/templates", label: "Checklists", icon: ClipboardText, id: "nav-templates" },
  { to: "/maintenance", label: "Maintenance", icon: Wrench, id: "nav-maintenance" },
  { to: "/parts", label: "Parts", icon: Package, id: "nav-parts" },
  { to: "/team", label: "Team", icon: UsersThree, id: "nav-team" },
  { to: "/reports", label: "Reports", icon: ChartBar, id: "nav-reports" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-[#0b0b0d] flex flex-col" data-testid="sidebar">
        <div className="px-6 py-6 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary flex items-center justify-center">
              <ChartLine size={18} weight="bold" color="#fff" />
            </div>
            <div>
              <div className="font-display font-black text-lg tracking-tight leading-none">FleetCost</div>
              <div className="overline mt-1">Intelligence</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
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
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-primary/20 border border-primary/40 flex items-center justify-center mono text-xs text-primary">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <div className="text-sm truncate" data-testid="user-name">{user?.name}</div>
              <div className="overline truncate" data-testid="user-role">{user?.role}</div>
            </div>
          </div>
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 justify-center border border-border px-3 py-2 text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
          >
            <SignOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
