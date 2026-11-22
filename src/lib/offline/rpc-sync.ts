import { supabase } from "@/integrations/supabase/client";
import { getRpcQueue, removeRpc } from "./rpc-queue";

export async function syncQueuedRpc() {
  const queue = await getRpcQueue();
  const { data: authData } = await supabase.auth.getSession();
  let synced = 0;
  const errors: string[] = [];
  for (const item of queue) {
    if (!authData.session) {
      errors.push("سجّل الدخول بالحساب نفسه لمزامنة العمليات المحفوظة");
      break;
    }
    if (item.ownerId && item.ownerId !== authData.session.user.id) {
      errors.push("هناك عمليات محفوظة بحساب مستخدم آخر؛ افتح الحساب الذي أنشأها لمزامنتها");
      continue;
    }
    try {
      const { error } = await supabase.rpc(item.name, item.args as never);
      if (error) {
        errors.push(`${item.name}: ${error.message}`);
        continue;
      }
      await removeRpc(item.id);
      synced++;
    } catch (error) {
      errors.push(`${item.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { synced, remaining: (await getRpcQueue()).length, errors };
}
