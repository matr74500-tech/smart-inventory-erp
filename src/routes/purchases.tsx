import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Trash2, Upload, Search, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory, type Product } from "@/hooks/use-inventory";
import { matchesSearch } from "@/lib/arabic";
import { findByCode, num, readSheet, str, toBaseQty } from "@/lib/inventory-utils";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/purchases")({
  head: () => ({
    meta: [
      { title: "فاتورة مشتريات | سهيل سوفت" },
      { name: "description", content: "إدخال فاتورة مشتريات وتحديث الكميات والأسعار فوراً في كل المستودعات." },
      { property: "og:title", content: "فاتورة مشتريات | سهيل سوفت" },
      { property: "og:description", content: "إدخال المشتريات بالماسح أو يدوياً أو من ملف Excel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchasesPage,
});

type Line = { product: Product; qty: number; unit: "base" | "major"; cost: number; price: string; wholesale: string };

function PurchasesPage() {
  const { products, warehouses } = useInventory();
  const [wh, setWh] = useState("");
  const [supplier, setSupplier] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Tables<"purchase_invoices">[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const warehouse = wh || warehouses[0]?.id || "";

  const loadHistory = () => supabase.from("purchase_invoices").select("*").order("created_at", { ascending: false }).limit(10).then(({ data }) => setHistory(data ?? []));
  useEffect(() => { loadHistory(); }, []);

  const suggestions = q.trim() ? products.filter((p) => matchesSearch([p.name, p.code, p.barcode, p.custom_barcode], q)).slice(0, 8) : [];

  function addProduct(p: Product, qty = 1, cost?: number, price = "", wholesale = "") {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      return [...ls, { product: p, qty, unit: "base", cost: cost ?? Number(p.cost), price, wholesale }];
    });
    setQ("");
  }
  function onCode(code: string) {
    const p = findByCode(products, code);
    if (p) addProduct(p); else { setQ(code); toast.error("الصنف غير مسجل — أضفه أولاً من شاشة الأصناف"); }
  }
  function onEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const p = findByCode(products, q) ?? (suggestions.length === 1 ? suggestions[0] : undefined);
    if (p) addProduct(p);
  }
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function importExcel(file?: File) {
    if (!file) return;
    try {
      const rows = await readSheet(file);
      let missing = 0;
      for (const r of rows) {
        const p = findByCode(products, str(r["الباركود"]) || str(r["الكود"])) ?? products.find((x) => x.name === str(r["الاسم"]));
        if (!p) { missing++; continue; }
        addProduct(p, num(r["الكمية"]) || 1, r["التكلفة"] !== "" ? num(r["التكلفة"]) : undefined, str(r["سعر التجزئة"]), str(r["سعر الجملة"]));
      }
      toast.success(`تم تحميل الفاتورة${missing ? ` — ${missing} صنف غير مسجل تم تجاهله` : ""}`);
    } catch { toast.error("تعذر قراءة الملف"); }
    if (fileRef.current) fileRef.current.value = "";
  }

  // cost entered per chosen unit; stored per base unit
  const baseCost = (l: Line) => (l.unit === "major" ? l.cost / (Number(l.product.pack_capacity) || 1) : l.cost);
  const total = lines.reduce((a, l) => a + l.qty * l.cost, 0);

  async function post() {
    if (!warehouse || !lines.length) return;
    setBusy(true);
    const items = lines.map((l) => ({
      product_id: l.product.id,
      qty: toBaseQty(l.qty, l.unit, Number(l.product.pack_capacity)),
      cost: Math.round(baseCost(l) * 1000) / 1000,
      price: l.price, price_wholesale: l.wholesale,
    }));
    const { error } = await supabase.rpc("post_purchase", { _supplier: supplier || "", _warehouse: warehouse, _items: items });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم ترحيل الفاتورة وتحديث الكميات والأسعار");
    setLines([]); setSupplier(""); loadHistory();
  }

  return (
    <AppShell title="فاتورة مشتريات جديدة" roles={["storekeeper"]}>
      <div className="rounded-xl bg-card shadow-card p-4 grid sm:grid-cols-3 gap-3 mb-4">
        <div className="space-y-1"><Label>المستودع المستلم</Label>
          <Select value={warehouse} onValueChange={setWh}><SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1"><Label>المورد</Label><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="اسم المورد" /></div>
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => importExcel(e.target.files?.[0])} />
          <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}><Upload className="size-4" /> استيراد Excel</Button>
        </div>
      </div>

      <div className="relative mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pr-10 h-11 bg-card" placeholder="امسح الباركود أو اكتب اسم الصنف ثم Enter…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onEnter} />
          {suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border bg-popover shadow-lg divide-y">
              {suggestions.map((p) => (
                <button key={p.id} className="w-full text-right p-2.5 hover:bg-accent text-sm flex justify-between" onClick={() => addProduct(p)}>
                  <span>{p.name}</span><span className="text-xs text-muted-foreground" dir="ltr">{p.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <BarcodeScanner onDetected={onCode} />
      </div>

      <div className="rounded-xl bg-card shadow-card overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground"><tr>
            <th className="p-3 text-right">الصنف</th><th className="p-3 text-right">الوحدة</th><th className="p-3 text-right">الكمية</th>
            <th className="p-3 text-right">التكلفة</th><th className="p-3 text-right">سعر تجزئة جديد</th><th className="p-3 text-right">سعر جملة جديد</th><th className="p-3 text-right">الإجمالي</th><th />
          </tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.product.id} className="border-t">
                <td className="p-3 font-medium min-w-36">{l.product.name}</td>
                <td className="p-1.5">
                  <Select value={l.unit} onValueChange={(v) => update(i, { unit: v as "base" | "major" })}><SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="base">{l.product.unit}</SelectItem>{l.product.major_unit && <SelectItem value="major">{l.product.major_unit} ({Number(l.product.pack_capacity)})</SelectItem>}</SelectContent></Select>
                </td>
                <td className="p-1.5"><Input className="w-20 h-9" type="number" min="0" step="any" value={l.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} /></td>
                <td className="p-1.5"><Input className="w-24 h-9" type="number" min="0" step="0.01" value={l.cost} onChange={(e) => update(i, { cost: Number(e.target.value) })} /></td>
                <td className="p-1.5"><Input className="w-24 h-9" type="number" min="0" step="0.01" placeholder={String(Number(l.product.price))} value={l.price} onChange={(e) => update(i, { price: e.target.value })} /></td>
                <td className="p-1.5"><Input className="w-24 h-9" type="number" min="0" step="0.01" placeholder={String(Number(l.product.price_wholesale))} value={l.wholesale} onChange={(e) => update(i, { wholesale: e.target.value })} /></td>
                <td className="p-3 font-semibold">{(l.qty * l.cost).toFixed(2)}</td>
                <td className="p-1.5"><Button size="icon" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="حذف"><Trash2 className="size-4 text-destructive" /></Button></td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">أضف الأصناف بالمسح أو البحث أو استيراد ملف</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <div className="text-lg">الإجمالي: <b>{total.toFixed(2)}</b></div>
        <div className="flex-1" />
        <Button className="h-11 px-8" disabled={busy || !lines.length || !warehouse} onClick={post}>{busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} ترحيل الفاتورة</Button>
      </div>
      <p className="text-xs text-muted-foreground mb-6">أعمدة ملف الاستيراد: الباركود أو الكود أو الاسم، الكمية، التكلفة، سعر التجزئة، سعر الجملة (اختياري).</p>

      <h2 className="font-bold mb-2">آخر الفواتير</h2>
      <div className="rounded-xl bg-card shadow-card divide-y text-sm">
        {history.map((h) => (
          <div key={h.id} className="flex gap-3 p-3"><b>#{h.number}</b><span className="flex-1">{h.supplier || "—"}</span><span>{warehouses.find((w) => w.id === h.warehouse_id)?.name}</span><span className="font-semibold">{Number(h.total).toFixed(2)}</span><span className="text-muted-foreground">{new Date(h.created_at).toLocaleDateString("ar")}</span></div>
        ))}
        {!history.length && <div className="p-4 text-center text-muted-foreground">لا توجد فواتير بعد</div>}
      </div>
    </AppShell>
  );
}
