import type { Json } from "@/integrations/supabase/types";

const DB_NAME = "smart-inventory-outbox";
const STORE_NAME = "rpc_operations";
const FALLBACK_KEY = "offline_rpc_queue_v1";

export type QueuedRpc = {
  id: string;
  name: "save_payment_plan" | "save_sale_draft_offline" | "save_purchase_order_draft_offline";
  args: Record<string, Json>;
  createdAt: number;
  attempts: number;
};

function fallbackRead(): QueuedRpc[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(FALLBACK_KEY);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as QueuedRpc[]) : [];
  } catch {
    return [];
  }
}

function fallbackWrite(items: QueuedRpc[]) {
  if (typeof localStorage !== "undefined")
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
}

export async function enqueueRpc(
  operation: Omit<QueuedRpc, "createdAt" | "attempts">,
): Promise<void> {
  const item: QueuedRpc = { ...operation, createdAt: Date.now(), attempts: 0 };
  const db = await openDb();
  if (!db) {
    fallbackWrite([...fallbackRead(), item]);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).add(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).catch(() => fallbackWrite([...fallbackRead(), item]));
  db.close();
}

export async function getRpcQueue(): Promise<QueuedRpc[]> {
  const db = await openDb();
  if (!db) return fallbackRead();
  const items = await new Promise<QueuedRpc[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () =>
      resolve((request.result as QueuedRpc[]).sort((a, b) => a.createdAt - b.createdAt));
    request.onerror = () => reject(request.error);
  }).catch(() => fallbackRead());
  db.close();
  return items;
}

export async function removeRpc(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    fallbackWrite(fallbackRead().filter((item) => item.id !== id));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).catch(() => fallbackWrite(fallbackRead().filter((item) => item.id !== id)));
  db.close();
}
