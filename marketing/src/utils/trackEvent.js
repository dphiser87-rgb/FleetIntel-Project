// Not wired into anything yet -- no Plausible (or other analytics) account/domain is set up for
// this site. This assumes window.plausible exists, which requires adding Plausible's script tag
// (with the actual site domain) to index.html first. Revisit once there's a real account to point
// at and specific interaction points worth tracking (e.g. Login clicks, /demo* page views).
//
// .js not .ts (plain-JS project), `properties?: Record<...>` and `as any` casts dropped -- no
// runtime behavior in a JS project.
export const trackEvent = (eventName, properties) => {
  try {
    if (typeof window !== "undefined" && window.plausible) {
      window.plausible(eventName, { props: properties });
    } else if (import.meta.env.DEV) {
      console.log(`[Analytics Simulation] Event: ${eventName}`, properties);
    }
  } catch (error) {
    // Fail silently in production so a tracking failure never breaks the page.
    console.error("Analytics failure ignored:", error);
  }
};
