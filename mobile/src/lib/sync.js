import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { api } from "./api";
import { cacheReplaceAll, cacheGetAll, cacheGet } from "./db";
import { flushQueue, subscribeQueueChanged } from "./offlineQueue";

// Pulls the read-side snapshot a mechanic needs to work with zero connectivity: their assigned
// jobs, the vehicle list, and full checklist templates (list + each one's sections/items, since
// Inspection.jsx-equivalent screen needs the full template body to render, not just the list row).
export async function pullReadCache() {
  const [jobs, vehicles, templateList, defects] = await Promise.all([
    api.get("/maintenance").then((r) => r.data).catch(() => null),
    api.get("/vehicles").then((r) => r.data).catch(() => null),
    api.get("/templates").then((r) => r.data).catch(() => null),
    api.get("/defects").then((r) => r.data).catch(() => null),
  ]);
  if (jobs) await cacheReplaceAll("jobs", jobs);
  if (vehicles) await cacheReplaceAll("vehicles", vehicles);
  if (defects) await cacheReplaceAll("defects", defects);
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
export async function getCachedJob(id) { return cacheGet("jobs", id); }
export async function getCachedVehicle(id) { return cacheGet("vehicles", id); }

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
