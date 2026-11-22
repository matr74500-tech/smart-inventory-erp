import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

const DB_NAME = "smart-inventory-outbox";
const STORE_NAME = "rpc_operations";
const FALLBACK_KEY = "offline_rpc_queue_v1";

export type ConflictInfo = {
  server: Record<string, unknown>;
  local: Record<string, unknown>;
  serverUpdatedAt: string | null;
};

export type QueuedRpc = {
  id: string;
  name:
    | "save_payment_plan"
    | "save_sale_draft_offline"
    | "save_purchase_order_draft_offline"
    | "post_sale_offline"
    | "post_purchase_offline"
    | "set_stock_offline"
    | "set_stock_batch_offline"
    | "transfer_shelf_stock_offline"
    | "close_daily_cash_offline"
    | "save_voucher_draft_offline"
    | "post_voucher_offline"
    | "save_customer_offline"
    | "save_supplier_offline"
    | "save_product_supplier_offline"
    | "save_product_offline"
    | "save_product_units_offline"
    | "save_product_opening_balances_offline"
    | "save_product_suppliers_offline"
    | "save_catalog_setting_offline"
    | "upload_product_image_offline";
  args: Record<string, Json>;
  createdAt: number;
  attempts: number;
  ownerId?: string;
  conflict?: ConflictInfo;
  status?: "manual";
};

export const RPC_MAX_ATTEMPTS = 6;
export const RPC_BACKOFF_BASE_MS = 4000;
export const RPC_BACKOFF_MAX_MS = 5 * 60 * 1000;

/** تراجع تدريجي: 4، 8، 16… ثوانٍ (محدود بالمحاولات القصوى). */
export function rpcBackoffDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(attempts, 5));
  return Math.min(RPC_BACKOFF_BASE_MS * 2 ** exponent, RPC_BACKOFF_MAX_MS);
}

/** هل تستمر المحاولة التلقائية لهذه العملية أم توقف بعد الحد الأقصى من الفشل؟ */
export function rpcShouldAutoRetry(attempts: number): boolean {
  return attempts < RPC_MAX_ATTEMPTS;
}

export function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|offline|failed to fetch|connection|internet|timeout/i.test(message);
}

let fallbackMutex: Promise<void> = Promise.resolve();

async function withFallbackMutex<T>(fn: () => T): Promise<T> {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = fallbackMutex;
  fallbackMutex = prev.then(() => wait).catch(() => wait);
  try {
    await prev;
    return fn();
  } finally {
    release();
  }
}

function fallbackRead(): QueuedRpc[] {
  if (typeof localStorage === "undefined") return [];
  let raw: string | null;
  try {
    raw = localStorage.getItem(FALLBACK_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as QueuedRpc[]) : [];
  } catch {
    return [];
  }
}

function fallbackWrite(items: QueuedRpc[]) {
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(items));
    else throw new Error("لا يتوفر تخزين محلي آمن لهذا الجهاز");
  } catch (error) {
    throw error instanceof Error ? error : new Error("تعذر حفظ العملية محليًا");
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((): null => null);
}

async function persistRpcItem(item: QueuedRpc): Promise<void> {
  const db = await openDb();
  if (!db) {
    await withFallbackMutex(() => {
      fallbackWrite([...fallbackRead().filter((entry) => entry.id !== item.id), item]);
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).catch(() =>
    withFallbackMutex(() => {
      fallbackWrite([...fallbackRead().filter((entry) => entry.id !== item.id), item]);
    }),
  );
  db.close();
}

export async function enqueueRpc(
  operation: Omit<QueuedRpc, "createdAt" | "attempts">,
): Promise<void> {
  const existing = await getRpcQueue();
  if (existing.some((item) => item.id === operation.id)) return;
  const { data: authData } = await supabase.auth.getSession();
  if (!authData.session) throw new Error("سجّل الدخول أولًا ليتم ربط العملية بحسابك وحفظها بأمان");
  const item: QueuedRpc = {
    ...operation,
    createdAt: Math.max(Date.now(), (existing.at(-1)?.createdAt ?? 0) + 1),
    attempts: 0,
    ownerId: authData.session.user.id,
  };
  await persistRpcItem(item);
}

export async function getRpcQueue(): Promise<QueuedRpc[]> {
  const db = await openDb();
  if (!db) return fallbackRead();
  const items = await new Promise<QueuedRpc[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const stored = request.result as QueuedRpc[];
      const merged = new Map([...fallbackRead(), ...stored].map((item) => [item.id, item]));
      resolve([...merged.values()].sort((a, b) => a.createdAt - b.createdAt));
    };
    request.onerror = () => reject(request.error);
  }).catch(() => fallbackRead());
  db.close();
  return items;
}

export async function removeRpc(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    await withFallbackMutex(() => {
      fallbackWrite(fallbackRead().filter((item) => item.id !== id));
    });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }).catch(() =>
    withFallbackMutex(() => {
      fallbackWrite(fallbackRead().filter((item) => item.id !== id));
    }),
  );
  await withFallbackMutex(() => {
    fallbackWrite(fallbackRead().filter((item) => item.id !== id));
  });
  db.close();
}

/** زيادة عداد المحاولات لعملية فاشلة (يُستخدم لسياسة التراجع التدريجي). */
export async function recordRpcFailure(id: string): Promise<void> {
  const queue = await getRpcQueue();
  const item = queue.find((entry) => entry.id === id);
  if (!item) return;
  await persistRpcItem({ ...item, attempts: item.attempts + 1 });
}

/** حفظ حالة تعارض: السجل على الخادم أحدث من التعديل المحلي — توقف عن الاستبدال الصامت واحتفظ بالعملية في الطابور. */
export async function setRpcConflict(id: string, conflict: ConflictInfo): Promise<void> {
  const queue = await getRpcQueue();
  const item = queue.find((entry) => entry.id === id);
  if (!item) return;
  await persistRpcItem({ ...item, conflict });
}

/** احذف حالة التعارض (مثلاً عند "اعتماد تعديدي" وإعادة التطبيق). */
export async function clearRpcConflict(id: string): Promise<void> {
  const queue = await getRpcQueue();
  const item = queue.find((entry) => entry.id === id);
  if (!item || !item.conflict) return;
  const { conflict, ...rest } = item;
  await persistRpcItem(rest);
}

/** حفظ حالة "تعديد يدوي" — ترك العملية محفوظة للمراجعة اليدوية (المحلي يتحمّل قرار تغيير البيانات). */
export async function markRpcManual(id: string): Promise<void> {
  const queue = await getRpcQueue();
  const item = queue.find((entry) => entry.id === id);
  if (!item) return;
  const { conflict, ...rest } = item;
  await persistRpcItem({ ...rest, status: "manual" });
}
