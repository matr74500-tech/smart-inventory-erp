import { supabase } from "@/integrations/supabase/client";
import { getRpcQueue, removeRpc } from "./rpc-queue";

export async function syncQueuedRpc() {
  const queue = await getRpcQueue();
  let synced = 0;
  const errors: string[] = [];
  for (const item of queue) {
    const { error } = await supabase.rpc(item.name, item.args as never);
    if (error) errors.push(`${item.name}: ${error.message}`);
    else {
      await removeRpc(item.id);
      synced++;
    }
  }
  return { synced, remaining: (await getRpcQueue()).length, errors };
}
