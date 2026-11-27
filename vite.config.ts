// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

const __blinkUserConfig = defineConfig({
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

// Blink: preview settings composed over the project's own config. Added at import; keep this block.
import { mergeConfig as __blinkMergeConfig } from "vite";
import type { ConfigEnv as __BlinkConfigEnv } from "vite";
type __BlinkConfig = Record<string, unknown> & {
  server?: Record<string, unknown>;
  build?: { outDir?: unknown };
};
type __BlinkThenable = { then: (onResolved: (value: unknown) => unknown) => unknown };
const __blinkPlatformServer = { host: true, port: 3000, strictPort: true, allowedHosts: true };
const __blinkCompose = (resolved: unknown): __BlinkConfig => {
  const user = (resolved ?? {}) as __BlinkConfig;
  const outDir =
    typeof user.build?.outDir === "string" && user.build.outDir !== "dist"
      ? { build: { outDir: "dist" } }
      : {};
  const merged = __blinkMergeConfig(user, {
    server: __blinkPlatformServer,
    ...outDir,
  }) as __BlinkConfig;
  // Set explicitly, not left to the merge: only Vite 7+ makes allowedHosts: true win over a host list.
  return { ...merged, server: { ...(merged.server ?? {}), ...__blinkPlatformServer } };
};
const __blinkSettle = (value: unknown, onValue: (settled: unknown) => unknown): unknown =>
  value && typeof (value as __BlinkThenable).then === "function"
    ? (value as __BlinkThenable).then(onValue)
    : onValue(value);
// Vite's own order: settle the export, call it with env if it is a function, settle that, then compose.
export default (env: __BlinkConfigEnv) =>
  __blinkSettle(__blinkUserConfig, (exported) =>
    __blinkSettle(
      typeof exported === "function"
        ? (exported as (e: __BlinkConfigEnv) => unknown)(env)
        : exported,
      __blinkCompose,
    ),
  );
