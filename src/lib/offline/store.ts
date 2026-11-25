// مخزن مؤقت - يحفظ البيانات في الجوال لما ما فيه نت
import type { Database, Json, TablesInsert } from "@/integrations/supabase/types";

const KEY = "offline_queue_v1";
type TableName = keyof Database["public"]["Tables"];
const TABLE_NAMES: TableName[] = [
  "app_settings",
  "backups",
  "categories",
  "customers",
  "currencies",
  "daily_cash_closings",
  "custom_fields",
  "cash_transactions",
  "sales_invoices",
  "sales_items",
  "vouchers",
  "exchange_rates",
  "employee_permissions",
  "products",
  "profiles",
  "purchase_invoices",
  "purchase_items",
  "reorder_requests",
  "shelf_stock",
  "stock",
  "stock_minimums",
  "stock_movements",
  "units",
  "user_roles",
  "warehouses",
];

export type PendingItem = {
  id: string;
  table: TableName;
  data: Json;
  createdAt: number;
};

export function isOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function getQueue(): PendingItem[] {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(isPendingItem)) {
    throw new TypeError("Stored offline queue has an invalid format");
  }
  return parsed;
}

function isPendingItem(value: unknown): value is PendingItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item["id"] === "string" &&
    typeof item["table"] === "string" &&
    TABLE_NAMES.includes(item["table"] as TableName) &&
    typeof item["data"] === "object" &&
    item["data"] !== null &&
    !Array.isArray(item["data"]) &&
    typeof item["createdAt"] === "number" &&
    Number.isFinite(item["createdAt"])
  );
}

export function addToQueue<T extends TableName>(table: T, data: TablesInsert<T>) {
  const queue = getQueue();
  queue.push({
    id: Math.random().toString(36).slice(2),
    table,
    data: data as Json,
    createdAt: Date.now(),
  });
  localStorage.setItem(KEY, JSON.stringify(queue));
  return queue.length;
}

export function clearQueue() {
  localStorage.removeItem(KEY);
}

export function removeFromQueue(id: string) {
  const queue = getQueue().filter((x) => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(queue));
}
