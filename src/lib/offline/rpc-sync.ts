import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import {
  getRpcQueue,
  recordRpcFailure,
  removeRpc,
  setRpcConflict,
  type ConflictInfo,
  type QueuedRpc,
} from "./rpc-queue";
import { uploadProductImage } from "./product-image";

type TableName = keyof Database["public"]["Tables"];

/**
 * Constrói la info del conflicto: el valor local (en la operación) vs el valor del servidor.
 * Devuelve null si el registro no existe o el servidor no es más reciente que la modificación local.
 */
function buildConflictInfo(item: QueuedRpc, server: Record<string, unknown>): ConflictInfo | null {
  const localRaw = item.args["_product"] ?? item.args["_record"];
  const local =
    (typeof localRaw === "object" && localRaw !== null ? localRaw : {}) as Record<string, unknown>;
  const localBaseMs = (() => {
    const value = local["updated_at"];
    if (typeof value === "string" && value) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return item.createdAt;
  })();
  const serverUpdatedAt = typeof server["updated_at"] === "string" ? server["updated_at"] : null;
  const serverMs = serverUpdatedAt ? Date.parse(serverUpdatedAt) : Number.NaN;
  if (!Number.isFinite(serverMs) || serverMs <= localBaseMs) return null;
  return { server, local, serverUpdatedAt };
}

type FetchedRow = {
  eq: (
    column: string,
    value: unknown,
  ) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> };
};

/** Productos: verifica `updated_at` antes de aplicar `save_product_offline` (artículos + precios). */
async function fetchProductRow(id: string): Promise<Record<string, unknown> | null> {
  const query = supabase
    .from("products")
    .select("id, updated_at, name, price, cost, supplier") as unknown as FetchedRow;
  const { data } = await query.eq("id", id).maybeSingle();
  return data;
}

async function detectProductConflict(item: QueuedRpc): Promise<ConflictInfo | null> {
  const id = item.args["_id"];
  if (typeof id !== "string") return null;
  const data = await fetchProductRow(id);
  if (!data) return null;
  return buildConflictInfo(item, data);
}

/** Configuraciones (categories/warehouses/units/custom_fields): verifica `updated_at` antes de `save_catalog_setting_offline`. */
async function fetchCatalogSetting(table: string, id: string): Promise<Record<string, unknown> | null> {
  const query = supabase
    .from(table as TableName)
    .select("id, updated_at, name") as unknown as FetchedRow;
  const { data } = await query.eq("id", id).maybeSingle();
  return data;
}

async function detectCatalogSettingConflict(item: QueuedRpc): Promise<ConflictInfo | null> {
  const table = item.args["_table"];
  const id = item.args["_id"];
  if (typeof table !== "string" || typeof id !== "string") return null;
  const data = await fetchCatalogSetting(table, id);
  if (!data) return null;
  return buildConflictInfo(item, data);
}

export async function syncQueuedRpc(options?: { forceIds?: string[] }) {
  const queue = await getRpcQueue();
  const { data: authData } = await supabase.auth.getSession();
  let synced = 0;
  const errors: string[] = [];
  const failedIds: string[] = [];
  const force = new Set(options?.forceIds ?? []);
  const fail = async (id: string, message: string) => {
    errors.push(message);
    failedIds.push(id);
    await recordRpcFailure(id);
  };
  for (const item of queue) {
    if (item.status === "manual") continue;
    if (!authData.session) {
      errors.push("سجّل الدخول بالحساب نفسه لمزامنة العمليات المحفوظة");
      break;
    }
    if (item.ownerId && item.ownerId !== authData.session.user.id) {
      errors.push("هناك عمليات محفوظة بحساب مستخدم آخر؛ افتح الحساب الذي أنشأها لمزامنتها");
      continue;
    }
    try {
      if (item.name === "upload_product_image_offline") {
        const productId = item.args["_product_id"];
        const operationId = item.args["_operation_id"];
        const dataUrl = item.args["_data_url"];
        if (
          typeof productId !== "string" ||
          typeof operationId !== "string" ||
          typeof dataUrl !== "string"
        ) {
          await fail(item.id, "بيانات صورة الصنف المحفوظة غير صالحة");
          continue;
        }
        const imageUrl = await uploadProductImage(
          authData.session.user.id,
          productId,
          operationId,
          dataUrl,
        );
        const { error } = await supabase
          .from("products")
          .update({ image_url: imageUrl })
          .eq("id", productId);
        if (error) {
          await fail(item.id, `رفع صورة الصنف: ${error.message}`);
          continue;
        }
        await removeRpc(item.id);
        synced++;
        continue;
      }
      // عند التحديثات على المنتجات/الأسعار والإعدادات: أوقف عندما يكون الخادم أحدث من التعديل المحلي
      if (
        !force.has(item.id) &&
        (item.name === "save_product_offline" ||
          item.name === "save_catalog_setting_offline")
      ) {
        const conflict =
          item.name === "save_product_offline"
            ? await detectProductConflict(item)
            : await detectCatalogSettingConflict(item);
        if (conflict) {
          await setRpcConflict(item.id, conflict);
          continue;
        }
      }
      const { error } = await supabase.rpc(item.name, item.args as never);
      if (error) {
        await fail(item.id, `${item.name}: ${error.message}`);
        continue;
      }
      await removeRpc(item.id);
      synced++;
    } catch (error) {
      await fail(
        item.id,
        `${item.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { synced, remaining: (await getRpcQueue()).length, errors, failedIds };
}
