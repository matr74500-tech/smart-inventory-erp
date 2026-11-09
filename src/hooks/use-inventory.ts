import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";

export type Product = Tables<"products">;
export type Warehouse = Tables<"warehouses">;
export type StockRow = Tables<"stock">;
export type Reorder = Tables<"reorder_requests">;
export type Category = Tables<"categories">;
export type Unit = Tables<"units">;
export type CustomField = Tables<"custom_fields">;
export type Settings = Tables<"app_settings">;
export type StockMin = Tables<"stock_minimums">;

const LIVE_TABLES = ["products", "stock", "reorder_requests", "warehouses", "categories", "units", "custom_fields", "app_settings", "stock_minimums"];

/** Loads all inventory data and keeps every screen live via realtime. */
export function useInventory() {
  const { session, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [reorders, setReorders] = useState<Reorder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [minimums, setMinimums] = useState<StockMin[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session || authLoading) return;
    const [p, w, s, r, c, u, f, st, mn] = await Promise.all([
      supabase.rpc("visible_products"),
      supabase.from("warehouses").select("*").order("created_at"),
      supabase.from("stock").select("*"),
      supabase.from("reorder_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("name"),
      supabase.from("units").select("*").order("created_at"),
      supabase.from("custom_fields").select("*").order("created_at"),
      supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("stock_minimums").select("*"),
    ]);
    setProducts((p.data ?? []) as unknown as Product[]);
    setWarehouses(w.data ?? []);
    setStock(s.data ?? []);
    setReorders(r.data ?? []);
    setCategories(c.data ?? []);
    setUnits(u.data ?? []);
    setFields(f.data ?? []);
    setSettings(st.data ?? null);
    setMinimums(mn.data ?? []);
    setLoading(false);
  }, [session?.user.id, authLoading]);

  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(t);
      t = setTimeout(load, 250);
    };
    let channel = supabase.channel(`inventory-${Math.random().toString(36).slice(2)}`);
    for (const table of LIVE_TABLES) channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, debounced);
    channel.subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const qty = useMemo(() => {
    const m = new Map<string, number>();
    const tot = new Map<string, number>();
    for (const s of stock) {
      m.set(`${s.product_id}:${s.warehouse_id}`, Number(s.quantity));
      tot.set(s.product_id, (tot.get(s.product_id) ?? 0) + Number(s.quantity));
    }
    return (productId: string, warehouseId?: string) =>
      warehouseId ? (m.get(`${productId}:${warehouseId}`) ?? 0) : (tot.get(productId) ?? 0);
  }, [stock]);

  const categoryName = useCallback((id: string | null) => categories.find((c) => c.id === id)?.name ?? "", [categories]);

  return { products, warehouses, stock, reorders, categories, units, fields, settings, minimums, loading, qty, categoryName, reload: load };
}
