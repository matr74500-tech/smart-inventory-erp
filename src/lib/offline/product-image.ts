import { supabase } from "@/integrations/supabase/client";

export async function uploadProductImage(
  ownerId: string,
  productId: string,
  operationId: string,
  dataUrl: string,
) {
  if (!dataUrl.startsWith("data:image/")) throw new Error("صيغة صورة الصنف غير صالحة");
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const path = `${ownerId}/${productId}/${operationId}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}
