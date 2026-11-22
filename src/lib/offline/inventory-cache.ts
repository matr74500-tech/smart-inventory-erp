import type { Tables } from "@/integrations/supabase/types";

const DB_NAME = "smart-inventory-cache";
const STORE_NAME = "snapshots";

export type InventorySnapshot = {
  products: Tables<"products">[];
  warehouses: Tables<"warehouses">[];
  stock: Tables<"stock">[];
  reorders: Tables<"reorder_requests">[];
  categories: Tables<"categories">[];
  units: Tables<"units">[];
  fields: Tables<"custom_fields">[];
  settings: Tables<"app_settings"> | null;
  minimums: Tables<"stock_minimums">[];
  shelfStock: Tables<"shelf_stock">[];
  currencies: Tables<"currencies">[];
  exchangeRates: Tables<"exchange_rates">[];
  savedAt: number;
};

function openCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((): null => null);
}

export async function saveInventorySnapshot(userId: string, snapshot: InventorySnapshot) {
  const db = await openCache();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(snapshot, userId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).catch(() => undefined);
  db.close();
}

export async function getInventorySnapshot(userId: string): Promise<InventorySnapshot | null> {
  const db = await openCache();
  if (!db) return null;
  const snapshot = await new Promise<InventorySnapshot | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve((request.result as InventorySnapshot | undefined) ?? null);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
  db.close();
  return snapshot;
}

export async function savePrivateSnapshot<T>(userId: string, key: string, value: T) {
  const db = await openCache();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(value, `${userId}:${key}`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).catch(() => undefined);
  db.close();
}

export async function getPrivateSnapshot<T>(userId: string, key: string): Promise<T | null> {
  const db = await openCache();
  if (!db) return null;
  const value = await new Promise<T | null>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(`${userId}:${key}`);
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
  db.close();
  return value;
}

export async function patchCachedInventoryRow(
  userId: string,
  collection: "categories" | "warehouses" | "units" | "fields" | "products",
  id: string,
  row: Record<string, unknown>,
) {
  const snapshot = await getInventorySnapshot(userId);
  if (!snapshot) return;
  const list = snapshot[collection] as Array<Record<string, unknown>>;
  const index = list.findIndex((item) => item["id"] === id);
  const updated =
    index < 0
      ? [...list, { ...row, id }]
      : list.map((item, i) => (i === index ? { ...item, ...row } : item));
  await saveInventorySnapshot(userId, { ...snapshot, [collection]: updated });
}
