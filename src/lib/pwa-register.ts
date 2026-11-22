/**
 * Registers the generated service worker ("/sw.js") automatically on app load.
 * Needed because this app is server-rendered (no static index.html for the
 * vite-plugin-pwa script injection to hook into).
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("load", () => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}
