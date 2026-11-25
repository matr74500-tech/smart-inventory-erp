import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { History, User, Calendar, AlertTriangle, Filter, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useInventory } from "@/hooks/use-inventory";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

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

const KIND_LABELS: Record<string, string> = {
  sale: "بيع",
  purchase: "شراء",
  return: "مرتجع",
  adjustment: "تعديل مخزون",
  transfer: "تحويل",
  stocktake: "جرد",
  receipt: "إيداع",
  payment: "صرف",
};

const KIND_VARIANT: Record<string, string> = {
  sale: "destructive",
  purchase: "success",
  return: "warning",
  adjustment: "secondary",
  transfer: "primary",
  stocktake: "secondary",
  receipt: "success",
  payment: "secondary",
};

function MovementsPage() {
  const { products, warehouses } = useInventory();
  const [movements, setMovements] = useState<Tables<"stock_movements">[]>([]);
  const [hasError, setHasError] = useState(false);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState("all");

  const productNames = useMemo(
    () => new Map(products.map((item) => [item.id, item.name])),
    [products],
  );
  const warehouseNames = useMemo(
    () => new Map(warehouses.map((item) => [item.id, item.name])),
    [warehouses],
  );

  const uniqueKinds = useMemo(
    () => [...new Set(movements.map((m) => m.kind).filter(Boolean))],
    [movements],
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

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      const matchesSearch =
        !q ||
        productNames.get(m.product_id)?.includes(q) ||
        m.product_id?.includes(q) ||
        (m.note ?? "").includes(q);
      const matchesKind = kindFilter === "all" || m.kind === kindFilter;
      return matchesSearch && matchesKind;
    });
  }, [movements, q, kindFilter, productNames]);

  return (
    <AppShell title="سجل حركة الأصناف والتدقيق">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">سجل الحركات المخزنية</h1>
            <p className="text-xs text-muted-foreground">
              سجل تفصيلي لجميع الحركات المخزنية مع تفاصيل المستخدم والوقت والسبب.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQ("");
                setKindFilter("all");
              }}
            >
              <Filter className="size-4 ml-2" /> إعادة تعيين الفلاتر
            </Button>
          </div>
        </div>
        <Separator />

        {/* Stats */}
        <div className="grid sm:grid-cols-4 gap-3">
          <Card className="p-4 shadow-sm border">
            <CardHeader className="px-0 py-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">إجمالي الحركات</CardTitle>
            </CardHeader>
            <CardContent className="pb-0">
              <div className="text-2xl font-bold text-primary">{filtered.length}</div>
            </CardContent>
          </Card>
          <Card className="p-4 shadow-sm border">
            <CardHeader className="px-0 py-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">خروج (بيع / صرف)</CardTitle>
            </CardHeader>
            <CardContent className="pb-0">
              <div className="text-2xl font-bold text-destructive">
                {filtered.filter((m) => m.kind === "sale" || m.kind === "payment").length}
              </div>
            </CardContent>
          </Card>
          <Card className="p-4 shadow-sm border">
            <CardHeader className="px-0 py-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">دخول (شراء / إيداع)</CardTitle>
            </CardHeader>
            <CardContent className="pb-0">
              <div className="text-2xl font-bold text-success">
                {filtered.filter((m) => m.kind === "purchase" || m.kind === "receipt").length}
              </div>
            </CardContent>
          </Card>
          <Card className="p-4 shadow-sm border">
            <CardHeader className="px-0 py-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">آخر حركة</CardTitle>
            </CardHeader>
            <CardContent className="pb-0">
              <div className="text-sm font-semibold">
                {filtered.length > 0 ? new Date(filtered[0].created_at).toLocaleDateString("ar") : "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3 mb-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pr-10 h-10 bg-card"
              placeholder="ابحث باسم الصنف أو الكود أو الملاحظة…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="h-10 min-w-[150px]">
              <SelectValue placeholder="كل أنواع الحركات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل أنواع الحركات</SelectItem>
              {uniqueKinds.map((k) => (
                <SelectItem key={k} value={k ?? ""}>
                  {KIND_LABELS[k ?? ""] || k}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Error state */}
        {hasError && (
          <Card className="border-destructive bg-destructive/5 shadow-sm">
            <CardContent className="p-4 flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              <span className="text-sm text-destructive">تعذر تحميل سجل الحركات من قاعدة البيانات.</span>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="px-5 py-3">
            <CardTitle className="text-sm font-medium">تفاصيل الحركات</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              عرض آخر {filtered.length} حركة مخزنية معتمدة
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-right">نوع الحركة</th>
                  <th className="p-3 text-right">الصنف</th>
                  <th className="p-3 text-right">المستودع</th>
                  <th className="p-3 text-right">الكمية</th>
                  <th className="p-3 text-right">المستخدم</th>
                  <th className="p-3 text-right">التاريخ والوقت</th>
                  <th className="p-3 text-right">السبب / الملاحظة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((m) => {
                  let formattedDate = "—";
                  if (m.created_at) {
                    const date = new Date(m.created_at);
                    if (!Number.isNaN(date.getTime()))
                      formattedDate = date.toLocaleString("ar");
                  }
                  const quantitySign =
                    m.kind === "sale" || m.kind === "return" || m.kind === "payment" ? "-" : "+";
                  return (
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-semibold">
                        <Badge
                          variant={
                            (KIND_VARIANT[m.kind ?? ""] as
                              | "default"
                              | "destructive"
                              | "outline"
                              | "secondary") ?? "secondary"
                          }
                        >
                          {KIND_LABELS[m.kind ?? ""] || m.kind || "حركة"}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs font-medium">
                        {productNames.get(m.product_id) || m.product_id}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {warehouseNames.get(m.warehouse_id) || "المستودع"}
                      </td>
                      <td className="p-3 font-mono font-bold text-right">
                        {quantitySign} {Math.abs(m.quantity)}
                      </td>
                      <td className="p-3 flex items-center gap-1.5">
                        <User className="size-4 text-muted-foreground" /> {m.user_id || "النظام"}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3.5" /> {formattedDate}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground line-clamp-1">
                        {m.note || "—"}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                      <History className="size-16 opacity-30" />
                      <p>لا توجد حركات مسجلة في السجل بعد</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
