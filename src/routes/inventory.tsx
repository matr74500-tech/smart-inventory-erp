import { useCallback, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Plus, Barcode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { matchesSearch } from "@/lib/arabic";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "المخزون والبحث | سهيل سوفت" },
      { name: "description", content: "ابحث عن الأصناف بالاسم أو الباركود واعرض كمياتها في كل مستودع." },
      { property: "og:title", content: "المخزون والبحث | سهيل سوفت" },
      { property: "og:description", content: "بحث ذكي وماسح باركود للأصناف." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { products, warehouses, qty, loading } = useInventory();
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newBarcode, setNewBarcode] = useState("");

  const filtered = useMemo(() => products.filter((p) => matchesSearch([p.name, p.barcode], q)), [products, q]);

  const onScan = useCallback(
    (code: string) => {
      setQ(code);
      if (!products.some((p) => p.barcode === code)) {
        if (can("storekeeper")) {
          setNewBarcode(code);
          setAddOpen(true);
        } else toast.info("الصنف غير مسجل");
      }
    },
    [products, can],
  );

  return (
    <AppShell title="المخزون والبحث">
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pr-10 h-11 bg-card" placeholder="ابحث بالاسم أو الباركود…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <BarcodeScanner onDetected={onScan} />
        {can("storekeeper") && (
          <Button className="h-10" onClick={() => { setNewBarcode(""); setAddOpen(true); }}>
            <Plus className="size-4" /> صنف
          </Button>
        )}
      </div>

      {loading ? (
        <Loader2 className="mx-auto size-8 animate-spin text-primary" />
      ) : (
        <div className="rounded-xl bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-3 text-right">الصنف</th>
                <th className="p-3 text-right">الباركود</th>
                {warehouses.map((w) => <th key={w.id} className="p-3 text-right">{w.name}</th>)}
                <th className="p-3 text-right">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const total = qty(p.id);
                const low = Number(p.reorder_level) > 0 && total <= Number(p.reorder_level);
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-3 font-medium">{p.name}<div className="text-xs text-muted-foreground">{Number(p.price)} · {p.unit}</div></td>
                    <td className="p-3 font-mono text-xs" dir="ltr">{p.barcode ?? "—"}</td>
                    {warehouses.map((w) => <td key={w.id} className="p-3">{qty(p.id, w.id)}</td>)}
                    <td className={`p-3 font-bold ${low ? "text-destructive" : ""}`}>{total}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={3 + warehouses.length} className="p-8 text-center text-muted-foreground">لا توجد أصناف مطابقة</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <ProductDialog open={addOpen} onOpenChange={setAddOpen} barcode={newBarcode} />
    </AppShell>
  );
}

function ProductDialog({ open, onOpenChange, barcode }: { open: boolean; onOpenChange: (o: boolean) => void; barcode: string }) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(barcode);
  const [prevBarcode, setPrevBarcode] = useState(barcode);
  if (barcode !== prevBarcode) { setPrevBarcode(barcode); setCode(barcode); }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.from("products").insert({
      name: String(f.get("name")),
      barcode: code.trim() || null,
      unit: String(f.get("unit") || "حبة"),
      price: Number(f.get("price") || 0),
      reorder_level: Number(f.get("reorder_level") || 0),
      reorder_qty: Number(f.get("reorder_qty") || 0),
    });
    setBusy(false);
    if (error) return toast.error(error.code === "23505" ? "الباركود مستخدم لصنف آخر" : error.message);
    toast.success("تمت إضافة الصنف");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>صنف جديد</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1"><Label>اسم الصنف</Label><Input name="name" required /></div>
          <div className="col-span-2 space-y-1">
            <Label>الباركود</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input className="pr-10" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <BarcodeScanner onDetected={setCode} />
            </div>
          </div>
          <div className="space-y-1"><Label>الوحدة</Label><Input name="unit" defaultValue="حبة" /></div>
          <div className="space-y-1"><Label>السعر</Label><Input name="price" type="number" step="0.01" min="0" /></div>
          <div className="space-y-1"><Label>حد الطلب</Label><Input name="reorder_level" type="number" min="0" /></div>
          <div className="space-y-1"><Label>كمية إعادة التوريد</Label><Input name="reorder_qty" type="number" min="0" /></div>
          <Button type="submit" className="col-span-2" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} حفظ</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
