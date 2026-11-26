import type { Tables } from "@/integrations/supabase/types";

const DB_NAME = "smart-inventory-cache";
const STORE_NAME = "snapshots";

/** مدة صلاحية (TTL) للبيانات المخزنة في الكاش (7 أيام). */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isExpired(savedAt?: number): boolean {
  if (typeof savedAt !== "number" || Number.isNaN(savedAt)) return false;
  return Date.now() - savedAt > CACHE_TTL_MS;
}

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

export async function peekInventorySnapshot(userId: string): Promise<{
  snapshot: InventorySnapshot | null;
  error: string | null;
}> {
  const db = await openCache();
  if (!db) return { snapshot: null, error: "المتصفح لا يدعم IndexedDB" };
  const snapshot = await new Promise<InventorySnapshot | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve((request.result as InventorySnapshot | undefined) ?? null);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
  db.close();
  if (!snapshot) return { snapshot: null, error: "لا توجد نسخة محلية" };
  if (isExpired(snapshot.savedAt))
    return { snapshot: null, error: "النسخة المحلية انتهت الصلاحية (7 أيام)" };
  return { snapshot, error: null };
}

export async function getInventorySnapshot(userId: string): Promise<InventorySnapshot | null> {
  const { snapshot } = await peekInventorySnapshot(userId);
  if (!snapshot || isExpired(snapshot.savedAt)) {
    // البيانات منتهية الصلاحية: احذفها وأخبر المتصل بالعودة للقيم الحية
    void wipeInventoryCache(userId);
    return null;
  }
  return snapshot;
}

export async function savePrivateSnapshot<T>(userId: string, key: string, value: T) {
  const db = await openCache();
  if (!db) return;
  const stored: { value: T; savedAt: number } = { value, savedAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(stored, `${userId}:${key}`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).catch(() => undefined);
  db.close();
}

export async function getPrivateSnapshot<T>(userId: string, key: string): Promise<T | null> {
  const db = await openCache();
  if (!db) return null;
  const stored = await new Promise<{ value: T; savedAt: number } | null>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(`${userId}:${key}`);
    request.onsuccess = () =>
      resolve((request.result as { value: T; savedAt: number } | undefined) ?? null);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
  db.close();
  if (!stored) return null;
  if (isExpired(stored.savedAt)) {
    void wipeInventoryCache(userId);
    return null;
  }
  return stored.value ?? null;
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

/**
 * مسح جميع بيانات IndexedDB الخاصة بالمستخدم (اللقطات الرئيسية لكل userId
 * واللقطات الخاصة لكل userId:key).
 */
export async function wipeInventoryCache(userId: string): Promise<void> {
  const db = await openCache();
  if (!db) return;
  const prefix = `${userId}:`;
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite");
    const store = request.objectStore(STORE_NAME);
    store.delete(userId);
    const allKeysReq = store.getAllKeys();
    allKeysReq.onsuccess = () => {
      for (const key of allKeysReq.result) {
        if (typeof key === "string" && key.startsWith(prefix)) store.delete(key);
      }
    };
    request.oncomplete = () => resolve();
    request.onerror = () => reject(request.error);
  }).catch(() => undefined);
  db.close();
}
