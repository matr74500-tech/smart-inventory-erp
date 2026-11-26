import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { peekInventorySnapshot, saveInventorySnapshot } from "@/lib/offline/inventory-cache";

export type Product = Tables<"products">;
export type Warehouse = Tables<"warehouses">;
export type StockRow = Tables<"stock">;
export type Reorder = Tables<"reorder_requests">;
export type Category = Tables<"categories">;
export type Unit = Tables<"units">;
export type CustomField = Tables<"custom_fields">;
export type Settings = Tables<"app_settings">;
export type StockMin = Tables<"stock_minimums">;
export type ShelfStock = Tables<"shelf_stock">;
export type Currency = Tables<"currencies">;
export type ExchangeRate = Tables<"exchange_rates">;

const LIVE_TABLES = [
  "products",
  "stock",
  "reorder_requests",
  "warehouses",
  "categories",
  "units",
  "custom_fields",
  "app_settings",
  "stock_minimums",
  "shelf_stock",
  "currencies",
  "exchange_rates",
];

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
  const [shelfStock, setShelfStock] = useState<ShelfStock[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const currencyErrorShown = useRef(false);

  const load = useCallback(async () => {
    if (!session || authLoading) return;
    const restoreSnapshot = async () => {
      const { snapshot, error } = await peekInventorySnapshot(session.user.id);
      if (error) setCacheError(error);
      if (!snapshot) return false;
      setCacheError(null);
      setProducts(snapshot.products);
      setWarehouses(snapshot.warehouses);
      setStock(snapshot.stock);
      setReorders(snapshot.reorders);
      setCategories(snapshot.categories);
      setUnits(snapshot.units);
      setFields(snapshot.fields);
      setSettings(snapshot.settings);
      setMinimums(snapshot.minimums);
      setShelfStock(snapshot.shelfStock);
      setCurrencies(snapshot.currencies);
      setExchangeRates(snapshot.exchangeRates);
      setLoading(false);
      return true;
    };
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await restoreSnapshot();
      setLoading(false);
      return;
    }
    const loadRemote = async () =>
      Promise.all([
        supabase.rpc("visible_products"),
        supabase.from("warehouses").select("*").order("created_at"),
        supabase.from("stock").select("*"),
        supabase.from("reorder_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("categories").select("*").order("name"),
        supabase.from("units").select("*").order("created_at"),
        supabase.from("custom_fields").select("*").order("created_at"),
        supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("stock_minimums").select("*"),
        supabase.from("shelf_stock").select("*"),
        supabase.from("currencies").select("*").order("code"),
        supabase
          .from("exchange_rates")
          .select("*")
          .order("effective_at", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
    let queryResults: Awaited<ReturnType<typeof loadRemote>>;
    try {
      queryResults = await loadRemote();
    } catch {
      if (!(await restoreSnapshot())) setLoading(false);
      return;
    }
    const [p, w, s, r, c, u, f, st, mn, sh, cur, rates] = queryResults;
    const queryFailed = [p, w, s, r, c, u, f, st, mn, sh, cur, rates].some(
      (result) => result.error,
    );
    if (queryFailed && (await restoreSnapshot())) return;
    const currencyError = cur.error ?? rates.error;
    if (currencyError && !currencyErrorShown.current) {
      toast.error(`تعذر تحميل العملات وأسعار الصرف: ${currencyError.message}`);
      currencyErrorShown.current = true;
    } else if (!currencyError) {
      currencyErrorShown.current = false;
    }
    setProducts((p.data ?? []) as unknown as Product[]);
    setWarehouses(w.data ?? []);
    setStock(s.data ?? []);
    setReorders(r.data ?? []);
    setCategories(c.data ?? []);
    setUnits(u.data ?? []);
    setFields(f.data ?? []);
    setSettings(st.data ?? null);
    setMinimums(mn.data ?? []);
    setShelfStock(sh.data ?? []);
    setCurrencies(cur.data ?? []);
    setExchangeRates(rates.data ?? []);
    if (!queryFailed) {
      await saveInventorySnapshot(session.user.id, {
        products: (p.data ?? []) as unknown as Product[],
        warehouses: w.data ?? [],
        stock: s.data ?? [],
        reorders: r.data ?? [],
        categories: c.data ?? [],
        units: u.data ?? [],
        fields: f.data ?? [],
        settings: st.data ?? null,
        minimums: mn.data ?? [],
        shelfStock: sh.data ?? [],
        currencies: cur.data ?? [],
        exchangeRates: rates.data ?? [],
        savedAt: Date.now(),
      });
    }
    setLoading(false);
  }, [session, authLoading]);

  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(t);
      t = setTimeout(load, 250);
    };
    let channel = supabase.channel(`inventory-${Math.random().toString(36).slice(2)}`);
    for (const table of LIVE_TABLES)
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, debounced);
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

  const categoryName = useCallback(
    (id: string | null) => categories.find((c) => c.id === id)?.name ?? "",
    [categories],
  );

  return {
    products,
    warehouses,
    stock,
    reorders,
    categories,
    units,
    fields,
    settings,
    minimums,
    shelfStock,
    currencies,
    exchangeRates,
    loading,
    cacheError,
    qty,
    categoryName,
    reload: load,
  };
}
