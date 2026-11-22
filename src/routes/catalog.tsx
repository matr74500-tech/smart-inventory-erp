import { useAuth } from "@/lib/auth";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Printer, Package } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useInventory } from "@/hooks/use-inventory";
import { PRICE_TIERS, type PriceKey } from "@/lib/inventory-utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "كتالوج المنتجات PDF | نظام المخزون الذكي" },
      { name: "description", content: "تصدير كتالوج منسق للزبائن بصور الأصناف وأسمائها وأسعارها." },
      { property: "og:title", content: "كتالوج المنتجات PDF | نظام المخزون الذكي" },
      { property: "og:description", content: "كتالوج منتجات جاهز للمشاركة بصيغة PDF." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogPage,
});

const ALL = "__all";

function CatalogPage() {
  const { canAction, canField } = useAuth();
  const { products, categories, settings, qty, categoryName } = useInventory();
  const [cat, setCat] = useState(ALL);
  const [tier, setTier] = useState<PriceKey>("price");
  const [inStock, setInStock] = useState(false);
  const [cols, setCols] = useState("3");

  const list = useMemo(
    () =>
      products.filter((p) => (cat === ALL || p.category_id === cat) && (!inStock || qty(p.id) > 0)),
    [products, cat, inStock, qty],
  );

  function print() {
    if (!canAction("catalog.print")) return;
    const style = document.createElement("style");
    style.textContent = "@page { size: A4; margin: 10mm; }";
    document.head.appendChild(style);
    window.print();
    setTimeout(() => style.remove(), 500);
  }

  return (
    <AppShell title="كتالوج المنتجات">
      <div className="no-print flex flex-wrap items-end gap-3 mb-5 rounded-xl bg-card shadow-card p-4">
        <div className="space-y-1">
          <Label>الفئة</Label>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-44">
              <SelectValue />
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
        </div>
        <div className="space-y-1">
          <Label>السعر المعروض</Label>
          <Select value={tier} onValueChange={(v) => setTier(v as PriceKey)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRICE_TIERS.filter((t) => canField(t.key)).map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>أعمدة</Label>
          <Select value={cols} onValueChange={setCols}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["2", "3", "4"].map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm h-9">
          <Switch checked={inStock} onCheckedChange={setInStock} /> المتوفر فقط
        </label>
        <div className="flex-1" />
        <Button disabled={!canAction("catalog.print")} onClick={print}>
          <Printer className="size-4" /> تصدير PDF
        </Button>
      </div>
      <p className="no-print text-xs text-muted-foreground mb-3">
        اختر "حفظ بصيغة PDF" في نافذة الطباعة لمشاركة الكتالوج مع الزبائن.
      </p>

      <div className="print-area bg-card rounded-xl p-6 print:p-0 text-foreground">
        <div className="text-center mb-6 border-b pb-4">
          <div className="text-3xl font-bold">{settings?.shop_name}</div>
          <div className="text-sm text-muted-foreground">
            كتالوج المنتجات{cat !== ALL ? ` — ${categoryName(cat)}` : ""}
            {settings?.phone ? ` · ${settings.phone}` : ""}
          </div>
        </div>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {list.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border p-3 flex flex-col items-center text-center break-inside-avoid"
            >
              <div className="aspect-square w-full rounded-md bg-muted overflow-hidden grid place-items-center mb-2">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="size-full object-contain" />
                ) : (
                  <Package className="size-10 text-muted-foreground" />
                )}
              </div>
              <div className="font-semibold text-sm leading-snug">{p.name}</div>
              {p.description && (
                <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>
              )}
              {canField(tier) && (
                <div className="mt-1 text-lg font-bold text-primary">
                  {Number(p[tier])} <span className="text-xs">ر.ي</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
