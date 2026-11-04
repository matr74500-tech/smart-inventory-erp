import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useInventory } from "@/hooks/use-inventory";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/transfers")({
  head: () => ({
    meta: [
      { title: "التحويلات المخزنية | سهيل سوفت" },
      { name: "description", content: "حوّل الكميات بين المستودعات مع تحديث فوري." },
      { property: "og:title", content: "التحويلات المخزنية | سهيل سوفت" },
      { property: "og:description", content: "تحويل الأصناف بين المستودعات." },
    ],
  }),
  component: TransfersPage,
});

function TransfersPage() {
  const { products, warehouses, qty } = useInventory();
  const [product, setProduct] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("transfer_stock", { _product: product, _from: from, _to: to, _qty: Number(amount) });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("تم التحويل");
    setAmount("");
  }

  return (
    <AppShell title="التحويلات المخزنية" roles={["storekeeper"]}>
      <form onSubmit={submit} className="rounded-xl bg-card shadow-card p-6 grid gap-4 max-w-xl">
        <div className="space-y-1">
          <Label>الصنف</Label>
          <Select value={product} onValueChange={setProduct}>
            <SelectTrigger><SelectValue placeholder="اختر الصنف" /></SelectTrigger>
            <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div className="space-y-1">
            <Label>من</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger><SelectValue placeholder="المصدر" /></SelectTrigger>
              <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <ArrowLeftRight className="size-5 mb-2.5 text-muted-foreground" />
          <div className="space-y-1">
            <Label>إلى</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger><SelectValue placeholder="الوجهة" /></SelectTrigger>
              <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {product && from && <p className="text-sm text-muted-foreground">المتوفر في المصدر: {qty(product, from)}</p>}
        <div className="space-y-1"><Label>الكمية</Label><Input type="number" min="0.01" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
        <Button type="submit" disabled={busy || !product || !from || !to}>{busy && <Loader2 className="size-4 animate-spin" />} تنفيذ التحويل</Button>
      </form>
    </AppShell>
  );
}
