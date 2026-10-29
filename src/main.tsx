import "./lib/abortTimeoutPolyfill";
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

// iOS home-screen app only: mark html so CSS can respect the notch/status bar
(() => {
  try {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = (navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    if (isIOS && standalone) document.documentElement.classList.add("ios-standalone");
  } catch {}
})();

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

// Keep the phone's top status bar matching the app theme (light → white, dark → dark).
(() => {
  try {
    const html = document.documentElement;
    const metas = () => Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
    const sync = () => {
      const color = html.classList.contains("dark") ? "#0c0f13" : "#ffffff";
      let list = metas();
      if (list.length === 0) {
        const m = document.createElement("meta");
        m.name = "theme-color";
        document.head.appendChild(m);
        list = [m];
      }
      list.forEach((m) => {
        m.removeAttribute("media");
        if (m.content !== color) m.content = color;
      });
      html.style.colorScheme = html.classList.contains("dark") ? "dark" : "light";
    };
    sync();
    new MutationObserver(sync).observe(html, { attributes: true, attributeFilter: ["class"] });
    // Android can fall back to the install color after the app resumes (e.g. returning
    // from the photo picker), so re-apply the theme color whenever the app comes back.
    const resync = () => {
      metas().forEach((m) => { m.content = html.classList.contains("dark") ? "#0c0f14" : "#fefefe"; });
      requestAnimationFrame(sync);
    };
    document.addEventListener("visibilitychange", () => { if (!document.hidden) resync(); });
    window.addEventListener("pageshow", resync);
    window.addEventListener("focus", resync);
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
