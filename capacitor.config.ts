import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.smartinventory.erp",
  appName: "Smart Inventory ERP",
  webDir: ".vercel/output/static",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
    BarcodeScanner: {
      preferBackgroundCamera: false,
      torchEnabled: false,
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    backgroundColor: "#0f172a",
  },
};

export default config;
