import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.smartinventory.erp",
  appName: "Smart Inventory ERP",
  webDir: ".vercel/output/static",
  server: {
    url: "https://smart-inventory-erp.vercel.app",
  },
};

export default config;
