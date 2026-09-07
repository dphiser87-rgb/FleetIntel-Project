import { outboxPut, outboxGetAll, outboxRemove, outboxCount } from "./db";
import { api } from "./api";

// Same pattern as the web app's offlineQueue.js (frontend/src/lib/offlineQueue.js), reimplemented
// natively -- no code is shared between them, only the design: queue a write that failed to reach
// the server, flush on reconnect, never silently drop a record on auth failure.
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeQueueChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// kind is a human label ("inspection" | "job_completion" | "defect") for the pending-sync UI;
// method/endpoint/payload describe the actual API call to replay.
export async function queueSubmission({ id, kind, method, endpoint, payload }) {
  await outboxPut({ id, kind, method, endpoint, payload });
  notify();
}

export async function getQueuedSubmissions() {
  return outboxGetAll();
}

export async function getQueuedCount() {
  return outboxCount();
}

export async function removeQueuedSubmission(id) {
  await outboxRemove(id);
  notify();
}

// Returns { authExpired: boolean } so callers (the pending-sync badge) can show a distinct
// "sign in again to sync" state rather than a plain count when a 401 blocks the flush.
export async function flushQueue() {
  const queued = await getQueuedSubmissions();
  if (queued.length === 0) return { authExpired: false };

  for (const item of queued) {
    try {
      if (item.method === "PATCH") await api.patch(item.endpoint, item.payload);
      else await api.post(item.endpoint, item.payload);
      await removeQueuedSubmission(item.id);
    } catch (err) {
      if (err?.response?.status === 401) {
        // api.js's own interceptor already tried a silent refresh before this reached us -- a 401
        // here means the refresh itself failed, so nothing else in the queue will succeed either.
        return { authExpired: true };
      }
      if (!err?.response) {
        // Network failure -- connection dropped again mid-flush, stop this pass and retry later.
        return { authExpired: false };
      }
      // A real server-rejected error: retrying won't help, drop it rather than looping forever.
      // The client already validates before queueing, so this should be rare.
      await removeQueuedSubmission(item.id);
    }
  }
  return { authExpired: false };
}
