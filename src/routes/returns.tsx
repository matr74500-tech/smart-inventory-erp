import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Search,
  RotateCcw,
  Loader2,
  CheckCircle2,
  PackageCheck,
  PackageX,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory } from "@/hooks/use-inventory";
import { findByCode } from "@/lib/inventory-utils";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { enqueueRpc, isTransientNetworkError } from "@/lib/offline/rpc-queue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/returns")({
  head: () => ({
    meta: [
      { title: "المرتجعات والمردودات | نظام المخزون الذكي" },
      {
        name: "description",
        content:
          "إدارة مرتجعات المبيعات وتصنيف حالتها ومصيرها، وتحديث المخزون وحسابات العملاء وإنشاء مردودات الموردين.",
      },
    ],
  }),
  component: ReturnsPage,
});

type Invoice = Tables<"sales_invoices">;
type SalesReturn = Tables<"sales_returns">;
type SupplierReturn = Tables<"supplier_returns">;

type Condition = "intact" | "damaged" | "other";
type Disposition = "restock" | "scrap" | "supplier_return";
type RefundKind = "cash" | "credit";

type ReturnLine = {
  salesItemId: string;
  productId: string;
  name: string;
  soldQty: number;
  unitPrice: number;
  returnQty: string;
  condition: Condition;
  disposition: Disposition;
};

const CONDITION_LABELS: Record<Condition, string> = {
  intact: "سليم",
  damaged: "تالف",
  other: "غير ذلك",
};
const DISPOSITION_LABELS: Record<Disposition, string> = {
  restock: "إعادة للمخزون",
  scrap: "إتلاف",
  supplier_return: "إرجاع للمورد",
};

function fmtDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}

function ReturnsPage() {
  const { canAction } = useAuth();
  const { products, warehouses } = useInventory();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [refundKind, setRefundKind] = useState<RefundKind>("cash");
  const [notes, setNotes] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturn[]>([]);
  const [supplierNames, setSupplierNames] = useState<Map<string, string>>(new Map());

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const scannedRef = useRef<string | null>(null);

  const refreshInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    const { data, error } = await supabase
      .from("sales_invoices")
      .select("*")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(60);
    if (error) toast.error(`تعذر تحميل الفواتير: ${error.message}`);
    else setInvoices(data ?? []);
    setLoadingInvoices(false);
  }, []);

  const refreshReturns = useCallback(async () => {
    const { data, error } = await supabase
      .from("sales_returns")
      .select("*")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(50);
    if (!error) setReturns(data ?? []);

    const { data: sr, error: srErr } = await supabase
      .from("supplier_returns")
      .select("*")
      .eq("status", "posted")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!srErr) setSupplierReturns(sr ?? []);

    const { data: sup, error: supErr } = await supabase.from("suppliers").select("id, name");
    if (!supErr) setSupplierNames(new Map((sup ?? []).map((s) => [s.id, s.name])));
  }, []);

  useEffect(() => {
    void refreshInvoices();
    void refreshReturns();
  }, [refreshInvoices, refreshReturns]);

  useEffect(() => {
    if (!selected) {
      setLines([]);
      return;
    }
    let active = true;
    const loadItems = async () => {
      const { data, error } = await supabase
        .from("sales_items")
        .select("*")
        .eq("invoice_id", selected.id);
      if (!active) return;
      if (error) {
        toast.error(`تعذر تحميل أصناف الفاتورة: ${error.message}`);
        return;
      }
      const built: ReturnLine[] = (data ?? []).map((line) => ({
        salesItemId: line.id,
        productId: line.product_id,
        name: productMap.get(line.product_id)?.name ?? line.product_id,
        soldQty: Number(line.quantity),
        unitPrice: Number(line.unit_price_yer),
        returnQty: "",
        condition: "intact",
        disposition: "restock",
      }));
      setLines(built);
    };
    void loadItems();
    return () => {
      active = false;
    };
  }, [selected, productMap]);

  const filteredInvoices = useMemo(() => {
    const term = q.trim();
    if (!term) return invoices;
    return invoices.filter((inv) => {
      const hay = `${inv.number} ${inv.customer_name ?? ""}`.toLowerCase();
      return hay.includes(term.toLowerCase());
    });
  }, [invoices, q]);

  const updateLine = (salesItemId: string, patch: Partial<ReturnLine>) => {
    setLines((prev) => prev.map((l) => (l.salesItemId === salesItemId ? { ...l, ...patch } : l)));
  };

  function handleDetected(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;
    if (!selected) {
      toast.error("اختر فاتورة أولاً قبل مسح الباركود");
      return;
    }
    const found = findByCode(products, code);
    if (!found) {
      toast.error("الصنف غير موجود");
      return;
    }
    const line = lines.find((l) => l.productId === found.id);
    if (!line) {
      toast.error("هذا الصنف غير موجود في الفاتورة المختارة");
      return;
    }
    const isRepeat = scannedRef.current === code;
    scannedRef.current = code;
    if (isRepeat && Number(line.returnQty) > 0) {
      updateLine(line.salesItemId, { returnQty: String(Number(line.returnQty) + 1) });
    } else {
      updateLine(line.salesItemId, { returnQty: "1" });
    }
  }

  const includedLines = lines.filter((l) => Number(l.returnQty) > 0);
  const total = includedLines.reduce((sum, l) => sum + Number(l.returnQty) * l.unitPrice, 0);
  const overReturn = includedLines.some((l) => Number(l.returnQty) > l.soldQty);

  const selectInvoice = (inv: Invoice) => {
    setSelected(inv);
    setNotes("");
    setRefundKind("cash");
    setLines([]);
  };

  const submit = async () => {
    if (!canAction("returns.manage")) {
      toast.error("ليس لديك صلاحية اعتماد المرتجعات");
      return;
    }
    if (!selected) {
      toast.error("اختر فاتورة أولاً");
      return;
    }
    if (!includedLines.length) {
      toast.error("أدخل كمية مرتجعة لصنف واحد على الأقل");
      return;
    }
    if (overReturn) {
      toast.error("كمية المرتجع أكبر من الكمية المباعة");
      return;
    }
    if (refundKind === "credit" && !selected.customer_id) {
      toast.error("هذه الفاتورة بلا عميل؛ اختر الرد النقدي");
      return;
    }

    const operationId = crypto.randomUUID();
    const args = {
      _operation_id: operationId,
      _invoice_id: selected.id,
      _customer_id: selected.customer_id ?? null,
      _customer_name: selected.customer_name ?? null,
      _warehouse: selected.warehouse_id,
      _currency_code: selected.currency_code,
      _rate_to_yer: Number(selected.exchange_rate_to_yer) || 1,
      _refund_kind: refundKind,
      _payment_method: "نقدي",
      _notes: notes.trim() ? notes.trim() : null,
      _items: includedLines.map((l) => ({
        product_id: l.productId,
        quantity: Number(l.returnQty),
        unit_price_yer: l.unitPrice,
        condition: l.condition,
        disposition: l.disposition,
      })),
    };

    setBusy(true);
    try {
      if (!navigator.onLine) {
        await enqueueRpc({ id: operationId, name: "post_return_offline", args });
        toast.success("تم حفظ المرتجع محليًا وستتم مزامنته عند عودة الاتصال");
        resetBuilder();
        return;
      }
      const { error } = await supabase.rpc("post_return", args);
      if (error) {
        if (/network|fetch|offline|failed/i.test(error.message)) {
          await enqueueRpc({ id: operationId, name: "post_return_offline", args });
          toast.success("تعذر الاتصال؛ حُفظ المرتجع للمزامنة");
          resetBuilder();
          return;
        }
        toast.error(`تعذر اعتماد المرتجع: ${error.message}`);
        return;
      }
      toast.success("تم اعتماد المرتجع وتحديث المخزون والحسابات");
      resetBuilder();
      void refreshReturns();
      void refreshInvoices();
    } catch (error) {
      if (isTransientNetworkError(error)) {
        await enqueueRpc({ id: operationId, name: "post_return_offline", args });
        toast.success("انقطع الاتصال؛ حُفظ المرتجع للمزامنة");
        resetBuilder();
        return;
      }
      toast.error(
        `تعذر الاتصال لاعتماد المرتجع: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const resetBuilder = () => {
    setSelected(null);
    setLines([]);
    setNotes("");
    setRefundKind("cash");
  };

  return (
    <AppShell title="المرتجعات والمردودات">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-56">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث برقم الفاتورة أو اسم العميل"
              className="pr-9"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {warehouses.length ? `المخازن: ${warehouses.length}` : ""}
          </span>
        </div>
        <BarcodeScanner onDetected={handleDetected} />

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl bg-card shadow-card">
            <div className="flex items-center gap-2 p-4 border-b font-bold">
              <RotateCcw className="size-5 text-primary" /> فواتير البيع
              <span className="mr-auto rounded-full bg-muted px-2 text-sm">
                {filteredInvoices.length}
              </span>
            </div>
            <div className="divide-y max-h-[60vh] overflow-y-auto">
              {loadingInvoices && (
                <div className="p-6 text-center text-sm text-muted-foreground">جارٍ التحميل...</div>
              )}
              {filteredInvoices.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => selectInvoice(inv)}
                  className={`flex w-full items-center justify-between gap-2 p-3 text-right text-sm hover:bg-accent ${
                    selected?.id === inv.id ? "bg-accent" : ""
                  }`}
                >
                  <span>
                    <span className="font-semibold">#{inv.number}</span>{" "}
                    <span className="text-muted-foreground">
                      — {inv.customer_name ?? "عميل نقدي"}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {fmtDate(inv.posted_at)} · {Number(inv.total_yer).toLocaleString("ar")}{" "}
                    {inv.currency_code}
                  </span>
                </button>
              ))}
              {!loadingInvoices && !filteredInvoices.length && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  لا توجد فواتير معتمدة
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-card shadow-card p-4">
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold">مرتجع الفاتورة #{selected.number}</div>
                    <div className="text-xs text-muted-foreground">
                      {selected.customer_name ?? "عميل نقدي"} ·{" "}
                      {Number(selected.total_yer).toLocaleString("ar")} {selected.currency_code}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={resetBuilder}>
                    إلغاء
                  </Button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-muted-foreground border-b">
                        <th className="p-2">الصنف</th>
                        <th className="p-2">المباع</th>
                        <th className="p-2">المرتجع</th>
                        <th className="p-2">الحالة</th>
                        <th className="p-2">المصير</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.salesItemId} className="border-b last:border-0">
                          <td className="p-2">
                            <div className="max-w-40 truncate">{l.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {l.unitPrice.toLocaleString("ar")} / وحدة
                            </div>
                          </td>
                          <td className="p-2">{l.soldQty}</td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min={0}
                              max={l.soldQty}
                              value={l.returnQty}
                              onChange={(e) =>
                                updateLine(l.salesItemId, { returnQty: e.target.value })
                              }
                              className="w-20"
                            />
                          </td>
                          <td className="p-2">
                            <Select
                              value={l.condition}
                              onValueChange={(v) =>
                                updateLine(l.salesItemId, { condition: v as Condition })
                              }
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(CONDITION_LABELS) as Condition[]).map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {CONDITION_LABELS[c]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <Select
                              value={l.disposition}
                              onValueChange={(v) =>
                                updateLine(l.salesItemId, { disposition: v as Disposition })
                              }
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(DISPOSITION_LABELS) as Disposition[]).map((d) => (
                                  <SelectItem key={d} value={d}>
                                    {DISPOSITION_LABELS[d]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                      {!lines.length && (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-muted-foreground">
                            لا توجد أصناف في هذه الفاتورة
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">طريقة الرد</div>
                    <Select
                      value={refundKind}
                      onValueChange={(v) => setRefundKind(v as RefundKind)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">نقدًا (من الصندوق)</SelectItem>
                        <SelectItem value="credit" disabled={!selected.customer_id}>
                          آجلًا (إلى حساب العميل)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-40">
                    <div className="text-xs text-muted-foreground mb-1">ملاحظات</div>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="سبب الإرجاع / ملاحظات"
                    />
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">الإجمالي: </span>
                    <span className="font-bold">
                      {total.toLocaleString("ar")} {selected.currency_code}
                    </span>
                  </div>
                </div>

                {overReturn && (
                  <p className="text-xs text-destructive">
                    كمية المرتجع أكبر من الكمية المباعة لأحد الأصناف
                  </p>
                )}

                <Button onClick={submit} disabled={busy} className="w-full">
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}{" "}
                  اعتماد المرتجع
                </Button>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                اختر فاتورة معتمدة من القائمة لإرجاع أصناف منها
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-card shadow-card">
          <div className="flex items-center gap-2 p-4 border-b font-bold">
            <PackageCheck className="size-5 text-primary" /> سجل المرتجعات
            <span className="mr-auto rounded-full bg-muted px-2 text-sm">{returns.length}</span>
          </div>
          <div className="divide-y max-h-[50vh] overflow-y-auto">
            {returns.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>
                  <span className="font-semibold">#{r.number}</span>{" "}
                  <span className="text-muted-foreground">— {r.customer_name ?? "عميل نقدي"}</span>
                </span>
                <span className="text-muted-foreground">{fmtDate(r.posted_at)}</span>
                <span>
                  {r.refund_kind === "cash" ? (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <RotateCcw className="size-3" /> رد نقدي
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Truck className="size-3" /> رد إلى الحساب
                    </span>
                  )}
                </span>
                <span className="font-semibold">
                  {Number(r.total_yer).toLocaleString("ar")} {r.currency_code}
                </span>
              </div>
            ))}
            {!returns.length && (
              <div className="p-6 text-center text-sm text-muted-foreground">لا توجد مرتجعات</div>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-card shadow-card">
          <div className="flex items-center gap-2 p-4 border-b font-bold">
            <PackageX className="size-5 text-destructive" /> مردودات الموردين
            <span className="mr-auto rounded-full bg-muted px-2 text-sm">
              {supplierReturns.length}
            </span>
          </div>
          <div className="divide-y max-h-[40vh] overflow-y-auto">
            {supplierReturns.map((sr) => (
              <div
                key={sr.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span>
                  <span className="font-semibold">#{sr.number}</span>{" "}
                  <span className="text-muted-foreground">
                    — {supplierNames.get(sr.supplier_id) ?? "مورد"}
                  </span>
                </span>
                <span className="text-muted-foreground">{fmtDate(sr.created_at)}</span>
                <span className="font-semibold">
                  {Number(sr.total_cost).toLocaleString("ar")} (تكلفة)
                </span>
              </div>
            ))}
            {!supplierReturns.length && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                لا توجد مردودات للموردين — تُنشأ عند اختيار مصير «إرجاع للمورد»
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
