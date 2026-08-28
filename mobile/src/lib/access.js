import { api } from "./api";
import { cacheReplaceAll, cacheGetAll } from "./db";

// Unlike the web app's frontend/src/lib/access.js (a hand-maintained copy of the backend's
// MODULE_KEYS/PROFILE_PRESETS), this sources the same data from GET /permissions/presets so there's
// only one place the module list can drift from the backend, not three. Cached locally after first
// fetch so nav gating still works offline on a later app open.
const LEVELS = { none: 0, read: 1, full: 2 };
const PRESETS_COLLECTION = "permissions_presets";

let _presets = null; // { module_keys: string[], presets: { [role]: { [module]: level } } }

export async function loadPresets() {
  try {
    const { data } = await api.get("/permissions/presets");
    _presets = data;
    await cacheReplaceAll(PRESETS_COLLECTION, [{ id: "presets", ...data }]);
    return data;
  } catch {
    const cached = await cacheGetAll(PRESETS_COLLECTION);
    _presets = cached[0] || { module_keys: [], presets: {} };
    return _presets;
  }
}

export function hasAccess(user, moduleKey, level = "read") {
  if (!user || !_presets) return false;
  const rolePreset = _presets.presets?.[user.role] || {};
  const modules = user.permissions?.modules || rolePreset;
  const userLevel = modules[moduleKey] ?? rolePreset[moduleKey] ?? "none";
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
  executive: "Executive",
};
