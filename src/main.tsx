import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateReelsFromBackup } from "./data/reelInsightsData";
import { hydrateOverridesFromBackup } from "./lib/reelsDataStore";
import { withTimeout } from "./lib/idbBackup";
import { hydrateInsightsFromBackup } from "./lib/insightsBackup";
import { registerAppWorker } from "./lib/registerAppWorker";

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

const bootstrap = async () => {
  void registerAppWorker();

  // Restore reel lists and edits that only fit in IndexedDB before first render.
  await withTimeout(Promise.all([hydrateReelsFromBackup(), hydrateOverridesFromBackup(), hydrateInsightsFromBackup()]), 1500, [undefined, undefined, undefined]);

  const root = document.getElementById("root");
  if (root) ReactDOM.createRoot(root).render(<App />);
};

bootstrap();
