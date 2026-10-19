import { canRegisterAppWorker } from "./pwaPolicy";

export async function registerAppWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    if (!canRegisterAppWorker(import.meta.env.PROD, location.hostname, window.self !== window.top, location.search)) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter((registration) => {
        const worker = registration.active ?? registration.waiting ?? registration.installing;
        return worker && new URL(worker.scriptURL).pathname === "/sw.js";
      }).map((registration) => registration.unregister()));
      return;
    }
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true, onRegisterError: (error) => console.warn("App worker unavailable", error) });
  } catch (error) {
    console.warn("App worker setup unavailable", error);
  }
}