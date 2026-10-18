import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateReelsFromBackup } from "./data/reelInsightsData";
import { hydrateOverridesFromBackup } from "./lib/reelsDataStore";
import { withTimeout } from "./lib/idbBackup";
import { hydrateInsightsFromBackup } from "./lib/insightsBackup";

// Anti-inspect protection disabled for Lovable preview compatibility

// Restore persisted theme (defaults to light if none stored)
(() => {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } catch {}
})();

const shouldRegisterServiceWorker = import.meta.env.PROD;

const resetPreviewCaches = async () => {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
  }
};

const bootstrap = async () => {
  if ("serviceWorker" in navigator) {
    if (shouldRegisterServiceWorker) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } else {
      await resetPreviewCaches();
    }
  }

  // Restore reel lists and edits that only fit in IndexedDB before first render.
  await withTimeout(Promise.all([hydrateReelsFromBackup(), hydrateOverridesFromBackup(), hydrateInsightsFromBackup()]), 1500, [undefined, undefined, undefined]);

  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
};

bootstrap();
