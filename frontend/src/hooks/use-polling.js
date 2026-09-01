import { useEffect, useRef } from "react";

// Shared version of the interval + visibilitychange pattern already used ad hoc in
// GlobalAlertBar.jsx, NotificationCenter.jsx, and Maintenance.jsx -- refetches on a timer and
// immediately when the tab regains focus, instead of only ever fetching once on mount.
export function usePolling(callback, intervalMs = 30000) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const run = () => callbackRef.current();
    const t = setInterval(run, intervalMs);
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
}
