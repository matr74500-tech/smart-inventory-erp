import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Search,
  Plus,
  Loader2,
  Pencil,
  Upload,
  Download,
  FileText,
  Tags,
  Package,
  AlertTriangle,
  Clock,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { ExpiryBadge } from "@/components/ExpiryBadge";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { ProductDialog } from "@/components/ProductDialog";
import { useInventory, type Product } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { matchesSearch } from "@/lib/arabic";
import { PRICE_TIERS, findByCode, num, readSheet, str, writeSheet } from "@/lib/inventory-utils";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/inventory")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s["q"] === "string" ? (s["q"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "الأصناف والمخزون | نظام المخزون الذكي" },
      {
        name: "description",
        content: "إدارة الأصناف: الأكواد، الباركود، الفئات، المستودعات، الأسعار والصور.",
      },
      { property: "og:title", content: "الأصناف والمخزون | نظام المخزون الذكي" },
      { property: "og:description", content: "بحث ذكي وماسح باركود واستيراد وتصدير Excel." },
    ],
  }),
  component: InventoryPage,
});

const ALL = "__all";

function InventoryPage() {
  const inv = useInventory();
  const { products, warehouses, categories, qty, loading, categoryName } = inv;
  const { canAction, canField, canPage } = useAuth();
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  const [cat, setCat] = useState(ALL);
  const [wh, setWh] = useState(ALL);
  const [dialog, setDialog] = useState<{
    open: boolean;
    product?: Product | null;
    barcode?: string;
  }>({ open: false });
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (cat === ALL || p.category_id === cat) &&
          (wh === ALL || qty(p.id, wh) > 0 || p.warehouse_id === wh) &&
          matchesSearch(
            [p.name, p.barcode, p.custom_barcode, p.code, p.model_no, p.description],
            q,
          ),
      ),
    [products, q, cat, wh, qty],
  );

  const lowCount = filtered.filter(
    (p) => Number(p.reorder_level) > 0 && qty(p.id) <= Number(p.reorder_level),
  ).length;

  const onScan = useCallback(
    (code: string) => {
      setQ(code);
      const found = findByCode(products, code);
      if (!found) {
        if (canAction("inventory.create")) setDialog({ open: true, barcode: code });
        else toast.info("الصنف غير مسجل");
      }
    },
    [products, canAction],
  );

  async function exportExcel() {
    await writeSheet(
      filtered.map((p) =>
        Object.fromEntries(
          Object.entries({
            الكود: p.code,
            الاسم: p.name,
            الوصف: p.description ?? "",
            الموديل: p.model_no ?? "",
            الباركود: p.barcode ?? "",
            "الباركود الخاص": p.custom_barcode ?? "",
            الفئة: categoryName(p.category_id),
            المورد: p.supplier ?? "",
            الرف: p.shelf ?? "",
            الوحدة: p.unit,
            "الوحدة الكبرى": p.major_unit ?? "",
            "سعة العبوة": p.pack_capacity,
            التكلفة: p.cost,
            ...Object.fromEntries(PRICE_TIERS.map((t) => [t.label, p[t.key]])),
            ...Object.fromEntries(warehouses.map((w) => [w.name, qty(p.id, w.id)])),
            الإجمالي: qty(p.id),
          }).filter(([label]) => {
            const keys: Record<string, string> = {
              الكود: "code",
              الاسم: "name",
              الوصف: "description",
              الموديل: "model_no",
              الباركود: "barcode",
              "الباركود الخاص": "custom_barcode",
              الفئة: "category_id",
              المورد: "supplier",
              الرف: "shelf",
              الوحدة: "unit",
              "الوحدة الكبرى": "major_unit",
              "سعة العبوة": "pack_capacity",
              التكلفة: "cost",
            };
            return canField(
              keys[label] ?? PRICE_TIERS.find((t) => t.label === label)?.key ?? "quantity",
            );
          }),
        ),
      ),
      `الأصناف-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  async function importExcel(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      const rows = await readSheet(file);
      let added = 0,
        updated = 0;
      for (const r of rows) {
        const name = str(r["الاسم"]);
        if (!name) continue;
        const catName = str(r["الفئة"]);
        const row = {
          name,
          description: str(r["الوصف"]) || null,
          model_no: str(r["الموديل"]) || null,
          barcode: str(r["الباركود"]) || null,
          category_id: categories.find((c) => c.name === catName)?.id ?? null,
          shelf: str(r["الرف"]) || null,
          unit: str(r["الوحدة"]) || "حبة",
          major_unit: str(r["الوحدة الكبرى"]) || null,
          pack_capacity: num(r["سعة العبوة"]) || 1,
          cost: num(r["التكلفة"]),
          supplier: str(r["المورد"]) || null,
          ...Object.fromEntries(PRICE_TIERS.map((t) => [t.key, num(r[t.label])])),
        };
        const existing = products.find(
          (p) =>
            (row.barcode && p.barcode === row.barcode) ||
            (str(r["الكود"]) && p.code === str(r["الكود"])),
        );
        const allowedRow = Object.fromEntries(
          Object.entries(row).filter(
            ([k]) =>
              canField(k) &&
              (!["cost", ...PRICE_TIERS.map((t) => t.key)].includes(k) ||
                canAction("prices.update")),
          ),
        );
        const { error } = existing
          ? await supabase
              .from("products")
              .update(allowedRow as Partial<typeof row>)
              .eq("id", existing.id)
          : await supabase.from("products").insert(allowedRow as typeof row);
        if (error) toast.error(`${name}: ${error.message}`);
        else if (existing) updated++;
        else added++;
      }
      toast.success(`تمت إضافة ${added} وتحديث ${updated} صنف`);
    } catch {
      toast.error("تعذر قراءة الملف");
    }
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <AppShell title="الأصناف والمخزون">
      <div className="space-y-5">
        {/* Header with search and actions */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="flex flex-col lg:flex-row gap-3 w-full lg:w-auto">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pr-10 h-11 bg-card"
                placeholder="ابحث بالاسم أو الكود أو الباركود…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <BarcodeScanner onDetected={onScan} />
          </div>
          <div className="flex gap-2 w-full lg:w-auto justify-end">
            {canAction("inventory.create") && (
              <Button onClick={() => setDialog({ open: true })}>
                <Plus className="mr-2 size-4" /> صنف جديد
              </Button>
            )}
            {canAction("inventory.import") && (
              <div className="relative">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => importExcel(e.target.files?.[0])}
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      جاري الاستيراد…
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 size-4" />
                      استيراد
                    </>
                  )}
                </Button>
              </div>
            )}
            {canAction("inventory.export") && (
              <Button variant="outline" onClick={exportExcel}>
                <Download className="mr-2 size-4" /> تصدير
              </Button>
            )}
            {canPage("catalog") && (
              <Button variant="outline" asChild>
                <Link to="/catalog">
                  <FileText className="mr-2 size-4" /> كتالوج PDF
                </Link>
              </Button>
            )}
            {canPage("labels") && (
              <Button variant="outline" asChild>
                <Link to="/labels">
                  <Tags className="mr-2 size-4" /> ملصقات
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="كل الفئات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>كل الفئات</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={wh} onValueChange={setWh}>
            <SelectTrigger className="w-48 bg-card">
              <SelectValue placeholder="كل المستودعات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>كل المستودعات</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          {lowCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1 px-3 py-2 text-sm">
              <AlertTriangle className="size-4" />
              {lowCount} صنف تحت حد الطلب
            </Badge>
          )}
        </div>

        {/* Inventory table */}
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="rounded-xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    الصنف
                  </th>
                  {(canField("code") || canField("barcode") || canField("custom_barcode")) && (
                    <th className="p-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      الكود / الباركود
                    </th>
                  )}
                  {(canField("category_id") || canField("shelf")) && (
                    <th className="p-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      الفئة / الرف
                    </th>
                  )}
                  {canField("price") && (
                    <th className="p-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      سعر التجزئة
                    </th>
                  )}
                  {canField("quantity") &&
                    warehouses.map((w) => (
                      <th
                        key={w.id}
                        className="p-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                      >
                        {w.name}
                      </th>
                    ))}
                  {canField("quantity") && (
                    <th className="p-4 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      الإجمالي
                    </th>
                  )}
                  {canAction("inventory.edit") && <th className="p-4 text-right w-12"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const total = qty(p.id);
                  const low = Number(p.reorder_level) > 0 && total <= Number(p.reorder_level);
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b hover:bg-muted/30 transition-colors",
                        low && "bg-amber-50/50",
                      )}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3 min-w-[150px]">
                          {canField("image_url") &&
                            (p.image_url ? (
                              <img
                                src={p.image_url}
                                alt=""
                                className="size-10 rounded-md object-cover border border-border"
                              />
                            ) : (
                              <div className="size-10 rounded-md bg-muted grid place-items-center border border-border">
                                <Package className="size-4.5 text-muted-foreground" />
                              </div>
                            ))}
                          <div className="min-w-0">
                            {canField("name") && (
                              <div className="font-medium text-foreground truncate">{p.name}</div>
                            )}
                            {canField("expiry_date") && <ExpiryBadge date={p.expiry_date} />}
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {p.unit}
                              {p.major_unit
                                ? ` · ${p.major_unit} (${Number(p.pack_capacity)})`
                                : ""}
                              {p.model_no ? ` · ${p.model_no}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      {(canField("code") || canField("barcode") || canField("custom_barcode")) && (
                        <td className="p-4 font-mono text-xs text-muted-foreground dir-ltr">
                          <div className="text-foreground font-medium">{p.code}</div>
                          <div>{p.barcode ?? p.custom_barcode ?? "—"}</div>
                        </td>
                      )}
                      {(canField("category_id") || canField("shelf")) && (
                        <td className="p-4 text-xs text-muted-foreground">
                          {canField("category_id") && (
                            <div className="text-foreground">
                              {categoryName(p.category_id) || "—"}
                            </div>
                          )}
                          <div>{p.shelf ?? "—"}</div>
                        </td>
                      )}
                      {canField("price") && (
                        <td className="p-4 text-right font-mono text-xs">
                          {Number(p.price).toLocaleString()}
                        </td>
                      )}
                      {canField("quantity") &&
                        warehouses.map((w) => (
                          <td key={w.id} className="p-4 text-right font-mono text-xs">
                            {qty(p.id, w.id)}
                          </td>
                        ))}
                      {canField("quantity") && (
                        <td
                          className={cn(
                            "p-4 font-bold text-right",
                            low ? "text-destructive" : "text-foreground",
                          )}
                        >
                          {total}
                          {low && (
                            <Badge
                              variant="outline"
                              className="ml-2 text-xs border-destructive text-destructive"
                            >
                              ناقص
                            </Badge>
                          )}
                        </td>
                      )}
                      {canAction("inventory.edit") && (
                        <td className="p-4">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDialog({ open: true, product: p })}
                            aria-label="تعديل الصنف"
                            className="hover:bg-destructive/10 text-destructive hover:text-destructive"
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7 + warehouses.length}
                      className="p-12 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Package className="size-12 opacity-30" />
                        <p className="text-sm">لا توجد أصناف مطابقة</p>
                        {q && (
                          <Button variant="outline" size="sm" onClick={() => setQ("")}>
                            مسح البحث
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          أعمدة ملف الاستيراد: الاسم، الكود، الباركود، الوصف، الموديل، الفئة، الرف، الوحدة، الوحدة
          الكبرى، سعة العبوة، التكلفة، المورد، {PRICE_TIERS.map((t) => t.label).join("، ")}.
        </p>
        <ProductDialog
          open={dialog.open}
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          product={dialog.product}
          barcode={dialog.barcode}
          categories={categories}
          warehouses={warehouses}
          units={inv.units}
          fields={inv.fields}
        />
      </div>
    </AppShell>
  );
}
