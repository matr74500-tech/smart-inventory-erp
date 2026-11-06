import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Pops an instant alert when a warehouse balance drops below its own minimum. */
export function LowStockWatcher() {
  useEffect(() => {
    const channel = supabase
      .channel(`low-stock-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock" }, async (payload) => {
        const row = payload.new as { product_id?: string; warehouse_id?: string; quantity?: number };
        const old = payload.old as { quantity?: number };
        if (!row?.product_id || !row.warehouse_id) return;
        const { data: m } = await supabase.from("stock_minimums").select("min_qty").eq("product_id", row.product_id).eq("warehouse_id", row.warehouse_id).maybeSingle();
        const min = Number(m?.min_qty ?? 0);
        const q = Number(row.quantity ?? 0);
        if (!min || q >= min || (old?.quantity !== undefined && Number(old.quantity) < min)) return;
        const [{ data: p }, { data: w }] = await Promise.all([
          supabase.from("products").select("name").eq("id", row.product_id).maybeSingle(),
          supabase.from("warehouses").select("name").eq("id", row.warehouse_id).maybeSingle(),
        ]);
        toast.warning(`رصيد "${p?.name ?? "صنف"}" في ${w?.name ?? "المستودع"} نزل عن الحد الأدنى`, { description: `الرصيد ${q} / الحد ${min}`, duration: 8000 });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
  return null;
}
