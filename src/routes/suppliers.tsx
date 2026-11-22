import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { useInventory } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { enqueueRpc, isTransientNetworkError } from "@/lib/offline/rpc-queue";
import { getPrivateSnapshot, savePrivateSnapshot } from "@/lib/offline/inventory-cache";

export const Route = createFileRoute("/suppliers")({
  head: () => ({ meta: [{ title: "إدارة الموردين | نظام المخزون الذكي" }] }),
  component: SuppliersPage,
});

type Supplier = Tables<"suppliers">;
type ProductSupplier = Tables<"product_suppliers">;

function SuppliersPage() {
  const { products } = useInventory();
  const { canAction, session } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [productSuppliers, setProductSuppliers] = useState<ProductSupplier[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [productId, setProductId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierSku, setSupplierSku] = useState("");
  const [lastCost, setLastCost] = useState("0");
  const [primary, setPrimary] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const userId = session?.user.id;
      if (!navigator.onLine) {
        if (userId) {
          const cached = await getPrivateSnapshot<{
            suppliers: Supplier[];
            mappings: ProductSupplier[];
          }>(userId, "suppliers");
          if (active && cached) {
            setSuppliers(cached.suppliers);
            setProductSuppliers(cached.mappings);
          }
        }
        return;
      }
      const [supplierResult, mappingResult] = await Promise.all([
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("product_suppliers").select("*"),
      ]);
      if (!active) return;
      if (supplierResult.error) toast.error(`تعذر تحميل الموردين: ${supplierResult.error.message}`);
      else setSuppliers(supplierResult.data ?? []);
      if (mappingResult.error)
        toast.error(`تعذر تحميل روابط الموردين بالأصناف: ${mappingResult.error.message}`);
      else setProductSuppliers(mappingResult.data ?? []);
      if (userId && !supplierResult.error && !mappingResult.error)
        await savePrivateSnapshot(userId, "suppliers", {
          suppliers: supplierResult.data ?? [],
          mappings: mappingResult.data ?? [],
        });
    };
    void load();
    const channel = supabase
      .channel("supplier-catalog")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "suppliers" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "product_suppliers" },
        () => void load(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id]);

  async function saveSupplier(event: FormEvent) {
    event.preventDefault();
    const operationId = crypto.randomUUID();
    const stableId = editingId ?? crypto.randomUUID();
    const args = {
      _operation_id: operationId,
      _id: stableId,
      _name: name.trim(),
      _phone: phone.trim(),
      _address: address.trim(),
      _notes: supplierNotes.trim() || null,
    };
    let { error } = await supabase.rpc("save_supplier_offline", args);
    if (error && (error.code === "42883" || error.code === "PGRST202")) {
      const legacy = await supabase.rpc("save_supplier", {
        _id: editingId,
        _name: name.trim(),
        _phone: phone.trim(),
        _address: address.trim(),
        _notes: supplierNotes.trim() || null,
      });
      error = legacy.error;
    }
    if (error && isTransientNetworkError(error)) {
      try {
        await enqueueRpc({ id: operationId, name: "save_supplier_offline", args });
      } catch (queueError) {
        toast.error(queueError instanceof Error ? queueError.message : "تعذر حفظ المورد محليًا");
        return;
      }
      const localSupplier: Supplier = {
        id: stableId,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        notes: supplierNotes.trim() || null,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setSuppliers((items) => [localSupplier, ...items.filter((item) => item.id !== stableId)]);
      if (session?.user.id) {
        const cached = await getPrivateSnapshot<{
          suppliers: Supplier[];
          mappings: ProductSupplier[];
        }>(session.user.id, "suppliers");
        await savePrivateSnapshot(session.user.id, "suppliers", {
          suppliers: [
            localSupplier,
            ...(cached?.suppliers ?? []).filter((item) => item.id !== stableId),
          ],
          mappings: cached?.mappings ?? productSuppliers,
        });
      }
      toast.info("حُفظ المورد على هذا الجهاز وسيُزامن عند عودة الاتصال");
    } else if (error) {
      toast.error(`تعذر حفظ المورد: ${error.message}`);
      return;
    } else {
      toast.success(editingId ? "تم تحديث المورد" : "تمت إضافة المورد");
    }
    setEditingId(null);
    setName("");
    setPhone("");
    setAddress("");
    setSupplierNotes("");
  }

  async function archiveSupplier(supplier: Supplier) {
    if (!window.confirm(`أرشفة المورد "${supplier.name}"؟`)) return;
    const { error } = await supabase.rpc("archive_supplier", { _id: supplier.id });
    if (error) {
      toast.error(`تعذر أرشفة المورد: ${error.message}`);
      return;
    }
    toast.success("تمت أرشفة المورد");
  }

  async function linkSupplier(event: FormEvent) {
    event.preventDefault();
    const cost = Number(lastCost);
    if (!productId || !supplierId || !Number.isFinite(cost) || cost < 0) {
      toast.error("اختر الصنف والمورد وأدخل تكلفة صالحة");
      return;
    }
    const { error } = await supabase.rpc("save_product_supplier", {
      _product_id: productId,
      _supplier_id: supplierId,
      _supplier_sku: supplierSku.trim() || null,
      _last_cost: cost,
      _is_primary: primary,
    });
    if (error && isTransientNetworkError(error)) {
      const operationId = crypto.randomUUID();
      try {
        await enqueueRpc({
          id: operationId,
          name: "save_product_supplier_offline",
          args: {
            _operation_id: operationId,
            _product_id: productId,
            _supplier_id: supplierId,
            _supplier_sku: supplierSku.trim() || null,
            _last_cost: cost,
            _is_primary: primary,
          },
        });
      } catch (queueError) {
        toast.error(queueError instanceof Error ? queueError.message : "تعذر حفظ الربط محليًا");
        return;
      }
      toast.info("حُفظ الربط على هذا الجهاز وسيُزامن عند عودة الاتصال");
      const localMapping: ProductSupplier = {
        product_id: productId,
        supplier_id: supplierId,
        supplier_sku: supplierSku.trim() || null,
        last_cost: cost,
        is_primary: primary,
        priority: 0,
        updated_at: new Date().toISOString(),
      };
      setProductSuppliers((items) => [
        localMapping,
        ...items.filter((item) => item.product_id !== productId || item.supplier_id !== supplierId),
      ]);
    } else if (error) {
      toast.error(`تعذر ربط المورد بالصنف: ${error.message}`);
      return;
    } else {
      toast.success("تم ربط المورد بالصنف ومزامنة بياناته");
    }
    setSupplierSku("");
    setLastCost("0");
    setPrimary(false);
  }

  return (
    <AppShell title="إدارة الموردين ومصادر توريد الأصناف">
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl bg-card p-5 shadow-card space-y-4">
          <h2 className="font-bold">{editingId ? "تعديل بيانات المورد" : "إضافة مورد"}</h2>
          <form onSubmit={saveSupplier} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="supplier-name">اسم المورد</Label>
              <Input
                id="supplier-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="supplier-phone">الهاتف</Label>
                <Input
                  id="supplier-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="supplier-address">العنوان</Label>
                <Input
                  id="supplier-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="supplier-notes">ملاحظات</Label>
              <Input
                id="supplier-notes"
                value={supplierNotes}
                onChange={(event) => setSupplierNotes(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!canAction("suppliers.manage")}>
                <Plus className="size-4 ml-1" /> حفظ المورد
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setName("");
                    setPhone("");
                    setAddress("");
                    setSupplierNotes("");
                  }}
                >
                  إلغاء التعديل
                </Button>
              )}
            </div>
          </form>
          <div className="divide-y border-t">
            {suppliers.map((supplier) => (
              <div key={supplier.id} className="flex items-center gap-2 py-3">
                <div className="flex-1">
                  <strong>{supplier.name}</strong>
                  <div className="text-xs text-muted-foreground">
                    {supplier.phone} · {supplier.address}
                  </div>
                </div>
                {!supplier.active && <span className="text-xs text-muted-foreground">مؤرشف</span>}
                {supplier.active && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="تعديل المورد"
                    disabled={!canAction("suppliers.manage")}
                    onClick={() => {
                      setEditingId(supplier.id);
                      setName(supplier.name);
                      setPhone(supplier.phone);
                      setAddress(supplier.address);
                      setSupplierNotes(supplier.notes ?? "");
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                )}
                {supplier.active && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="أرشفة المورد"
                    disabled={!canAction("suppliers.manage")}
                    onClick={() => void archiveSupplier(supplier)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {suppliers.length === 0 && (
              <p className="py-5 text-center text-sm text-muted-foreground">
                لا يوجد موردون مسجلون.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl bg-card p-5 shadow-card space-y-4">
          <h2 className="font-bold">ربط عدة موردين بالصنف</h2>
          <form onSubmit={linkSupplier} className="space-y-3">
            <div className="space-y-1">
              <Label>الصنف</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الصنف" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>المورد</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المورد" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers
                    .filter((supplier) => supplier.active)
                    .map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="supplier-sku">كود الصنف لدى المورد</Label>
                <Input
                  id="supplier-sku"
                  value={supplierSku}
                  onChange={(event) => setSupplierSku(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="supplier-cost">آخر تكلفة شراء</Label>
                <Input
                  id="supplier-cost"
                  type="number"
                  min="0"
                  step="any"
                  value={lastCost}
                  onChange={(event) => setLastCost(event.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={primary}
                onChange={(event) => setPrimary(event.target.checked)}
              />{" "}
              المورد الأساسي للصنف
            </label>
            <Button
              type="submit"
              disabled={
                !canAction("suppliers.manage") ||
                !products.length ||
                !suppliers.some((supplier) => supplier.active)
              }
            >
              حفظ الربط
            </Button>
          </form>
          <div className="divide-y border-t">
            {productSuppliers.map((mapping) => (
              <div
                key={`${mapping.product_id}-${mapping.supplier_id}`}
                className="flex justify-between gap-2 py-2 text-sm"
              >
                <span>
                  {products.find((product) => product.id === mapping.product_id)?.name ?? "صنف"} ·{" "}
                  {suppliers.find((supplier) => supplier.id === mapping.supplier_id)?.name ??
                    "مورد"}
                </span>
                <span>
                  {mapping.last_cost} ر.ي {mapping.is_primary ? "· أساسي" : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
