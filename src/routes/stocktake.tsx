import { useAuth } from "@/lib/auth";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory } from "@/hooks/use-inventory";
import { countDiff } from "@/lib/inventory-utils";
import { matchesSearch } from "@/lib/arabic";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { enqueueRpc, isTransientNetworkError } from "@/lib/offline/rpc-queue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/stocktake")({
  head: () => ({
    meta: [
      { title: "الجرد والإدخال الأولي | نظام المخزون الذكي" },
      { name: "description", content: "أدخل الكميات الأولية أو نتائج الجرد الفعلي لكل مستودع." },
      { property: "og:title", content: "الجرد والإدخال الأولي | نظام المخزون الذكي" },
      { property: "og:description", content: "جرد المخزون وتحديث الكميات فوراً." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StocktakePage,
});

function StocktakePage() {
  const { canAction, canField } = useAuth();
  const { products, warehouses, qty } = useInventory();
  const [wh, setWh] = useState<string>("");
  const [kind, setKind] = useState<"initial" | "count">("count");
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const warehouse = wh || warehouses[0]?.id || "";
  const list = useMemo(
    () => products.filter((p) => matchesSearch([p.name, p.barcode], q)),
    [products, q],
  );

  async function save(productId: string) {
    if (!canAction("stocktake.adjust")) return;
    const v = drafts[productId];
    if (v === undefined || v === "") return;
    setSaving(productId);
    const operationId = crypto.randomUUID();
    const args = {
      _operation_id: operationId,
      _product: productId,
      _warehouse: warehouse,
      _qty: Number(v),
      _kind: kind,
    };
    if (!navigator.onLine) {
      await enqueueRpc({ id: operationId, name: "set_stock_offline", args });
      setSaving(null);
      setDrafts((d) => {
        const n = { ...d };
        delete n[productId];
        return n;
      });
      toast.success("تم حفظ تسوية الجرد محليًا للمزامنة");
      return;
    }
    let error: { message: string } | null = null;
    try {
      ({ error } = await supabase.rpc("set_stock_offline", args));
    } catch (networkError) {
      if (isTransientNetworkError(networkError)) {
        await enqueueRpc({ id: operationId, name: "set_stock_offline", args });
        setSaving(null);
        setDrafts((d) => {
          const n = { ...d };
          delete n[productId];
          return n;
        });
        toast.success("انقطع الاتصال؛ حُفظت تسوية الجرد محليًا");
        return;
      }
      setSaving(null);
      toast.error(networkError instanceof Error ? networkError.message : "تعذر حفظ الجرد");
      return;
    }
    setSaving(null);
    if (error) {
      if (/network|fetch|offline|failed/i.test(error.message)) {
        await enqueueRpc({ id: operationId, name: "set_stock_offline", args });
        setDrafts((d) => {
          const n = { ...d };
          delete n[productId];
          return n;
        });
        toast.success("تعذر الاتصال؛ حُفظت تسوية الجرد محليًا");
        return;
      }
      toast.error(error.message);
      return;
    }
    setDrafts((d) => {
      const n = { ...d };
      delete n[productId];
      return n;
    });
    toast.success("تم تحديث الكمية");
  }

  const pending = Object.entries(drafts).filter(([, v]) => v !== "");
  async function approveAll() {
    if (!canAction("stocktake.adjust")) return;
    if (!pending.length || !confirm(`اعتماد الجرد وتسوية ${pending.length} صنف؟`)) return;
    setSaving("all");
    const operationId = crypto.randomUUID();
    const args = {
      _operation_id: operationId,
      _warehouse: warehouse,
      _kind: kind,
      _items: pending.map(([product_id, quantity]) => ({ product_id, quantity: Number(quantity) })),
    };
    if (!navigator.onLine) {
      await enqueueRpc({ id: operationId, name: "set_stock_batch_offline", args });
    } else {
      let error: { message: string } | null = null;
      try {
        ({ error } = await supabase.rpc("set_stock_batch_offline", args));
      } catch (networkError) {
        if (isTransientNetworkError(networkError)) {
          await enqueueRpc({ id: operationId, name: "set_stock_batch_offline", args });
        } else {
          toast.error(networkError instanceof Error ? networkError.message : "تعذر اعتماد الجرد");
          setSaving(null);
          return;
        }
      }
      if (error) {
        if (/network|fetch|offline|failed/i.test(error.message)) {
          await enqueueRpc({ id: operationId, name: "set_stock_batch_offline", args });
        } else {
          toast.error(error.message);
          setSaving(null);
          return;
        }
      }
    }
    setSaving(null);
    setDrafts({});
    toast.success("تم اعتماد الجرد أو حفظه للمزامنة");
  }

  if (!canField("quantity"))
    return (
      <AppShell title="الجرد">
        <p>عرض هذه الشاشة يحتاج صلاحية الكميات.</p>
      </AppShell>
    );

  return (
    <AppShell title="الجرد والإدخال الأولي" roles={["storekeeper"]}>
      <div className="flex flex-wrap gap-2 mb-5">
        <Select value={warehouse} onValueChange={setWh}>
          <SelectTrigger className="w-48 bg-card">
            <SelectValue placeholder="المستودع" />
          </SelectTrigger>
          <SelectContent>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={kind} onValueChange={(v) => setKind(v as "initial" | "count")}>
          <SelectTrigger className="w-40 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="count">جرد فعلي</SelectItem>
            <SelectItem value="initial">إدخال أولي</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pr-10 bg-card"
            placeholder="بحث…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <BarcodeScanner onDetected={setQ} />
        <Button
          onClick={approveAll}
          disabled={
            !canAction("stocktake.adjust") ||
            !canField("quantity") ||
            !pending.length ||
            saving === "all"
          }
        >
          {saving === "all" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}{" "}
          اعتماد الجرد ({pending.length})
        </Button>
      </div>
      <div className="rounded-xl bg-card shadow-card divide-y">
        {list.map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                الرصيد الدفتري: {qty(p.id, warehouse)} {p.unit}
              </div>
              {drafts[p.id] !== undefined &&
                drafts[p.id] !== "" &&
                (() => {
                  const d = countDiff(qty(p.id, warehouse), Number(drafts[p.id]));
                  return (
                    <div
                      className={`text-xs font-semibold ${d.diff > 0 ? "text-success" : d.diff < 0 ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {d.label}
                      {d.diff ? ` ${Math.abs(d.diff)}` : ""}
                    </div>
                  );
                })()}
            </div>
            <Input
              type="number"
              min="0"
              className="w-28"
              placeholder="الكمية الفعلية"
              value={drafts[p.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && save(p.id)}
            />
            <Button
              size="icon"
              onClick={() => save(p.id)}
              disabled={
                !canAction("stocktake.adjust") ||
                !canField("quantity") ||
                saving === p.id ||
                !drafts[p.id]
              }
              aria-label="حفظ"
            >
              {saving === p.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
            </Button>
          </div>
        ))}
        {list.length === 0 && (
          <p className="p-8 text-center text-muted-foreground">أضف أصنافاً من شاشة المخزون أولاً</p>
        )}
      </div>
    </AppShell>
  );
}
