// Permissions for the UI: show or hide what a person can do. The server is the real enforcement
// (require_action in server.py) and sends each user's effective actions on GET /auth/me, so this file
// no longer keeps its own copy of the role presets -- that copy drifting from the server is what let
// the nav offer pages the API then refused.
//
// Actions per module: V view, C create/submit, E edit, D delete, A approve.

const actionsOf = (user) => (user && user.actions) || {};

// can(user, "fleet", "D") -- may this person delete vehicles?
export function can(user, moduleKey, action) {
  return !!user && (actionsOf(user)[moduleKey] || "").includes(action);
}

// The older vocabulary, still used for page access: "read" = can view, "full" = any write action.
export function hasAccess(user, moduleKey, level = "read") {
  const acts = actionsOf(user)[moduleKey] || "";
  return level === "read" ? acts.includes("V") : /[CEDA]/.test(acts);
}

// Mechanics edit only jobs assigned to them; the server enforces the same rule.
export function canEditJob(user, job) {
  if (!can(user, "maintenance", "E")) return false;
  return !user.own_jobs_only || String(job?.assigned_to || "") === String(user.id);
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
  workshop_manager: "Workshop Manager",
  executive: "Executive",
};

export const ROLE_COLOR = {
  admin: "border-primary text-primary",
  manager: "border-[#FFCC00] text-[#FFCC00]",
  inspector: "border-[#3B82F6] text-[#3B82F6]",
  mechanic: "border-[#34C759] text-[#34C759]",
  workshop_manager: "border-[#A855F7] text-[#A855F7]",
  operations_manager: "border-[#F59E0B] text-[#F59E0B]",
  operations_staff: "border-[#F59E0B]/60 text-[#F59E0B]/80",
  finance: "border-[#14B8A6] text-[#14B8A6]",
  finance_staff: "border-[#14B8A6]/60 text-[#14B8A6]/80",
  executive: "border-white text-white",
};
