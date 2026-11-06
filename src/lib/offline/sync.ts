import { getQueue, removeFromQueue } from "./store";
import { supabase } from "@/integrations/supabase/client";

// يزامن كل البيانات المعلقة مع قاعدة البيانات
export async function syncPending() {
  const queue = getQueue();
  if (queue.length === 0) return { synced: 0 };

  let synced = 0;
  for (const item of queue) {
    try {
      const { error } = await supabase.from(item.table).insert(item.data);
      if (!error) {
        removeFromQueue(item.id);
        synced++;
      }
    } catch (e) {
      console.log("sync failed for", item.id, e);
    }
  }
  return { synced, remaining: getQueue().length };
}

// حفظ ذكي: لو فيه نت يحفظ في Supabase على طول، لو ما فيه نت يحفظ محلي
export async function smartSave(table: string, data: any) {
  const { isOnline, addToQueue } = await import("./store");
  if (isOnline()) {
    const { error } = await supabase.from(table).insert(data);
    if (!error) return { saved: "online" as const };
    // لو فشل بسبب النت، احفظ محلي
    addToQueue(table, data);
    return { saved: "offline" as const };
  } else {
    addToQueue(table, data);
    return { saved: "offline" as const };
  }
}
