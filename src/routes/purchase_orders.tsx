import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { useInventory, type Product } from "@/hooks/use-inventory";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { enqueueRpc } from "@/lib/offline/rpc-queue";

export const Route = createFileRoute("/purchase_orders")({
  head: () => ({ meta: [{ title: "أوامر الشراء والنواقص | نظام المخزون الذكي" }] }),
  component: PurchaseOrdersPage,
});

type Supplier = Tables<"suppliers">;
type PurchaseOrder = Tables<"purchase_orders">;
type PurchaseOrderItem = Tables<"purchase_order_items">;
type OrderLine = { product: Product; quantity: string; unitCost: string };

function PurchaseOrdersPage() {
  const { canAction } = useAuth();
  const { products, warehouses } = useInventory();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [productToAdd, setProductToAdd] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const generatedRef = useRef(false);

  const loadAll = useCallback(async () => {
    const [supplierResult, orderResult, itemResult] = await Promise.all([
      supabase.from("suppliers").select("*").eq("active", true).order("name"),
      supabase.from("purchase_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("purchase_order_items").select("*"),
    ]);
    if (supplierResult.error) toast.error(`تعذر تحميل الموردين: ${supplierResult.error.message}`);
    else setSuppliers(supplierResult.data ?? []);
    if (orderResult.error) toast.error(`تعذر تحميل أوامر الشراء: ${orderResult.error.message}`);
    else setOrders(orderResult.data ?? []);
    if (itemResult.error) toast.error(`تعذر تحميل تفاصيل الأوامر: ${itemResult.error.message}`);
    else setOrderItems(itemResult.data ?? []);
  }, []);

  useEffect(() => {
    void loadAll();
    const channel = supabase
      .channel("purchase-order-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "purchase_orders" },
        () => void loadAll(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadAll]);

  const runGeneration = useCallback(
    async (silent = false) => {
      if (!canAction("purchase_orders.manage")) return;
      setGenBusy(true);
      try {
        const { data, error } = await supabase.rpc("generate_purchase_orders");
        if (error) {
          if (!silent) toast.error(`تعذر توليد أوامر الشراء: ${error.message}`);
          return;
        }
        const res = (data ?? {}) as { drafts?: number; submitted?: number };
        const drafts = res.drafts ?? 0;
        const submitted = res.submitted ?? 0;
        if (drafts > 0 || submitted > 0) {
          toast.success(`تم توليد ${drafts} طلب شراء وإرسال ${submitted} تلقائيًا للموردين`);
          await loadAll();
        }
      } catch (error) {
        if (!silent)
          toast.error(
            `تعذر الاتصال لتوليد أوامر الشراء: ${error instanceof Error ? error.message : String(error)}`,
          );
      } finally {
        setGenBusy(false);
      }
    },
    [canAction, loadAll],
  );

  // توليد تلقائي عند فتح الصفحة (مرة واحدة) — idempotent فلا يُكرّر الطلبات المفتوحة
  useEffect(() => {
    if (generatedRef.current || !canAction("purchase_orders.manage")) return;
    generatedRef.current = true;
    void runGeneration(true);
  }, [canAction, runGeneration]);

  function addProduct() {
    const product = products.find((item) => item.id === productToAdd);
    if (!product) return;
    setLines((items) =>
      items.some((item) => item.product.id === product.id)
        ? items
        : [...items, { product, quantity: "1", unitCost: String(product.cost) }],
    );
    setProductToAdd("");
  }

  async function saveDraft(): Promise<string | null> {
    if (
      !supplierId?.trim() ||
      !warehouseId?.trim() ||
      warehouseId === "undefined" ||
      warehouseId === "null" ||
      !lines.length
    ) {
      toast.error("اختر المورد والمستودع وأضف صنفاً واحداً على الأقل");
      return null;
    }
    const items = lines.map((line) => ({
      product_id: line.product.id,
      quantity: Number(line.quantity),
      unit_cost: Number(line.unitCost),
    }));
    if (
      items.some(
        (item) =>
          !Number.isFinite(item.quantity) ||
          item.quantity <= 0 ||
          !Number.isFinite(item.unit_cost) ||
          item.unit_cost < 0,
      )
    ) {
      toast.error("تحقق من الكميات والتكاليف المدخلة");
      return null;
    }
    const operationId = draftId ?? crypto.randomUUID();
    const safeSupplierId = supplierId?.trim() || "";
    const safeWarehouseId = warehouseId?.trim() || "";
    const args = {
      _id: operationId,
      _supplier_id: safeSupplierId,
      _warehouse: safeWarehouseId,
      _notes: notes.trim() || "",
      _items: items,
    };
    if (!navigator.onLine) {
      await enqueueRpc({ id: operationId, name: "save_purchase_order_draft_offline", args });
      setDraftId(operationId);
      toast.success("تم حفظ أمر الشراء محليًا وستتم مزامنته عند عودة الاتصال");
      return operationId;
    }
    const { data, error } = await supabase.rpc("save_purchase_order_draft", args);
    if (error) {
      if (/network|fetch|offline|failed/i.test(error.message)) {
        await enqueueRpc({ id: operationId, name: "save_purchase_order_draft_offline", args });
        setDraftId(operationId);
        toast.success("تعذر الاتصال؛ حُفظ أمر الشراء محليًا للمزامنة");
        return operationId;
      }
      toast.error(`تعذر حفظ أمر الشراء: ${error.message}`);
      return null;
    }
    setDraftId(data);
    return data;
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const id = await saveDraft();
      if (id) toast.success("تم حفظ الأمر كمسودة");
    } finally {
      setBusy(false);
    }
  }

  async function submitOrder() {
    setBusy(true);
    try {
      const id = await saveDraft();
      if (!id) return;
      const { error } = await supabase.rpc("submit_purchase_order", { _id: id });
      if (error) {
        toast.error(`حُفظ الأمر كمسودة، لكن تعذر إرساله: ${error.message}`);
        return;
      }
      toast.success("تم إرسال أمر الشراء للمورد");
      setDraftId(null);
      setLines([]);
      setNotes("");
    } finally {
      setBusy(false);
    }
  }

  async function receiveOrder(id: string) {
    if (!canAction("purchases.post") || !canAction("purchase_orders.manage")) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("receive_purchase_order", { _id: id });
      if (error) {
        toast.error(`تعذر استلام الأمر: ${error.message}`);
        return;
      }
      toast.success("تم استلام الطلب وإنشاء فاتورة الشراء وتحديث المخزون");
    } finally {
      setBusy(false);
    }
  }

  async function loadDraft(order: PurchaseOrder) {
    const savedItems = orderItems.filter((item) => item.order_id === order.id);
    if (!savedItems.length) {
      toast.error("لا توجد أصناف محفوظة في هذا الأمر");
      return;
    }
    const restored: OrderLine[] = [];
    for (const item of savedItems) {
      const product = products.find((candidate) => candidate.id === item.product_id);
      if (!product) {
        toast.error(`تعذر استعادة الأمر: الصنف ${item.product_id} غير متاح بصلاحياتك`);
        return;
      }
      restored.push({ product, quantity: String(item.quantity), unitCost: String(item.unit_cost) });
    }
    setDraftId(order.id);
    setSupplierId(order.supplier_id);
    setWarehouseId(order.warehouse_id);
    setNotes(order.notes ?? "");
    setLines(restored);
    toast.success(`تم فتح المسودة #${order.number}`);
  }

  const statusLabels: Record<string, string> = {
    draft: "مسودة",
    ordered: "مرسل للمورد",
    received: "مستلم",
    cancelled: "ملغي",
  };

  return (
    <AppShell title="أوامر الشراء والنواقص">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-4 shadow-card">
          <div className="flex-1">
            <div className="font-bold">التوريد التلقائي</div>
            <p className="text-xs text-muted-foreground">
              توليد طلبات شراء تلقائية لكل مورد حسب الأصناف التي بلغت حد الطلب، ثم إرسالها تلقائيًا
              أو إبقاؤها كمسودة للمراجعة حسب طريقة كل مورد.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void runGeneration(false)}
            disabled={genBusy || !canAction("purchase_orders.manage")}
          >
            {genBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}{" "}
            توليد طلبات الشراء
          </Button>
        </div>
        <form onSubmit={handleSave} className="rounded-xl bg-card p-5 shadow-card space-y-4">
          <h2 className="font-bold">{draftId ? "تعديل مسودة أمر الشراء" : "إنشاء أمر شراء"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>المورد</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المورد" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>المستودع المستلم</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المستودع" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={productToAdd} onValueChange={setProductToAdd}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="اختر صنفاً لإضافته" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" onClick={addProduct} disabled={!productToAdd}>
              <Plus className="size-4 ml-1" /> إضافة صنف
            </Button>
          </div>
          <div className="divide-y rounded-lg border">
            {lines.map((line, index) => (
              <div
                key={line.product.id}
                className="grid items-center gap-2 p-3 sm:grid-cols-[1fr_130px_150px_auto]"
              >
                <strong>{line.product.name}</strong>
                <Input
                  aria-label={`كمية ${line.product.name}`}
                  type="number"
                  min="0.01"
                  step="any"
                  value={line.quantity}
                  onChange={(event) =>
                    setLines((items) =>
                      items.map((item, row) =>
                        row === index ? { ...item, quantity: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  aria-label={`تكلفة ${line.product.name}`}
                  type="number"
                  min="0"
                  step="any"
                  value={line.unitCost}
                  onChange={(event) =>
                    setLines((items) =>
                      items.map((item, row) =>
                        row === index ? { ...item, unitCost: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="حذف الصنف"
                  onClick={() => setLines((items) => items.filter((_, row) => row !== index))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
            {!lines.length && (
              <p className="p-5 text-center text-sm text-muted-foreground">
                أضف الأصناف الناقصة إلى الأمر.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="purchase-order-notes">ملاحظات</Label>
            <Input
              id="purchase-order-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="outline"
              disabled={busy || !canAction("purchase_orders.manage")}
            >
              حفظ كمسودة
            </Button>
            <Button
              type="button"
              onClick={submitOrder}
              disabled={busy || !canAction("purchase_orders.manage")}
            >
              {busy ? "جارٍ الحفظ…" : "حفظ وإرسال للمورد"}
            </Button>
            {draftId && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraftId(null);
                  setLines([]);
                  setNotes("");
                }}
              >
                إلغاء المسودة الحالية
              </Button>
            )}
          </div>
        </form>

        <section className="rounded-xl bg-card shadow-card">
          <h2 className="border-b p-4 font-bold">متابعة أوامر الشراء</h2>
          <div className="divide-y">
            {orders.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <strong>أمر #{order.number}</strong>
                <span className="flex-1">
                  {suppliers.find((supplier) => supplier.id === order.supplier_id)?.name ?? "مورد"}
                </span>
                <span>
                  {warehouses.find((warehouse) => warehouse.id === order.warehouse_id)?.name ??
                    "مستودع"}
                </span>
                <span className="rounded-full bg-muted px-3 py-1">
                  {statusLabels[order.status] ?? order.status}
                </span>
                {order.status === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!products.length}
                    onClick={() => void loadDraft(order)}
                  >
                    فتح المسودة
                  </Button>
                )}
                {order.status === "ordered" && (
                  <Button
                    size="sm"
                    disabled={
                      busy || !canAction("purchase_orders.manage") || !canAction("purchases.post")
                    }
                    onClick={() => void receiveOrder(order.id)}
                  >
                    استلام وإضافة للمخزون
                  </Button>
                )}
                <div className="basis-full text-xs text-muted-foreground">
                  {orderItems
                    .filter((item) => item.order_id === order.id)
                    .map(
                      (item) =>
                        `${products.find((product) => product.id === item.product_id)?.name ?? "صنف"} × ${Number(item.quantity)} (تكلفة ${Number(item.unit_cost)})`,
                    )
                    .join(" · ")}
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <p className="p-8 text-center text-muted-foreground">لا توجد أوامر شراء حتى الآن.</p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
