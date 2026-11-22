import { useAuth } from "@/lib/auth";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/transfers")({
  head: () => ({
    meta: [
      { title: "التحويلات المخزنية | نظام المخزون الذكي" },
      { name: "description", content: "حوّل الكميات بين المستودعات مع تحديث فوري." },
      { property: "og:title", content: "التحويلات المخزنية | نظام المخزون الذكي" },
      { property: "og:description", content: "تحويل الأصناف بين المستودعات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransfersPage,
});

function TransfersPage() {
  const { canAction, canField } = useAuth();
  const { products, warehouses, qty, shelfStock } = useInventory();
  const [product, setProduct] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fromShelf, setFromShelf] = useState("");
  const [toShelf, setToShelf] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const assignedAtSource = shelfStock
    .filter((row) => row.product_id === product && row.warehouse_id === from)
    .reduce((sum, row) => sum + Number(row.quantity), 0);
  const availableAtSource = fromShelf.trim()
    ? Number(
        shelfStock.find(
          (row) =>
            row.product_id === product &&
            row.warehouse_id === from &&
            row.shelf === fromShelf.trim(),
        )?.quantity ?? 0,
      )
    : Math.max(0, qty(product, from) - assignedAtSource);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canAction("transfers.post")) return;
    if (!product || !from || !to || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      toast.error("أكمل بيانات الصنف والمستودعات والكمية");
      return;
    }
    if (from === to && fromShelf.trim() === toShelf.trim()) {
      toast.error("اختر رفًا مختلفًا أو مستودعًا مختلفًا");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("transfer_shelf_stock", {
        _product: product,
        _from_wh: from,
        _from_shelf: fromShelf.trim(),
        _to_wh: to,
        _to_shelf: toShelf.trim(),
        _qty: Number(amount),
      });
      if (error) throw error;
      toast.success("تم تحويل الكمية بين الرفوف");
      setAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنفيذ التحويل");
    } finally {
      setBusy(false);
    }
  }

  if (!canField("quantity"))
    return (
      <AppShell title="التحويلات">
        <p>عرض هذه الشاشة يحتاج صلاحية الكميات.</p>
      </AppShell>
    );

  return (
    <AppShell title="التحويلات المخزنية" roles={["storekeeper"]}>
      <form onSubmit={submit} className="rounded-xl bg-card shadow-card p-6 grid gap-4 max-w-xl">
        <p className="text-sm text-muted-foreground">
          يمكنك نقل الكمية بين رفوف المستودع نفسه أو بين مستودعين. اترك الرف فارغًا لاستخدام الكمية
          غير الموزعة على رف.
        </p>
        <div className="space-y-1">
          <Label>الصنف</Label>
          <Select
            value={product}
            onValueChange={(value) => {
              setProduct(value);
              setFromShelf("");
              setToShelf("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="اختر الصنف" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div className="space-y-1">
            <Label>من</Label>
            <Select
              value={from}
              onValueChange={(value) => {
                setFrom(value);
                setFromShelf("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="المصدر" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ArrowLeftRight className="size-5 mb-2.5 text-muted-foreground" />
          <div className="space-y-1">
            <Label>إلى</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue placeholder="الوجهة" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>رف المصدر</Label>
            <Input
              value={fromShelf}
              onChange={(e) => setFromShelf(e.target.value)}
              placeholder="اتركه فارغًا للكمية غير الموزعة"
            />
          </div>
          <div className="space-y-1">
            <Label>رف الوجهة</Label>
            <Input
              value={toShelf}
              onChange={(e) => setToShelf(e.target.value)}
              placeholder="اختياري"
            />
          </div>
        </div>
        {product && from && (
          <p className="text-sm text-muted-foreground">
            المتوفر في المصدر
            {fromShelf.trim() ? ` على رف ${fromShelf.trim()}` : " غير الموزع على الرفوف"}:{" "}
            {availableAtSource}
          </p>
        )}
        <div className="space-y-1">
          <Label>الكمية</Label>
          <Input
            type="number"
            min="0.01"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <Button
          type="submit"
          disabled={
            !canAction("transfers.post") ||
            !canField("quantity") ||
            busy ||
            !product ||
            !from ||
            !to
          }
        >
          {busy && <Loader2 className="size-4 animate-spin" />} تنفيذ التحويل
        </Button>
      </form>
    </AppShell>
  );
}
