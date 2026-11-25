import { useAuth } from "@/lib/auth";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Printer, Search, Minus, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BarcodeSvg } from "@/components/BarcodeSvg";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory } from "@/hooks/use-inventory";
import { matchesSearch } from "@/lib/arabic";
import { PRICE_TIERS, findByCode, type PriceKey } from "@/lib/inventory-utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/labels")({
  head: () => ({
    meta: [
      { title: "طباعة ملصقات الباركود | نظام المخزون الذكي" },
      {
        name: "description",
        content: "طباعة ملصقات باركود EAN-13 لصنف أو مجموعة أصناف على ورق A4 أو طابعة حرارية.",
      },
      { property: "og:title", content: "طباعة ملصقات الباركود | نظام المخزون الذكي" },
      { property: "og:description", content: "ملصقات باركود مخصصة بالاسم والسعر واسم المحل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LabelsPage,
});

type TextOpt = "none" | "shop" | "phone" | "name" | "price" | "code";
const TEXT_LABELS: Record<TextOpt, string> = {
  none: "بدون",
  shop: "اسم المحل",
  phone: "رقم التواصل",
  name: "اسم الصنف",
  price: "السعر",
  code: "كود الصنف",
};
const LAYOUTS = {
  a4_3: { label: "ورق A4 — 3 أعمدة (24 ملصق)", page: "A4", cols: 3, w: "64mm", h: "34mm" },
  a4_4: { label: "ورق A4 — 4 أعمدة (40 ملصق)", page: "A4", cols: 4, w: "48mm", h: "27mm" },
  a4_5: { label: "ورق A4 — 5 أعمدة (65 ملصق)", page: "A4", cols: 5, w: "38mm", h: "21mm" },
  t50: { label: "حرارية 50×25 مم", page: "50mm 25mm", cols: 1, w: "50mm", h: "25mm" },
  t40: { label: "حرارية 40×30 مم", page: "40mm 30mm", cols: 1, w: "40mm", h: "30mm" },
  t58: { label: "حرارية 58×40 مم", page: "58mm 40mm", cols: 1, w: "58mm", h: "40mm" },
} as const;
type LayoutKey = keyof typeof LAYOUTS;

function LabelsPage() {
  const { canAction, canField } = useAuth();
  const { products, settings } = useInventory();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, number>>({});
  const [top, setTop] = useState<TextOpt>("shop");
  const [bottom, setBottom] = useState<TextOpt>("price");
  const [extra, setExtra] = useState<TextOpt>("name");
  const [tier, setTier] = useState<PriceKey>("price");
  const [source, setSource] = useState<"auto" | "custom">("auto");
  const [layout, setLayout] = useState<LayoutKey>("a4_3");
  const L = LAYOUTS[layout];

  const list = useMemo(
    () => products.filter((p) => matchesSearch([p.name, p.barcode, p.custom_barcode, p.code], q)),
    [products, q],
  );
  const labels = products.flatMap((p) => Array.from({ length: sel[p.id] ?? 0 }, () => p));

  const text = (o: TextOpt, p: (typeof products)[number]) =>
    o === "shop"
      ? (settings?.shop_name ?? "")
      : o === "phone"
        ? (settings?.phone ?? "")
        : o === "name"
          ? p.name
          : o === "price"
            ? canField(tier)
              ? `${Number(p[tier])} ر.ي`
              : ""
            : o === "code"
              ? (p.code ?? "")
              : "";
  const setCount = (id: string, n: number) =>
    setSel((s) => {
      const c = { ...s };
      if (n <= 0) delete c[id];
      else c[id] = n;
      return c;
    });

  function print() {
    if (!canAction("labels.print")) return;
    const style = document.createElement("style");
    style.textContent = `@page { size: ${L.page}; margin: ${L.cols > 1 ? "8mm 5mm" : "0"}; }`;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => style.remove(), 500);
  }

  const Opt = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: TextOpt;
    onChange: (v: TextOpt) => void;
  }) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as TextOpt)}>
        <SelectTrigger className="bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(TEXT_LABELS) as TextOpt[]).map((k) => (
            <SelectItem key={k} value={k}>
              {TEXT_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  if (!canField("barcode") && !canField("custom_barcode"))
    return (
      <AppShell title="الملصقات">
        <p>طباعة الملصقات تحتاج صلاحية الباركود.</p>
      </AppShell>
    );

  return (
    <AppShell title="طباعة ملصقات الباركود">
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-5 no-print">
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pr-10 bg-card"
                placeholder="ابحث أو امسح…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <BarcodeScanner
              onDetected={(c) => {
                const p = findByCode(products, c);
                if (p) setCount(p.id, (sel[p.id] ?? 0) + 1);
                else setQ(c);
              }}
            />
          </div>
          <div className="flex gap-2 text-sm">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSel(Object.fromEntries(list.map((p) => [p.id, 1])))}
            >
              تحديد الكل
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSel({})}>
              إلغاء التحديد
            </Button>
          </div>
          <div className="rounded-xl bg-card shadow-card divide-y max-h-[60vh] overflow-y-auto">
            {list.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3">
                <Checkbox
                  checked={!!sel[p.id]}
                  onCheckedChange={(v) => setCount(p.id, v ? 1 : 0)}
                />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground" dir="ltr">
                    {p.barcode ?? p.custom_barcode}
                  </div>
                </div>
                {!!sel[p.id] && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => setCount(p.id, (sel[p.id] ?? 0) - 1)}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Input
                      className="w-14 h-8 text-center"
                      type="number"
                      min="1"
                      value={sel[p.id]}
                      onChange={(e) => setCount(p.id, Number(e.target.value))}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => setCount(p.id, (sel[p.id] ?? 0) + 1)}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl bg-card shadow-card p-4 grid sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>نوع الورق / الطابعة</Label>
              <Select value={layout} onValueChange={(v) => setLayout(v as LayoutKey)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LAYOUTS) as LayoutKey[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {LAYOUTS[k].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Opt label="النص فوق الباركود" value={top} onChange={setTop} />
            <Opt label="سطر إضافي" value={extra} onChange={setExtra} />
            <Opt label="النص تحت الباركود" value={bottom} onChange={setBottom} />
            <div className="space-y-1">
              <Label>شريحة السعر</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as PriceKey)}>
                <SelectTrigger>
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
            <div className="space-y-1 sm:col-span-2">
              <Label>الباركود المطبوع</Label>
              <Select value={source} onValueChange={(v) => setSource(v as "auto" | "custom")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">باركود المصنع (أو الخاص إن لم يوجد)</SelectItem>
                  <SelectItem value="custom">الباركود الخاص 628 دائماً</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            className="w-full h-11"
            disabled={!canAction("labels.print") || !labels.length}
            onClick={print}
          >
            <Printer className="size-4" /> طباعة {labels.length} ملصق
          </Button>
          <p className="text-xs text-muted-foreground">
            يمكنك اختيار "حفظ بصيغة PDF" من نافذة الطباعة. للطابعة الحرارية اضبط حجم الورق في
            إعدادات الطابعة بنفس المقاس.
          </p>
        </div>
      </div>

      <div className="print-area mt-6">
        <div className="no-print text-sm font-semibold mb-2">معاينة</div>
        <div
          className="grid gap-[2mm] bg-card p-2 rounded-xl print:p-0 print:gap-0"
          style={{ gridTemplateColumns: `repeat(${L.cols}, ${L.w})` }}
        >
          {labels.map((p, i) => {
            const code =
              source === "custom" ? (p.custom_barcode ?? "") : p.barcode || p.custom_barcode || "";
            return (
              <div
                key={i}
                className="label-cell flex flex-col items-center justify-center overflow-hidden border border-dashed print:border-0 text-center text-foreground"
                style={{ width: L.w, height: L.h, padding: "1mm" }}
              >
                {top !== "none" && (
                  <div className="text-[9px] font-bold leading-tight truncate w-full">
                    {text(top, p)}
                  </div>
                )}
                {extra !== "none" && (
                  <div className="text-[8px] leading-tight truncate w-full">{text(extra, p)}</div>
                )}
                <BarcodeSvg
                  value={code}
                  height={L.cols > 3 ? 22 : 30}
                  width={L.cols > 3 ? 1.1 : 1.4}
                  fontSize={9}
                />
                {bottom !== "none" && (
                  <div className="text-[10px] font-bold leading-tight truncate w-full">
                    {text(bottom, p)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
