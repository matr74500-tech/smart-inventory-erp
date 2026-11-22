import { getQueue, removeFromQueue } from "./store";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json, TablesInsert } from "@/integrations/supabase/types";

type TableName = keyof Database["public"]["Tables"];

// The generic signature ties a table to its insert type; this cast works around Supabase's union overload.
async function insertTyped<T extends TableName>(table: T, data: TablesInsert<T>) {
  return supabase.from(table).insert(data as never);
}

async function insertQueued<T extends TableName>(table: T, data: Json) {
  // localStorage erases compile-time types; database constraints and RLS still validate the replayed row.
  return insertTyped(table, data as TablesInsert<T>);
}

// يزامن كل البيانات المعلقة مع قاعدة البيانات
export async function syncPending(): Promise<{
  synced: number;
  remaining: number;
  errors: string[];
}> {
  const queue = getQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0, errors: [] };

  let synced = 0;
  const errors: string[] = [];
  for (const item of queue) {
    try {
      const { error } = await insertQueued(item.table, item.data);
      if (!error) {
        removeFromQueue(item.id);
        synced++;
      } else {
        errors.push(`${item.table}: ${error.message}`);
      }
    } catch (error) {
      errors.push(`${item.table}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { synced, remaining: getQueue().length, errors };
}

// حفظ ذكي: لو فيه نت يحفظ في Supabase على طول، لو ما فيه نت يحفظ محلي
export async function smartSave<T extends TableName>(table: T, data: TablesInsert<T>) {
  const { isOnline, addToQueue } = await import("./store");
  if (isOnline()) {
    try {
      const { error } = await insertTyped(table, data);
      if (!error) return { saved: "online" as const };
      return { saved: "failed" as const, error: error.message };
    } catch (error) {
      addToQueue(table, data);
      return {
        saved: "offline" as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } else {
    addToQueue(table, data);
    return { saved: "offline" as const };
  }
}
