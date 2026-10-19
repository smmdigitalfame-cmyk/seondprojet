import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), VitePWA({
    strategies: "generateSW",
    filename: "sw.js",
    manifest: false,
    injectRegister: null,
    registerType: "autoUpdate",
    devOptions: { enabled: false },
    workbox: {
      globPatterns: ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"],
      navigateFallback: null,
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: ({ request, url, sameOrigin }) => request.mode === "navigate" && sameOrigin && !url.pathname.startsWith("/~oauth") && !url.pathname.startsWith("/api/"),
          handler: "NetworkFirst",
          options: { cacheName: "app-navigation", cacheableResponse: { statuses: [200] } },
        },
        {
          urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/.*-[\w-]{8,}\.(js|css|woff2?)$/.test(url.pathname),
          handler: "CacheFirst",
          options: { cacheName: "app-hashed-assets", expiration: { maxEntries: 100, maxAgeSeconds: 2592000 }, cacheableResponse: { statuses: [200] } },
        },
      ],
    },
  })].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "recharts": ["recharts"],
          "supabase": ["@supabase/supabase-js"],
          "radix": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-tabs",
            "@radix-ui/react-select",
          ],
        },
      },
    },
  },
}));
