import { supabase } from "@/integrations/supabase/client";
import { getRpcQueue, removeRpc } from "./rpc-queue";
import { uploadProductImage } from "./product-image";

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
      if (item.name === "upload_product_image_offline") {
        const productId = item.args["_product_id"];
        const operationId = item.args["_operation_id"];
        const dataUrl = item.args["_data_url"];
        if (
          typeof productId !== "string" ||
          typeof operationId !== "string" ||
          typeof dataUrl !== "string"
        ) {
          errors.push("بيانات صورة الصنف المحفوظة غير صالحة");
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
          errors.push(`رفع صورة الصنف: ${error.message}`);
          continue;
        }
        await removeRpc(item.id);
        synced++;
        continue;
      }
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
