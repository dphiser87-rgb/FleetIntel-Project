// Client-side mirror of backend/server.py's MODULE_KEYS + PROFILE_PRESETS (_default_permissions).
// Used only for UI gating (hide/disable) — the backend's require_module() is the real enforcement.
const MODULE_KEYS = [
  "dashboard", "fleet", "assets", "drivers", "incidents", "vehicle_checklist",
  "templates", "maintenance", "parts", "team", "audit", "reports", "security", "purchase_orders", "defects",
];

function defaultPermissions(role) {
  const full = Object.fromEntries(MODULE_KEYS.map((m) => [m, "full"]));
  const readAll = Object.fromEntries(MODULE_KEYS.map((m) => [m, "read"]));
  switch (role) {
    case "admin":
      return full;
    case "manager":
      return { ...full, security: "read", team: "read" };
    case "inspector":
      return { ...readAll, vehicle_checklist: "full", templates: "full", fleet: "read" };
    case "mechanic":
      return { ...readAll, maintenance: "full", parts: "full", defects: "full" };
    case "operations_manager":
      return { ...readAll, maintenance: "full", parts: "full", fleet: "full", reports: "full", defects: "full" };
    case "finance":
      return { ...readAll, parts: "full", reports: "full", purchase_orders: "full" };
    case "workshop_head":
      return { ...readAll, maintenance: "full", purchase_orders: "read", parts: "read", fleet: "read", defects: "full" };
    case "operations_staff":
      return { ...readAll, maintenance: "full", vehicle_checklist: "full", templates: "full", parts: "full", purchase_orders: "read", defects: "full" };
    case "finance_staff":
      return { ...readAll, parts: "read", reports: "read", purchase_orders: "read", maintenance: "read", vehicle_checklist: "read", templates: "read" };
    default:
      return Object.fromEntries(MODULE_KEYS.map((m) => [m, "none"]));
  }
}

const LEVELS = { none: 0, read: 1, full: 2 };

export function hasAccess(user, moduleKey, level = "read") {
  if (!user) return false;
  const modules = user.permissions?.modules || defaultPermissions(user.role);
  const userLevel = modules[moduleKey] ?? defaultPermissions(user.role)[moduleKey] ?? "none";
  return (LEVELS[userLevel] ?? 0) >= LEVELS[level];
}

export const ROLE_LABEL = {
  admin: "Admin",
  manager: "Manager",
  inspector: "Inspector",
  mechanic: "Mechanic",
  operations_manager: "Operations Manager",
  operations_staff: "Operations Staff",
  finance: "Finance Manager",
  finance_staff: "Finance Staff",
  workshop_head: "Workshop Head",
};

export const ROLE_COLOR = {
  admin: "border-primary text-primary",
  manager: "border-[#FFCC00] text-[#FFCC00]",
  inspector: "border-[#3B82F6] text-[#3B82F6]",
  mechanic: "border-[#34C759] text-[#34C759]",
  workshop_head: "border-[#A855F7] text-[#A855F7]",
  operations_manager: "border-[#F59E0B] text-[#F59E0B]",
  operations_staff: "border-[#F59E0B]/60 text-[#F59E0B]/80",
  finance: "border-[#14B8A6] text-[#14B8A6]",
  finance_staff: "border-[#14B8A6]/60 text-[#14B8A6]/80",
};
