import { useAuth } from "@/lib/auth";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, Minus, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory } from "@/hooks/use-inventory";
import { countDiff, findByCode } from "@/lib/inventory-utils";
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
  const [scannedId, setScannedId] = useState<string | null>(null);
  const scannedRef = useRef<string | null>(null);
  const quantityRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const warehouse = wh || warehouses[0]?.id || "";
  const list = useMemo(
    () => products.filter((p) => matchesSearch([p.name, p.barcode], q)),
    [products, q],
  );
  const scannedProduct = scannedId ? products.find((p) => p.id === scannedId) : undefined;

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
        setSaving(null);
        setDrafts({});
        toast.success("تم اعتماد الجرد أو حفظه للمزامنة");
        return;
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
    setScannedId(null);
    scannedRef.current = null;
    toast.success("تم اعتماد الجرد أو حفظه للمزامنة");
  }

  function handleDetected(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;
    const found = findByCode(products, code);
    if (!found) {
      toast.error("الصنف غير موجود — أضفه من شاشة الأصناف أولاً");
      scannedRef.current = null;
      return;
    }
    const isRepeat = scannedRef.current === code;
    setScannedId(found.id);
    scannedRef.current = code;
    setDrafts((d) => {
      const current = d[found.id];
      let next: string;
      if (isRepeat && current !== undefined && current !== "") {
        next = String((Number(current) || 0) + 1);
      } else if (current === undefined || current === "") {
        next = "1";
      } else {
        next = current;
      }
      return { ...d, [found.id]: next };
    });
    requestAnimationFrame(() => quantityRefs.current[found.id]?.focus());
  }

  function bump(productId: string, delta: number) {
    setDrafts((d) => {
      const next = Math.max(0, (Number(d[productId] || 0) || 0) + delta);
      return { ...d, [productId]: String(next) };
    });
  }

  function clearDraft(productId: string) {
    setDrafts((d) => {
      const n = { ...d };
      delete n[productId];
      return n;
    });
  }

  function focusRow(index: number) {
    const target = list[index];
    if (target) quantityRefs.current[target.id]?.focus();
  }

  function onQtyKeyDown(e: KeyboardEvent<HTMLInputElement>, index: number, productId: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      void save(productId);
      focusRow(index + 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(index + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusRow(index - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      clearDraft(productId);
    }
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
          <SelectTrigger className="w-48 bg-card" aria-label="اختر المستودع">
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
        <BarcodeScanner onDetected={handleDetected} />
        <Button
          variant="outline"
          onClick={() => {
            setDrafts({});
            setScannedId(null);
            scannedRef.current = null;
          }}
          disabled={!pending.length}
        >
          <X className="size-4" /> مسح الكميات
        </Button>
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

      {scannedProduct && (
        <div className="mb-4 rounded-xl border-2 border-primary bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold">{scannedProduct.name}</div>
              <div className="text-xs text-muted-foreground" dir="ltr">
                {scannedProduct.barcode ?? scannedProduct.custom_barcode ?? scannedProduct.code}
              </div>
              <div className="text-xs text-muted-foreground">
                الرصيد الدفتري: {qty(scannedProduct.id, warehouse)} {scannedProduct.unit}
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="إغلاق"
              onClick={() => {
                setScannedId(null);
                scannedRef.current = null;
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="إنقاص"
              onClick={() => bump(scannedProduct.id, -1)}
            >
              <Minus className="size-4" />
            </Button>
            <Input
              ref={(el) => {
                quantityRefs.current[scannedProduct.id] = el;
              }}
              type="number"
              min="0"
              inputMode="numeric"
              className="h-14 flex-1 text-center text-2xl font-bold"
              aria-label="الكمية الفعلية"
              placeholder="الكمية"
              value={drafts[scannedProduct.id] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [scannedProduct.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save(scannedProduct.id);
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="زيادة"
              onClick={() => bump(scannedProduct.id, 1)}
            >
              <Plus className="size-4" />
            </Button>
            <Button
              type="button"
              onClick={() => save(scannedProduct.id)}
              disabled={
                !canAction("stocktake.adjust") ||
                saving === scannedProduct.id ||
                !drafts[scannedProduct.id]
              }
            >
              {saving === scannedProduct.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}{" "}
              حفظ
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            امسح الباركود مرة أخرى لزيادة الكمية تلقائياً. استخدم ↑ ↓ للتنقل و Enter للحفظ.
          </p>
        </div>
      )}

      <div className="rounded-xl bg-card shadow-card divide-y">
        {list.map((p, index) => (
          <div
            key={p.id}
            className={`flex items-center gap-3 p-3 ${p.id === scannedId ? "bg-primary/5" : ""}`}
          >
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
            <div className="relative">
              <Input
                ref={(el) => {
                  quantityRefs.current[p.id] = el;
                }}
                type="number"
                min="0"
                inputMode="numeric"
                className="w-28 pl-8"
                placeholder="الكمية الفعلية"
                value={drafts[p.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                onKeyDown={(e) => onQtyKeyDown(e, index, p.id)}
              />
              {drafts[p.id] !== undefined && drafts[p.id] !== "" && (
                <button
                  type="button"
                  aria-label="مسح الكمية"
                  className="absolute left-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => clearDraft(p.id)}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
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
