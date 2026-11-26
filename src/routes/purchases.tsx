import { useAuth } from "@/lib/auth";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Loader2,
  Trash2,
  Upload,
  Search,
  CheckCircle2,
  Plus,
  CreditCard,
  Truck,
  Receipt,
  Package,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory, type Product } from "@/hooks/use-inventory";
import { matchesSearch } from "@/lib/arabic";
import { findByCode, num, readSheet, str, toBaseQty } from "@/lib/inventory-utils";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { enqueueRpc, isTransientNetworkError } from "@/lib/offline/rpc-queue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/purchases")({
  head: () => ({
    meta: [
      { title: "فاتورة مشتريات | نظام المخزون الذكي" },
      {
        name: "description",
        content: "إدخال فاتورة مشتريات وتحديث الكميات والأسعار فوراً في كل المستودعات.",
      },
      { property: "og:title", content: "فاتورة مشتريات | نظام المخزون الذكي" },
      { property: "og:description", content: "إدخال المشتريات بالماسح أو يدوياً أو من ملف Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchasesPage,
});

type Line = {
  product: Product;
  qty: number;
  unit: "base" | "major";
  cost: number;
  price: string;
  wholesale: string;
};

function PurchasesPage() {
  const { canAction, canField } = useAuth();
  const { products, warehouses } = useInventory();
  const [wh, setWh] = useState("");
  const [supplier, setSupplier] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Tables<"purchase_invoices">[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const warehouse = wh || warehouses[0]?.id || "";

  const loadHistory = () =>
    supabase
      .from("purchase_invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setHistory(data ?? []));
  useEffect(() => {
    loadHistory();
  }, []);

  const suggestions = q.trim()
    ? products
        .filter((p) => matchesSearch([p.name, p.code, p.barcode, p.custom_barcode], q))
        .slice(0, 8)
    : [];

  function addProduct(p: Product, qty = 1, cost?: number, price = "", wholesale = "") {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      return [
        ...ls,
        { product: p, qty, unit: "base", cost: cost ?? Number(p.cost), price, wholesale },
      ];
    });
    setQ("");
  }
  function onCode(code: string) {
    const p = findByCode(products, code);
    if (p) addProduct(p);
    else {
      setQ(code);
      toast.error("الصنف غير مسجل — أضفه أولاً من شاشة الأصناف");
    }
  }
  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const p = findByCode(products, q) ?? (suggestions.length === 1 ? suggestions[0] : undefined);
    if (p) addProduct(p);
  }
  const update = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function importExcel(file?: File) {
    if (!file) return;
    try {
      const rows = await readSheet(file);
      let missing = 0;
      for (const r of rows) {
        const p =
          findByCode(products, str(r["الباركود"]) || str(r["الكود"])) ??
          products.find((x) => x.name === str(r["الاسم"]));
        if (!p) {
          missing++;
          continue;
        }
        addProduct(
          p,
          num(r["الكمية"]) || 1,
          r["التكلفة"] !== "" ? num(r["التكلفة"]) : undefined,
          str(r["سعر التجزئة"]),
          str(r["سعر الجملة"]),
        );
      }
      toast.success(`تم تحميل الفاتورة${missing ? ` — ${missing} صنف غير مسجل تم تجاهله` : ""}`);
    } catch {
      toast.error("تعذر قراءة الملف");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const baseCost = (l: Line) =>
    l.unit === "major" ? l.cost / (Number(l.product.pack_capacity) || 1) : l.cost;
  const total = lines.reduce((a, l) => a + l.qty * l.cost, 0);

  async function post() {
    if (!canAction("purchases.post")) return;
    if (!warehouse || warehouse === "undefined" || warehouse === "null" || !lines.length) return;
    setBusy(true);
    const items = lines.map((l) => ({
      product_id: l.product.id,
      qty: toBaseQty(l.qty, l.unit, Number(l.product.pack_capacity)),
      cost: Math.round(baseCost(l) * 1000) / 1000,
      price: canAction("prices.update") && canField("price") ? l.price : "",
      price_wholesale: canAction("prices.update") && canField("price_wholesale") ? l.wholesale : "",
    }));
    const operationId = crypto.randomUUID();
    const args = {
      _operation_id: operationId,
      _supplier: supplier?.trim() || "",
      _warehouse: warehouse,
      _items: items,
    };
    if (!navigator.onLine) {
      await enqueueRpc({ id: operationId, name: "post_purchase_offline", args });
      setBusy(false);
      toast.success("تم حفظ فاتورة الشراء محليًا للمزامنة");
      return;
    }
    let error: { message: string } | null = null;
    try {
      ({ error } = await supabase.rpc("post_purchase_offline", args));
    } catch (networkError) {
      if (isTransientNetworkError(networkError)) {
        await enqueueRpc({ id: operationId, name: "post_purchase_offline", args });
        setBusy(false);
        toast.success("انقطع الاتصال؛ حُفظت فاتورة الشراء محليًا للمزامنة");
        return;
      }
      setBusy(false);
      toast.error(networkError instanceof Error ? networkError.message : "تعذر ترحيل المشتريات");
      return;
    }
    setBusy(false);
    if (error) {
      if (isTransientNetworkError(error)) {
        await enqueueRpc({ id: operationId, name: "post_purchase_offline", args });
        toast.success("تعذر الاتصال؛ حُفظت فاتورة الشراء محليًا للمزامنة");
        return;
      }
      toast.error(error.message);
      return;
    }
    toast.success("تم ترحيل الفاتورة وتحديث الكميات والأسعار");
    setLines([]);
    setSupplier("");
    loadHistory();
  }

  if (!canField("cost") || !canField("quantity"))
    return (
      <AppShell title="المشتريات">
        <Card className="text-center py-12">
          <CardContent>
            <Package className="mx-auto size-12 opacity-30 mb-3" />
            <h3 className="font-semibold mb-1">عرض الفاتورة يحتاج صلاحية التكلفة والكميات.</h3>
          </CardContent>
        </Card>
      </AppShell>
    );

  return (
    <AppShell title="فاتورة مشتريات جديدة" roles={["storekeeper"]}>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">فاتورة مشتريات جديدة</h1>
            <p className="text-xs text-muted-foreground">
              أضف الأصناف بالمسح أو البحث أو استيراد ملف Excel، ثم trحيل الفاتورة لتحديث المخزون.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" /> استيراد Excel
            </Button>
            {canAction("inventory.create") && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 ml-2" /> صنف جديد
              </Button>
            )}
          </div>
        </div>
        <Separator />

        {/* Top info row: warehouse + supplier + import */}
        <div className="grid sm:grid-cols-3 gap-3">
          <Card className="p-3 shadow-sm border">
            <CardHeader className="px-0 py-1.5">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                المستودع المستلم
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-0">
              <Select value={warehouse} onValueChange={setWh}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="اختر المستودع" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
          {canField("supplier") && (
            <Card className="p-3 shadow-sm border">
              <CardHeader className="px-0 py-1.5">
                <CardTitle className="text-xs font-medium text-muted-foreground">المورد</CardTitle>
              </CardHeader>
              <CardContent className="pb-0">
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="اسم المورد"
                  className="h-9"
                />
              </CardContent>
            </Card>
          )}
          <Card className="p-3 shadow-sm border flex flex-col justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">استيراد سريع</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => importExcel(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              className="w-full h-9 text-xs"
              onClick={() => fileRef.current?.click()}
            >
              اختيار ملف
            </Button>
          </Card>
        </div>

        {/* Search + scanner */}
        <div className="relative mb-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pr-10 h-11 bg-card text-base"
              placeholder="امسح الباركود أو اكتب اسم الصنف ثم Enter…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onEnter}
            />
            {suggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-lg divide-y">
                {suggestions.map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-right p-2.5 hover:bg-accent text-sm flex justify-between"
                    onClick={() => addProduct(p)}
                  >
                    <span className="line-clamp-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {p.code}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <BarcodeScanner onDetected={onCode} />
        </div>

        {/* Lines table */}
        <Card className="shadow-sm border overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3">
            <CardTitle className="text-sm font-medium">أصناف الفاتورة</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {lines.length} صنف · الإجمالي {total.toFixed(2)} ر.ي
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-right">الصنف</th>
                  <th className="p-3 text-right">الوحدة</th>
                  <th className="p-3 text-right">الكمية</th>
                  {canField("cost") && <th className="p-3 text-right">التكلفة</th>}
                  {canField("price") && <th className="p-3 text-right">سعر تجزئة جديد</th>}
                  {canField("price_wholesale") && <th className="p-3 text-right">سعر جملة جديد</th>}
                  {canField("cost") && canField("quantity") && (
                    <th className="p-3 text-right">الإجمالي</th>
                  )}
                  <th className="p-3 text-right w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l, i) => (
                  <tr key={l.product.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <Package className="size-4 text-muted-foreground shrink-0" />
                        <span className="line-clamp-1">{l.product.name}</span>
                      </div>
                    </td>
                    <td className="p-1.5">
                      <Select
                        value={l.unit}
                        onValueChange={(v) => update(i, { unit: v as "base" | "major" })}
                      >
                        <SelectTrigger className="w-28 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">{l.product.unit}</SelectItem>
                          {l.product.major_unit && (
                            <SelectItem value="major">
                              {l.product.major_unit} ({Number(l.product.pack_capacity)})
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1.5">
                      <Input
                        className="w-20 h-9 text-right"
                        type="number"
                        min="0"
                        step="any"
                        value={l.qty}
                        onChange={(e) => update(i, { qty: Number(e.target.value) })}
                      />
                    </td>
                    {canField("cost") && (
                      <td className="p-1.5">
                        <Input
                          className="w-24 h-9 text-right"
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.cost}
                          onChange={(e) => update(i, { cost: Number(e.target.value) })}
                        />
                      </td>
                    )}
                    {canField("price") && (
                      <td className="p-1.5">
                        <Input
                          disabled={!canAction("prices.update")}
                          className="w-24 h-9 text-right"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={String(Number(l.product.price))}
                          value={l.price}
                          onChange={(e) => update(i, { price: e.target.value })}
                        />
                      </td>
                    )}
                    {canField("price_wholesale") && (
                      <td className="p-1.5">
                        <Input
                          disabled={!canAction("prices.update")}
                          className="w-24 h-9 text-right"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={String(Number(l.product.price_wholesale))}
                          value={l.wholesale}
                          onChange={(e) => update(i, { wholesale: e.target.value })}
                        />
                      </td>
                    )}
                    {canField("cost") && canField("quantity") && (
                      <td className="p-3 font-bold text-right">{(l.qty * l.cost).toFixed(2)}</td>
                    )}
                    <td className="p-1.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                        aria-label="حذف الصنف"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!lines.length && (
                  <tr>
                    <td
                      colSpan={9}
                      className="p-12 text-center text-muted-foreground flex flex-col items-center gap-2"
                    >
                      <Truck className="size-12 opacity-30" />
                      <p>أضف الأصناف بالمسح أو البحث أو استيراد ملف</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
          {lines.length > 0 && (
            <CardFooter className="border-t px-5 py-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold">الإجمالي النهائي:</span>
                <span className="text-2xl font-bold text-primary">{total.toFixed(2)} ر.ي</span>
              </div>
            </CardFooter>
          )}
        </Card>

        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-4 sm:justify-end">
          <div className="flex-1">
            <Badge variant="secondary" className="px-3 py-1.5 text-sm">
              العدادات جاهزة للترحيل
            </Badge>
          </div>
          <Button
            className="h-11 px-8 bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
            disabled={
              !canAction("purchases.post") ||
              !canField("cost") ||
              !canField("quantity") ||
              !canField("supplier") ||
              busy ||
              !lines.length ||
              !warehouse
            }
            onClick={post}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                جاري الترحيل…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 size-4" />
                ترحيل الفاتورة وتحديث المخزون
              </>
            )}
          </Button>
        </div>

        {/* History */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">آخر الفواتير</h2>
            <Button variant="outline" size="sm" onClick={loadHistory}>
              <RotateCcw className="size-4 ml-2" />
            </Button>
          </div>
          <div className="rounded-xl bg-card shadow-card divide-y text-sm">
            {history.map((h) => (
              <div key={h.id} className="flex gap-3 p-3 hover:bg-muted/50 transition-colors">
                <Badge variant="outline" className="text-xs px-2 py-1 shrink-0">
                  #{h.number}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{h.supplier || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {warehouses.find((w) => w.id === h.warehouse_id)?.name || "—"}
                  </div>
                </div>
                <div className="text-right font-mono text-sm font-semibold">
                  {Number(h.total).toFixed(2)} ر.ي
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(h.created_at).toLocaleDateString("ar")}
                </span>
              </div>
            ))}
            {!history.length && (
              <div className="p-6 text-center text-muted-foreground flex flex-col items-center gap-2">
                <Receipt className="size-12 opacity-30" />
                <p>لا توجد فواتير مشتريات بعد</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة صنف جديد</DialogTitle>
            <DialogDescription>إضافة صنف إلى المخزون قبل إدراجه في الفاتورة.</DialogDescription>
          </DialogHeader>
          <div className="text-xs text-muted-foreground mb-4">
            استخدم شاشة "الأصناف والمخزون" لإضافة صنف كامل البيانات.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
