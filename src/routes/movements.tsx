import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { History, User, Calendar, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useInventory } from "@/hooks/use-inventory";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/movements")({
  head: () => ({
    meta: [
      { title: "سجل حركات الأصناف التدقيقي | نظام المخزون الذكي" },
      {
        name: "description",
        content: "سجل تفصيلي لجميع الحركات المخزنية مع تفاصيل المستخدم والوقت والسبب.",
      },
    ],
  }),
  component: MovementsPage,
});

function MovementsPage() {
  const { products, warehouses } = useInventory();
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [hasError, setHasError] = useState(false);
  const productNames = useMemo(
    () => new Map(products.map((item) => [item.id, item.name])),
    [products],
  );
  const warehouseNames = useMemo(
    () => new Map(warehouses.map((item) => [item.id, item.name])),
    [warehouses],
  );

  useEffect(() => {
    let active = true;
    const loadMovements = async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!active) return;
      if (error) {
        setHasError(true);
        setMovements([]);
      } else {
        setHasError(false);
        setMovements(data ?? []);
      }
    };
    void loadMovements();
    const channel = supabase
      .channel("stock-movements-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => {
        void loadMovements();
      })
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <AppShell title="سجل حركة الأصناف والتدقيق">
      <div className="space-y-3">
        <div className="rounded-xl bg-card shadow-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="size-5 text-primary" />{" "}
            <span className="font-bold">سجل الحركات المخزنية المعتمد</span>
          </div>
          <div className="text-xs text-muted-foreground">
            عرض آخر {movements.length} حركة معتمدة
          </div>
        </div>

        {hasError && (
          <div className="rounded-xl bg-destructive/10 text-destructive p-4 flex items-center gap-2 text-sm">
            <AlertTriangle className="size-5" /> تعذر تحميل سجل الحركات من قاعدة البيانات.
          </div>
        )}

        <div className="rounded-xl bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-3 text-right">نوع الحركة</th>
                <th className="p-3 text-right">معرف الصنف / الوصف</th>
                <th className="p-3 text-right">الكمية</th>
                <th className="p-3 text-right">المستخدم</th>
                <th className="p-3 text-right">التاريخ والوقت</th>
                <th className="p-3 text-right">السبب / الملاحظة</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {movements.map((m) => {
                let formattedDate = "—";
                if (m.created_at) {
                  const date = new Date(m.created_at);
                  if (!Number.isNaN(date.getTime())) formattedDate = date.toLocaleString("ar");
                }
                return (
                  <tr key={m.id} className="hover:bg-muted/50">
                    <td className="p-3 font-semibold">
                      <span className="px-2 py-1 rounded bg-primary/10 text-primary">
                        {m.kind || "حركة"}
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {productNames.get(m.product_id) || m.product_id}
                    </td>
                    <td className="p-3 font-bold">{m.quantity}</td>
                    <td className="p-3 flex items-center gap-1.5">
                      <User className="size-4 text-muted-foreground" /> {m.user_id || "النظام"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3.5" /> {formattedDate}
                      </span>
                      <div className="text-[11px]">
                        {warehouseNames.get(m.warehouse_id) || "المستودع"}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{m.note || "—"}</td>
                  </tr>
                );
              })}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-muted-foreground">
                    لا توجد حركات مسجلة في السجل بعد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
