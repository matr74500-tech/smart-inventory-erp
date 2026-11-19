import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.smartinventory',
  appName: 'Smart Inventory ERP',
  webDir: '.output/public',
  server: {
    url: 'https://smart-inventory-erp.vercel.app',
    cleartext: true
  }
};

export default config;
