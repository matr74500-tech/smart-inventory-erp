// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  nitro: {
    preset: "vercel",
  },
  vite: {
    appType: "spa",
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        base: "/",
        scope: "/",
        filename: "sw.js",
        outDir: ".vercel/output/static",
        workbox: {
          globPatterns: ["**/*.{js,css,ico,html}"],
          runtimeCaching: [
            {
              // Cache the Google Fonts CSS + webfonts so the app renders its
              // normal typeface (Cairo / Tajawal) even when reopened offline.
              urlPattern: new RegExp("https://fonts\\.(?:gstatic|googleapis)\\.com/"),
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts" },
            },
          ],
        },
        manifest: {
          name: "Smart Inventory ERP",
          short_name: "Smart Inv",
          description: "نظام إدارة المخزون ونقاط البيع",
          start_url: "/",
          display: "standalone",
          orientation: "any",
          background_color: "#f8fafc",
          theme_color: "#0f172a",
          icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon", purpose: "any" }],
        },
      }),
    ],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
