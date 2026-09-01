import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { api } from "./api";
import { cacheReplaceAll, cacheGetAll, cacheGet, cachePut } from "./db";
import { flushQueue, subscribeQueueChanged } from "./offlineQueue";

// Pulls the read-side snapshot a mechanic needs to work with zero connectivity: their assigned
// jobs, the vehicle list, full checklist templates (list + each one's sections/items, since
// Inspection.jsx-equivalent screen needs the full template body to render, not just the list row),
// and the parts catalog (for the Request Parts picker).
export async function pullReadCache() {
  const [jobs, vehicles, templateList, defects, parts, requisitions] = await Promise.all([
    api.get("/maintenance").then((r) => r.data).catch(() => null),
    api.get("/vehicles").then((r) => r.data).catch(() => null),
    api.get("/templates").then((r) => r.data).catch(() => null),
    api.get("/defects").then((r) => r.data).catch(() => null),
    api.get("/parts").then((r) => r.data).catch(() => null),
    api.get("/parts-requisitions").then((r) => r.data).catch(() => null),
  ]);
  if (jobs) await cacheReplaceAll("jobs", jobs);
  if (vehicles) await cacheReplaceAll("vehicles", vehicles);
  if (defects) await cacheReplaceAll("defects", defects);
  if (parts) await cacheReplaceAll("parts", parts);
  // Workspace-wide list (same read scope the mechanic already has on the parts catalog itself) --
  // covers the Jobs list's "awaiting parts" indicator without a per-job fetch for every visible job.
  if (requisitions) await cacheReplaceAll("requisitions", requisitions);
  if (templateList) {
    const details = await Promise.all(
      templateList.map((t) => api.get(`/templates/${t.id}`).then((r) => r.data).catch(() => t))
    );
    await cacheReplaceAll("templates", details);
  }
}

export async function getCachedJobs() { return cacheGetAll("jobs"); }
export async function getCachedVehicles() { return cacheGetAll("vehicles"); }
export async function getCachedTemplates() { return cacheGetAll("templates"); }
export async function getCachedDefects() { return cacheGetAll("defects"); }
export async function getCachedParts() { return cacheGetAll("parts"); }
export async function getCachedJob(id) { return cacheGet("jobs", id); }
export async function getCachedVehicle(id) { return cacheGet("vehicles", id); }

// Requisitions are fetched per-job (not part of the bulk pull above) since they're only needed while
// viewing that job's detail screen -- cached individually so the last-seen status still shows offline.
export async function pullJobRequisitions(jobId) {
  try {
    const { data } = await api.get(`/maintenance/${jobId}/parts-requisitions`);
    await cachePut("requisitions", data);
    return data;
  } catch {
    return getCachedJobRequisitions(jobId);
  }
}

export async function getCachedJobRequisitions(jobId) {
  const all = await cacheGetAll("requisitions");
  return all.filter((r) => r.maintenance_id === jobId);
}

// For list-level views (e.g. the Jobs list's "awaiting parts" indicator) that need to check many
// jobs at once without a separate cache read per job.
export async function getCachedRequisitions() {
  return cacheGetAll("requisitions");
}

let _lastSyncResult = { authExpired: false };

export function getLastSyncResult() {
  return _lastSyncResult;
}

export async function runSync() {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return _lastSyncResult;
  _lastSyncResult = await flushQueue();
  if (!_lastSyncResult.authExpired) {
    await pullReadCache().catch(() => {});
  }
  return _lastSyncResult;
}

// Mirrors the web offline queue's trigger strategy (online event / mount / periodic safety net)
// with the native equivalents: NetInfo connectivity changes, app foreground, and a periodic timer.
export function startSyncTriggers(onChange) {
  const unsubQueue = subscribeQueueChanged(() => { runSync().then(onChange); });
  const unsubNet = NetInfo.addEventListener((state) => {
    if (state.isConnected) runSync().then(onChange);
  });
  const appStateSub = AppState.addEventListener("change", (next) => {
    if (next === "active") runSync().then(onChange);
  });
  const interval = setInterval(() => { runSync().then(onChange); }, 60000);

  runSync().then(onChange);

  return () => {
    unsubQueue();
    unsubNet();
    appStateSub.remove();
    clearInterval(interval);
  };
}
