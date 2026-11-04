import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Product = Tables<"products">;
export type Warehouse = Tables<"warehouses">;
export type StockRow = Tables<"stock">;
export type Reorder = Tables<"reorder_requests">;

/** Loads products, warehouses, stock and reorder requests, and keeps them live via realtime. */
export function useInventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [reorders, setReorders] = useState<Reorder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, w, s, r] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("warehouses").select("*").order("created_at"),
      supabase.from("stock").select("*"),
      supabase.from("reorder_requests").select("*").order("created_at", { ascending: false }),
    ]);
    setProducts(p.data ?? []);
    setWarehouses(w.data ?? []);
    setStock(s.data ?? []);
    setReorders(r.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`inventory-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "reorder_requests" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const qty = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stock) m.set(`${s.product_id}:${s.warehouse_id}`, Number(s.quantity));
    return (productId: string, warehouseId?: string) => {
      if (warehouseId) return m.get(`${productId}:${warehouseId}`) ?? 0;
      return stock.filter((s) => s.product_id === productId).reduce((a, s) => a + Number(s.quantity), 0);
    };
  }, [stock]);

  return { products, warehouses, stock, reorders, loading, qty, reload: load };
}
