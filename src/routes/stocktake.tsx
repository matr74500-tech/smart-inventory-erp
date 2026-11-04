import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory } from "@/hooks/use-inventory";
import { matchesSearch } from "@/lib/arabic";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/stocktake")({
  head: () => ({
    meta: [
      { title: "الجرد والإدخال الأولي | سهيل سوفت" },
      { name: "description", content: "أدخل الكميات الأولية أو نتائج الجرد الفعلي لكل مستودع." },
      { property: "og:title", content: "الجرد والإدخال الأولي | سهيل سوفت" },
      { property: "og:description", content: "جرد المخزون وتحديث الكميات فوراً." },
    ],
  }),
  component: StocktakePage,
});

function StocktakePage() {
  const { products, warehouses, qty } = useInventory();
  const [wh, setWh] = useState<string>("");
  const [kind, setKind] = useState<"initial" | "count">("count");
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const warehouse = wh || warehouses[0]?.id || "";
  const list = useMemo(() => products.filter((p) => matchesSearch([p.name, p.barcode], q)), [products, q]);

  async function save(productId: string) {
    const v = drafts[productId];
    if (v === undefined || v === "") return;
    setSaving(productId);
    const { error } = await supabase.rpc("set_stock", { _product: productId, _warehouse: warehouse, _qty: Number(v), _kind: kind });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    setDrafts((d) => { const n = { ...d }; delete n[productId]; return n; });
    toast.success("تم تحديث الكمية");
  }

  return (
    <AppShell title="الجرد والإدخال الأولي" roles={["storekeeper"]}>
      <div className="flex flex-wrap gap-2 mb-5">
        <Select value={warehouse} onValueChange={setWh}>
          <SelectTrigger className="w-48 bg-card"><SelectValue placeholder="المستودع" /></SelectTrigger>
          <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={kind} onValueChange={(v) => setKind(v as "initial" | "count")}>
          <SelectTrigger className="w-40 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="count">جرد فعلي</SelectItem>
            <SelectItem value="initial">إدخال أولي</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pr-10 bg-card" placeholder="بحث…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <BarcodeScanner onDetected={setQ} />
      </div>
      <div className="rounded-xl bg-card shadow-card divide-y">
        {list.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">الكمية الحالية: {qty(p.id, warehouse)} {p.unit}</div>
            </div>
            <Input
              type="number" min="0" className="w-28" placeholder="الكمية الفعلية"
              value={drafts[p.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && save(p.id)}
            />
            <Button size="icon" onClick={() => save(p.id)} disabled={saving === p.id || !drafts[p.id]} aria-label="حفظ">
              {saving === p.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            </Button>
          </div>
        ))}
        {list.length === 0 && <p className="p-8 text-center text-muted-foreground">أضف أصنافاً من شاشة المخزون أولاً</p>}
      </div>
    </AppShell>
  );
}
