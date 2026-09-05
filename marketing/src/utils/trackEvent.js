// Umami Cloud is wired in via the script tag in index.html (site: FleetIntel,
// domain fleetintel.africa). window.umami.track(eventName, properties) is Umami's
// custom-event API -- https://umami.is/docs/track-events.
export const trackEvent = (eventName, properties) => {
  try {
    if (typeof window !== "undefined" && window.umami) {
      window.umami.track(eventName, properties);
    } else if (import.meta.env.DEV) {
      console.log(`[Analytics Simulation] Event: ${eventName}`, properties);
    }
  } catch (error) {
    // Fail silently in production so a tracking failure never breaks the page.
    console.error("Analytics failure ignored:", error);
  }
};
