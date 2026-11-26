import { useEffect, useState, type FormEvent } from "react";
import { Barcode, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category, CustomField, Product, Unit, Warehouse } from "@/hooks/use-inventory";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { PRICE_TIERS, fileToDataUrl } from "@/lib/inventory-utils";
import { enqueueRpc, isTransientNetworkError } from "@/lib/offline/rpc-queue";
import { uploadProductImage } from "@/lib/offline/product-image";

type Supplier = Tables<"suppliers">;
type ProductUnit = Tables<"product_units">;
type ProductSupplier = Tables<"product_suppliers">;

const NONE = "__none";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product?: Product | null | undefined;
  barcode?: string | undefined;
  categories: Category[];
  warehouses: Warehouse[];
  units: Unit[];
  fields: CustomField[];
};

type ExtraUnit = { unit_name: string; factor: string };
type SupplierLink = { supplier_id: string; supplier_sku: string; last_cost: string };
type StockDraft = { qty: string; shelf: string };

const isMissingFunction = (error: { code?: string } | null) =>
  !!error && (error.code === "42883" || error.code === "PGRST202");

export function ProductDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{props.product ? "تعديل صنف" : "صنف جديد"}</DialogTitle>
        </DialogHeader>
        {props.open && <ProductForm key={props.product?.id ?? props.barcode ?? "new"} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({
  onOpenChange,
  product,
  barcode,
  categories,
  warehouses,
  units,
  fields,
}: Props) {
  const p = product;
  const { canField, canAction, session } = useAuth();
  const visibleFields = fields.filter((fd) => canField(`attribute:${fd.name}`));
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(p?.barcode ?? barcode ?? "");
  const [category, setCategory] = useState(p?.category_id ?? NONE);
  const [warehouse, setWarehouse] = useState(p?.warehouse_id ?? NONE);
  const [unit, setUnit] = useState(p?.unit ?? units[0]?.name ?? "حبة");
  const [major, setMajor] = useState(p?.major_unit ?? NONE);
  const [image, setImage] = useState<string | null>(p?.image_url ?? null);
  const [attrs, setAttrs] = useState<Record<string, string>>(
    (p?.attributes as Record<string, string>) ?? {},
  );

  // Editable catalog lists (include items created inline during this session).
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);
  const [localUnits, setLocalUnits] = useState<Unit[]>(units);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Multi-unit, multi-supplier, multi-warehouse state.
  const [extraUnits, setExtraUnits] = useState<ExtraUnit[]>([]);
  const [supplierLinks, setSupplierLinks] = useState<SupplierLink[]>([]);
  const [stocks, setStocks] = useState<Record<string, StockDraft>>({});
  const [loadedProductUnits, setLoadedProductUnits] = useState<ProductUnit[]>([]);
  const [loadedSuppliers, setLoadedSuppliers] = useState<ProductSupplier[]>([]);

  // Inline "create new" drafts.
  const [newCategory, setNewCategory] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  const canCreateCatalog = canAction("settings.manage");
  const canManageSuppliers = canAction("suppliers.manage");
  const balanceAllowed = canField("quantity") && canAction("stocktake.adjust");

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);
  useEffect(() => {
    setLocalUnits(units);
  }, [units]);

  // Load suppliers + per-product units/links when the dialog opens.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const userId = session?.user.id;
      const supplierQuery = supabase.from("suppliers").select("*").eq("active", true).order("name");
      if (p) {
        const [supplierResult, unitsResult, linksResult] = await Promise.all([
          supplierQuery,
          supabase.from("product_units").select("*").eq("product_id", p.id),
          supabase.from("product_suppliers").select("*").eq("product_id", p.id),
        ]);
        if (!active) return;
        if (supplierResult.data) setSuppliers(supplierResult.data);
        if (unitsResult.data) setLoadedProductUnits(unitsResult.data);
        if (linksResult.data) setLoadedSuppliers(linksResult.data);
        if (!supplierResult.error && !unitsResult.error && !linksResult.error && userId) {
          // no-op: per-product meta is refetched on open; no snapshot needed
        }
      } else {
        const supplierResult = await supplierQuery;
        if (!active) return;
        if (supplierResult.data) setSuppliers(supplierResult.data);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [p, session?.user.id]);

  // Seed editable state from the loaded product meta (edit mode only).
  useEffect(() => {
    if (!p) return;
    const mapped: ExtraUnit[] = loadedProductUnits
      .filter((u) => !u.is_base)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((u) => ({ unit_name: u.unit_name, factor: String(u.factor) }));
    setExtraUnits(mapped);
    const links: SupplierLink[] = [...loadedSuppliers]
      .sort((a, b) => a.priority - b.priority)
      .map((s) => ({
        supplier_id: s.supplier_id,
        supplier_sku: s.supplier_sku ?? "",
        last_cost: String(s.last_cost),
      }));
    setSupplierLinks(links);
  }, [p, loadedProductUnits, loadedSuppliers]);

  async function pickImage(file?: File) {
    if (!file) return;
    try {
      setImage(await fileToDataUrl(file));
    } catch {
      toast.error("تعذر قراءة الصورة");
    }
  }

  async function createCategory() {
    const name = newCategory.trim();
    if (!name) return;
    setCreating("category");
    const id = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const record = { name, prefix: "ITM" };
    let { error } = await supabase.rpc("save_catalog_setting_offline", {
      _operation_id: operationId,
      _table: "categories",
      _id: id,
      _record: record,
    });
    if (isMissingFunction(error)) {
      const legacy = await supabase.from("categories").insert(record as never);
      error = legacy.error;
    }
    if (error && isTransientNetworkError(error)) {
      try {
        await enqueueRpc({
          id: operationId,
          name: "save_catalog_setting_offline",
          args: {
            _operation_id: operationId,
            _table: "categories",
            _id: id,
            _record: record as never,
          },
        });
        setLocalCategories((items) => [
          ...items,
          { id, name, prefix: "ITM", next_seq: 1, created_at: new Date().toISOString() },
        ]);
        setCategory(id);
        setNewCategory("");
        setAddingCategory(false);
        toast.info("حُفظت الفئة على الجهاز وستُزامن عند عودة الاتصال");
        setCreating(null);
        return;
      } catch (queueError) {
        setCreating(null);
        toast.error(queueError instanceof Error ? queueError.message : "تعذر حفظ الفئة محليًا");
        return;
      }
    }
    if (error) {
      setCreating(null);
      toast.error(error.code === "23505" ? "الفئة موجودة مسبقاً" : error.message);
      return;
    }
    setLocalCategories((items) => [
      ...items,
      { id, name, prefix: "ITM", next_seq: 1, created_at: new Date().toISOString() },
    ]);
    setCategory(id);
    setNewCategory("");
    setAddingCategory(false);
    setCreating(null);
    toast.success("تمت إضافة الفئة");
  }

  async function createUnit() {
    const name = newUnit.trim();
    if (!name) return;
    setCreating("unit");
    const id = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const record = { name, factor: 1 };
    let { error } = await supabase.rpc("save_catalog_setting_offline", {
      _operation_id: operationId,
      _table: "units",
      _id: id,
      _record: record,
    });
    if (isMissingFunction(error)) {
      const legacy = await supabase.from("units").insert(record as never);
      error = legacy.error;
    }
    if (error && isTransientNetworkError(error)) {
      try {
        await enqueueRpc({
          id: operationId,
          name: "save_catalog_setting_offline",
          args: {
            _operation_id: operationId,
            _table: "units",
            _id: id,
            _record: record as never,
          },
        });
        setLocalUnits((items) => [
          ...items,
          { id, name, factor: 1, created_at: new Date().toISOString() },
        ]);
        setUnit(name);
        setNewUnit("");
        setAddingUnit(false);
        toast.info("حُفظت الوحدة على الجهاز وستُزامن عند عودة الاتصال");
        setCreating(null);
        return;
      } catch (queueError) {
        setCreating(null);
        toast.error(queueError instanceof Error ? queueError.message : "تعذر حفظ الوحدة محليًا");
        return;
      }
    }
    if (error) {
      setCreating(null);
      toast.error(error.code === "23505" ? "الوحدة موجودة مسبقاً" : error.message);
      return;
    }
    setLocalUnits((items) => [
      ...items,
      { id, name, factor: 1, created_at: new Date().toISOString() },
    ]);
    setUnit(name);
    setNewUnit("");
    setAddingUnit(false);
    setCreating(null);
    toast.success("تمت إضافة الوحدة");
  }

  async function createSupplier(): Promise<string | null> {
    const name = newSupplier.trim();
    if (!name) return null;
    setCreating("supplier");
    const id = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const args = {
      _operation_id: operationId,
      _id: id,
      _name: name,
      _phone: newSupplierPhone.trim(),
      _address: "",
      _notes: "",
    };
    let { error } = await supabase.rpc("save_supplier_offline", args);
    if (isMissingFunction(error)) {
      const legacy = await supabase.rpc("save_supplier", {
        _id: id,
        _name: name,
        _phone: newSupplierPhone.trim(),
        _address: "",
        _notes: "",
      });
      error = legacy.error;
    }
    if (error && isTransientNetworkError(error)) {
      try {
        await enqueueRpc({ id: operationId, name: "save_supplier_offline", args });
      } catch (queueError) {
        setCreating(null);
        toast.error(queueError instanceof Error ? queueError.message : "تعذر حفظ المورد محليًا");
        return null;
      }
      setSuppliers((items) => [
        ...items,
        {
          id,
          name,
          phone: newSupplierPhone.trim(),
          address: "",
          notes: null,
          active: true,
          po_method: "manual",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      setSupplierLinks((links) => [
        ...links,
        { supplier_id: id, supplier_sku: "", last_cost: "0" },
      ]);
      setNewSupplier("");
      setNewSupplierPhone("");
      setAddingSupplier(false);
      setCreating(null);
      toast.info("حُفظ المورد على الجهاز وستُزامن عند عودة الاتصال");
      return id;
    }
    if (error) {
      setCreating(null);
      toast.error(error.code === "23505" ? "المورد موجود مسبقاً" : error.message);
      return null;
    }
    setSuppliers((items) => [
      ...items,
      {
        id,
        name,
        phone: newSupplierPhone.trim(),
        address: "",
        notes: null,
        active: true,
        po_method: "manual",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    setSupplierLinks((links) => [...links, { supplier_id: id, supplier_sku: "", last_cost: "0" }]);
    setNewSupplier("");
    setNewSupplierPhone("");
    setAddingSupplier(false);
    setCreating(null);
    toast.success("تمت إضافة المورد وربطه بالصنف");
    return id;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(f.get(k) || 0);
    const primarySupplierName =
      supplierLinks
        .map((l) => suppliers.find((s) => s.id === l.supplier_id)?.name)
        .find((name): name is string => !!name) ?? null;
    const row = {
      name: String(f.get("name")).trim(),
      description: String(f.get("description") || "") || null,
      model_no: String(f.get("model_no") || "") || null,
      barcode: code.trim() || null,
      category_id: category === NONE ? null : category,
      warehouse_id: warehouse === NONE ? null : warehouse,
      shelf: String(f.get("shelf") || "") || null,
      unit,
      major_unit: major === NONE ? null : major,
      pack_capacity: n("pack_capacity") || 1,
      cost: n("cost"),
      price: f.has("price") ? n("price") : (p?.price ?? 0),
      price_special: n("price_special"),
      price_half: n("price_half"),
      price_wholesale: n("price_wholesale"),
      price_bulk: n("price_bulk"),
      reorder_level: n("reorder_level"),
      reorder_qty: n("reorder_qty"),
      expiry_date: String(f.get("expiry_date") || "") || null,
      supplier: supplierLinks.length ? primarySupplierName : (p?.supplier ?? null),
      image_url: image?.startsWith("data:image/") ? (p?.image_url ?? null) : image,
      attributes: attrs,
    };
    const allowedRow = Object.fromEntries(
      Object.entries(row).filter(
        ([key]) =>
          (key === "attributes" ? visibleFields.length > 0 : canField(key)) &&
          (!["cost", ...PRICE_TIERS.map((t) => t.key)].includes(key) || canAction("prices.update")),
      ),
    ) as Partial<typeof row>;
    if (!p && !allowedRow.name) {
      toast.error("إضافة صنف تحتاج صلاحية الاسم");
      return;
    }
    const openingBalances = balanceAllowed
      ? warehouses
          .map((item) => ({
            warehouse_id: item.id,
            quantity: Number(stocks[item.id]?.qty || 0),
            shelf: stocks[item.id]?.shelf?.trim() || "",
          }))
          .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0)
      : [];
    const unitsPayload =
      canField("unit") && extraUnits.length
        ? extraUnits
            .filter((u) => u.unit_name.trim())
            .map((u, i) => ({
              unit_name: u.unit_name.trim(),
              factor: Number(u.factor) || 1,
              is_base: false,
              sort_order: i,
            }))
        : [];
    const supplierPayload =
      canField("supplier") && supplierLinks.length
        ? supplierLinks
            .filter((l) => l.supplier_id)
            .map((l) => ({
              supplier_id: l.supplier_id,
              supplier_sku: l.supplier_sku.trim() || null,
              last_cost: Number(l.last_cost) || 0,
            }))
        : [];
    const shouldSaveUnits =
      canField("unit") && (unitsPayload.length > 0 || loadedProductUnits.length > 0);
    const shouldSaveSuppliers =
      canField("supplier") && (supplierPayload.length > 0 || loadedSuppliers.length > 0);

    setBusy(true);
    const productId = p?.id ?? crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const offlineRow = {
      ...allowedRow,
      updated_at: (p as { updated_at?: string | null } | undefined)?.updated_at ?? null,
      image_url: p?.image_url ?? null,
    };
    const offlineArgs = {
      _operation_id: operationId,
      _id: productId,
      _product: offlineRow,
      _attributes: visibleFields.length
        ? Object.fromEntries(Object.entries(attrs).filter(([k]) => canField(`attribute:${k}`)))
        : {},
      _balances: openingBalances.map((b) => ({
        warehouse_id: b.warehouse_id,
        quantity: b.quantity,
      })),
    };
    const pendingImage = image?.startsWith("data:image/") ? image : null;
    const enqueueExtras = async () => {
      if (openingBalances.some((b) => b.shelf)) {
        await enqueueRpc({
          id: crypto.randomUUID(),
          name: "save_product_opening_balances_offline",
          args: {
            _operation_id: crypto.randomUUID(),
            _product: productId,
            _balances: openingBalances,
          },
        });
      }
      if (shouldSaveUnits) {
        await enqueueRpc({
          id: crypto.randomUUID(),
          name: "save_product_units_offline",
          args: {
            _operation_id: crypto.randomUUID(),
            _product: productId,
            _units: unitsPayload,
          },
        });
      }
      if (shouldSaveSuppliers) {
        await enqueueRpc({
          id: crypto.randomUUID(),
          name: "save_product_suppliers_offline",
          args: {
            _operation_id: crypto.randomUUID(),
            _product: productId,
            _items: supplierPayload,
          },
        });
      }
    };
    const saveOffline = async () => {
      await enqueueRpc({
        id: operationId,
        name: "save_product_offline",
        args: offlineArgs as never,
      });
      await enqueueExtras();
      if (pendingImage) {
        const imageOperationId = crypto.randomUUID();
        await enqueueRpc({
          id: imageOperationId,
          name: "upload_product_image_offline",
          args: {
            _operation_id: imageOperationId,
            _product_id: productId,
            _data_url: pendingImage,
          },
        });
      }
    };
    // Persist units / suppliers / opening balances through their dedicated RPCs.
    const saveRelations = async () => {
      if (openingBalances.length > 0) {
        const { error } = await supabase.rpc("save_product_opening_balances", {
          _product: productId,
          _balances: openingBalances,
        });
        if (isMissingFunction(error)) {
          const legacy = await supabase.rpc("set_initial_stocks", {
            _product: productId,
            _balances: openingBalances.map((b) => ({
              warehouse_id: b.warehouse_id,
              quantity: b.quantity,
            })),
          });
          if (legacy.error) return `تعذر حفظ الأرصدة الافتتاحية: ${legacy.error.message}`;
        } else if (error) {
          const msg = error.message ?? String(error);
          // الرصيد الافتتاحي قد يكون مسجلاً مسبقاً — لا نعتبره خطأً فاتحاً
          if (/isnot unique|already exists|23505|duplicate/i.test(msg)) {
            console.warn("Opening stock already exists, skipping:", msg);
          } else {
            return `تعذر حفظ الأرصدة الافتتاحية: ${msg}`;
          }
        }
      }
      if (shouldSaveUnits) {
        const { error } = await supabase.rpc("save_product_units", {
          _product: productId,
          _units: unitsPayload,
        });
        if (error && !isMissingFunction(error)) return `تعذر حفظ الوحدات: ${error.message}`;
      }
      if (shouldSaveSuppliers) {
        const { error } = await supabase.rpc("save_product_suppliers", {
          _product: productId,
          _items: supplierPayload,
        });
        if (error && !isMissingFunction(error)) return `تعذر ربط الموردين: ${error.message}`;
      }
      return null;
    };

    if (p) {
      delete allowedRow.attributes;
      const { error } = await supabase.from("products").update(allowedRow).eq("id", p.id);
      if (error && isTransientNetworkError(error)) {
        try {
          await saveOffline();
        } catch (queueError) {
          setBusy(false);
          toast.error(queueError instanceof Error ? queueError.message : "تعذر حفظ العملية محليًا");
          return;
        }
        setBusy(false);
        toast.info("حُفظ تعديل الصنف وصورته على هذا الجهاز وسيُزامنان عند عودة الاتصال");
        onOpenChange(false);
        return;
      }
      if (error) {
        setBusy(false);
        toast.error(error.code === "23505" ? "الباركود أو الكود مستخدم لصنف آخر" : error.message);
        return;
      }
      if (visibleFields.length) {
        const { error: attrError } = await supabase.rpc("save_product_attributes", {
          _product: p.id,
          _attributes: Object.fromEntries(
            Object.entries(attrs).filter(([k]) => canField(`attribute:${k}`)),
          ),
        });
        if (attrError) {
          setBusy(false);
          toast.error(attrError.message);
          return;
        }
      }
      const relationError = await saveRelations();
      if (relationError) {
        setBusy(false);
        toast.error(relationError);
        return;
      }
      toast.success("تم حفظ التعديلات");
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert({ ...allowedRow, id: productId } as typeof row)
        .select("id")
        .single();
      if (error && isTransientNetworkError(error)) {
        try {
          await saveOffline();
        } catch (queueError) {
          setBusy(false);
          toast.error(queueError instanceof Error ? queueError.message : "تعذر حفظ العملية محليًا");
          return;
        }
        setBusy(false);
        toast.info("حُفظ الصنف وصورته على هذا الجهاز وسيُزامنان عند عودة الاتصال");
        onOpenChange(false);
        return;
      }
      if (error) {
        setBusy(false);
        toast.error(error.code === "23505" ? "الباركود أو الكود مستخدم لصنف آخر" : error.message);
        return;
      }
      if (data) {
        const relationError = await saveRelations();
        if (relationError) {
          setBusy(false);
          toast.error(`أُضيف الصنف لكن ${relationError}`);
          return;
        }
      }
      setBusy(false);
      toast.success("تمت إضافة الصنف");
    }
    if (pendingImage && session?.user.id) {
      try {
        const imageUrl = await uploadProductImage(
          session.user.id,
          productId,
          operationId,
          pendingImage,
        );
        const { error: imageError } = await supabase
          .from("products")
          .update({ image_url: imageUrl })
          .eq("id", productId);
        if (imageError) throw imageError;
      } catch (imageError) {
        if (isTransientNetworkError(imageError)) {
          const imageOperationId = crypto.randomUUID();
          try {
            await enqueueRpc({
              id: imageOperationId,
              name: "upload_product_image_offline",
              args: {
                _operation_id: imageOperationId,
                _product_id: productId,
                _data_url: pendingImage,
              },
            });
            toast.info("تم حفظ الصنف، وحُفظت صورته لمزامنتها عند عودة الاتصال");
          } catch (queueError) {
            toast.error(
              queueError instanceof Error
                ? queueError.message
                : "حُفظ الصنف لكن تعذر حفظ الصورة محليًا",
            );
          }
        } else {
          toast.error(
            `تم حفظ الصنف لكن تعذر رفع الصورة: ${imageError instanceof Error ? imageError.message : String(imageError)}`,
          );
        }
      }
    }
    onOpenChange(false);
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3">
      <div className="col-span-2 flex gap-3 items-start">
        {canField("image_url") && (
          <label className="relative size-24 shrink-0 rounded-lg border-2 border-dashed grid place-items-center cursor-pointer overflow-hidden bg-muted">
            {image ? (
              <img src={image} alt="" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-7 text-muted-foreground" />
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
            {image && (
              <Button
                size="icon"
                variant="ghost"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setImage(null);
                }}
                className="absolute top-1 left-1 rounded-full bg-card p-0.5"
                aria-label="حذف الصورة"
              >
                <X className="size-3" />
              </Button>
            )}
          </label>
        )}
        <div className="flex-1 space-y-2">
          {canField("name") && (
            <div className="space-y-1">
              <Label>اسم الصنف *</Label>
              <Input name="name" required defaultValue={p?.name} />
            </div>
          )}
          {p && (
            <div className="text-xs text-muted-foreground">
              الكود: <b dir="ltr">{p.code}</b> · الباركود الخاص: <b dir="ltr">{p.custom_barcode}</b>
            </div>
          )}
          {!p && (
            <div className="text-xs text-muted-foreground">
              كود الصنف والباركود الخاص (628…) يتولدان تلقائياً عند الحفظ.
            </div>
          )}
        </div>
      </div>
      {canField("description") && (
        <div className="col-span-2 space-y-1">
          <Label>الوصف والمواصفات</Label>
          <Textarea name="description" rows={2} defaultValue={p?.description ?? ""} />
        </div>
      )}
      {canField("model_no") && (
        <div className="space-y-1">
          <Label>رقم الصنف / الموديل</Label>
          <Input name="model_no" dir="ltr" defaultValue={p?.model_no ?? ""} />
        </div>
      )}
      {canField("barcode") && (
        <div className="space-y-1">
          <Label>الباركود الأساسي (المصنع)</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pr-10"
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <BarcodeScanner onDetected={setCode} />
          </div>
        </div>
      )}
      {canField("category_id") && (
        <CreatablePick
          label="القسم / الفئة"
          value={category}
          onChange={setCategory}
          items={localCategories.map((c) => [c.id, c.name] as [string, string])}
          allowNone
          canCreate={canCreateCatalog}
          adding={addingCategory}
          onToggleAdd={() => setAddingCategory((v) => !v)}
          draft={newCategory}
          onDraft={setNewCategory}
          onConfirm={createCategory}
          busy={creating === "category"}
          placeholder="اسم الفئة الجديدة"
        />
      )}
      {canField("warehouse_id") && (
        <Pick
          label="المستودع الافتراضي"
          value={warehouse}
          onChange={setWarehouse}
          items={warehouses.map((w) => [w.id, w.name])}
        />
      )}
      {canField("shelf") && (
        <div className="col-span-2 space-y-1">
          <Label>موقع الرف / الخزنة</Label>
          <Input
            name="shelf"
            placeholder="مثال: رف A3، دولاب العرض 2"
            defaultValue={p?.shelf ?? ""}
          />
        </div>
      )}
      {canField("unit") && (
        <CreatablePick
          label="الوحدة الأساسية"
          value={unit}
          onChange={setUnit}
          items={localUnits.map((u) => [u.name, u.name] as [string, string])}
          allowNone={false}
          canCreate={canCreateCatalog}
          adding={addingUnit}
          onToggleAdd={() => setAddingUnit((v) => !v)}
          draft={newUnit}
          onDraft={setNewUnit}
          onConfirm={createUnit}
          busy={creating === "unit"}
          placeholder="اسم الوحدة الجديدة"
        />
      )}
      {canField("major_unit") && (
        <Pick
          label="الوحدة الكبرى"
          value={major}
          onChange={setMajor}
          items={localUnits.map((u) => [u.name, u.name])}
        />
      )}
      {canField("pack_capacity") && (
        <div className="space-y-1">
          <Label>سعة العبوة (كم وحدة أساسية)</Label>
          <Input
            name="pack_capacity"
            type="number"
            min="1"
            step="any"
            defaultValue={p?.pack_capacity ?? 1}
          />
        </div>
      )}

      {/* Additional units with per-unit conversion factor (no fixed 5-unit limit). */}
      {canField("unit") && (
        <div className="col-span-2 space-y-2 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center justify-between">
            <Label>وحدات إضافية (اختياري) — معامل التحويل لكل وحدة</Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setExtraUnits((list) => [...list, { unit_name: "", factor: "1" }])}
            >
              <Plus className="size-4 ml-1" /> وحدة
            </Button>
          </div>
          {extraUnits.length === 0 && (
            <p className="text-xs text-muted-foreground">
              أضف أي عدد من الوحدات (أكثر من 5) وحدّد كم وحدة أساسية تعادلها كل وحدة.
            </p>
          )}
          <div className="space-y-2">
            {extraUnits.map((row, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">الوحدة {index + 1}</Label>
                  <Select
                    value={row.unit_name || NONE}
                    onValueChange={(v) =>
                      setExtraUnits((list) =>
                        list.map((r, i) =>
                          i === index ? { ...r, unit_name: v === NONE ? "" : v } : r,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="اختر وحدة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {localUnits.map((u) => (
                        <SelectItem key={u.name} value={u.name}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs">معامل التحويل</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="bg-card"
                    value={row.factor}
                    onChange={(e) =>
                      setExtraUnits((list) =>
                        list.map((r, i) => (i === index ? { ...r, factor: e.target.value } : r)),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="حذف الوحدة"
                  onClick={() => setExtraUnits((list) => list.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {canField("cost") && (
        <div className="space-y-1">
          <Label>تكلفة الشراء</Label>
          <Input
            disabled={!canAction("prices.update")}
            name="cost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={p?.cost ?? ""}
          />
        </div>
      )}
      <div className="col-span-2 grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-lg bg-muted p-3">
        {PRICE_TIERS.filter((t) => canField(t.key)).map((t) => (
          <div key={t.key} className="space-y-1">
            <Label className="text-xs">{t.label}</Label>
            <Input
              name={t.key}
              type="number"
              step="0.01"
              min="0"
              className="bg-card"
              disabled={!canAction("prices.update")}
              defaultValue={p?.[t.key] ?? ""}
            />
          </div>
        ))}
      </div>
      {canField("reorder_level") && (
        <div className="space-y-1">
          <Label>حد الطلب (تنبيه النفاد)</Label>
          <Input name="reorder_level" type="number" min="0" defaultValue={p?.reorder_level ?? ""} />
        </div>
      )}
      {canField("reorder_qty") && (
        <div className="space-y-1">
          <Label>كمية إعادة التوريد</Label>
          <Input name="reorder_qty" type="number" min="0" defaultValue={p?.reorder_qty ?? ""} />
        </div>
      )}
      {canField("expiry_date") && (
        <div className="space-y-1">
          <Label>تاريخ الانتهاء (اختياري)</Label>
          <Input name="expiry_date" type="date" dir="ltr" defaultValue={p?.expiry_date ?? ""} />
        </div>
      )}

      {/* Multiple suppliers with priority order + inline creation. */}
      {canField("supplier") && (
        <div className="col-span-2 space-y-2 rounded-lg border bg-muted/40 p-3">
          <div className="flex items-center justify-between">
            <Label>الموردون (مصادر التوريد) — الأول هو الأساسي</Label>
            <div className="flex gap-2">
              {canManageSuppliers && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAddingSupplier((v) => !v)}
                >
                  <Plus className="size-4 ml-1" /> مورد جديد
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setSupplierLinks((links) => [
                    ...links,
                    { supplier_id: "", supplier_sku: "", last_cost: "0" },
                  ])
                }
              >
                <Plus className="size-4 ml-1" /> ربط مورد
              </Button>
            </div>
          </div>
          {addingSupplier && canManageSuppliers && (
            <div className="flex flex-wrap items-end gap-2 rounded-lg bg-card p-2">
              <div className="flex-1 min-w-40 space-y-1">
                <Label className="text-xs">اسم المورد</Label>
                <Input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
              </div>
              <div className="w-40 space-y-1">
                <Label className="text-xs">الهاتف (اختياري)</Label>
                <Input
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={creating === "supplier" || !newSupplier.trim()}
                onClick={createSupplier}
              >
                {creating === "supplier" ? <Loader2 className="size-4 animate-spin" /> : "حفظ وربط"}
              </Button>
            </div>
          )}
          {supplierLinks.length === 0 && (
            <p className="text-xs text-muted-foreground">
              اربط أكثر من مورد ورتّب الأولوية؛ المورد الأول يُسجّل كمورد افتراضي للصنف.
            </p>
          )}
          <div className="space-y-2">
            {supplierLinks.map((link, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <span className="w-6 text-center text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-40 space-y-1">
                  <Label className="text-xs">{index === 0 ? "المورد الأساسي" : "مورد"}</Label>
                  <Select
                    value={link.supplier_id || NONE}
                    onValueChange={(v) =>
                      setSupplierLinks((links) =>
                        links.map((r, i) =>
                          i === index ? { ...r, supplier_id: v === NONE ? "" : v } : r,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="اختر مورد" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs">كود المورد (اختياري)</Label>
                  <Input
                    dir="ltr"
                    className="bg-card"
                    placeholder="SKU"
                    value={link.supplier_sku}
                    onChange={(e) =>
                      setSupplierLinks((links) =>
                        links.map((r, i) =>
                          i === index ? { ...r, supplier_sku: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label className="text-xs">التكلفة</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="bg-card"
                    value={link.last_cost}
                    onChange={(e) =>
                      setSupplierLinks((links) =>
                        links.map((r, i) =>
                          i === index ? { ...r, last_cost: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="إزالة المورد"
                  onClick={() => setSupplierLinks((links) => links.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!p && balanceAllowed && (
        <div className="col-span-2 space-y-2">
          <Label>الرصيد الافتتاحي في كل مستودع (مع إمكانية تحديد الرف)</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {warehouses.map((item) => (
              <div key={item.id} className="space-y-1 rounded-lg border bg-card p-2">
                <Label htmlFor={`initial-stock-${item.id}`} className="text-xs">
                  {item.name}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`initial-stock-${item.id}`}
                    type="number"
                    min="0"
                    step="any"
                    placeholder="الكمية"
                    value={stocks[item.id]?.qty ?? ""}
                    onChange={(event) =>
                      setStocks((values) => ({
                        ...values,
                        [item.id]: {
                          qty: event.target.value,
                          shelf: values[item.id]?.shelf ?? "",
                        },
                      }))
                    }
                  />
                  <Input
                    type="text"
                    placeholder="الرف (اختياري)"
                    className="flex-1"
                    value={stocks[item.id]?.shelf ?? ""}
                    onChange={(event) =>
                      setStocks((values) => ({
                        ...values,
                        [item.id]: {
                          qty: values[item.id]?.qty ?? "",
                          shelf: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            يُسجل كل رصيد افتتاحي كحركة مخزون مستقلة للمستودع المختار، ويُوزّع على الرف إن حُدد.
          </p>
        </div>
      )}
      {visibleFields.map((fd) => (
        <div key={fd.id} className="space-y-1">
          <Label>{fd.name}</Label>
          {fd.kind === "select" && fd.options.length ? (
            <Select
              value={attrs[fd.name] || NONE}
              onValueChange={(v) => setAttrs((a) => ({ ...a, [fd.name]: v === NONE ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {fd.options.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={fd.kind === "number" ? "number" : "text"}
              step="any"
              value={attrs[fd.name] ?? ""}
              onChange={(e) => setAttrs((a) => ({ ...a, [fd.name]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <Button type="submit" className="col-span-2 h-11" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" />} حفظ
      </Button>
    </form>
  );
}

function Pick({
  label,
  value,
  onChange,
  items,
  allowNone = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: [string, string][];
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="اختر" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>بدون</SelectItem>}
          {items.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CreatablePick({
  label,
  value,
  onChange,
  items,
  allowNone = true,
  canCreate,
  adding,
  onToggleAdd,
  draft,
  onDraft,
  onConfirm,
  busy,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: [string, string][];
  allowNone?: boolean;
  canCreate: boolean;
  adding: boolean;
  onToggleAdd: () => void;
  draft: string;
  onDraft: (v: string) => void;
  onConfirm: () => void;
  busy: boolean;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {canCreate && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={onToggleAdd}
          >
            <Plus className="size-3 ml-1" /> جديد
          </Button>
        )}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="اختر" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NONE}>بدون</SelectItem>}
          {items.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {adding && canCreate && (
        <div className="flex gap-2 pt-1">
          <Input
            autoFocus
            value={draft}
            placeholder={placeholder}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onConfirm();
              }
              if (e.key === "Escape") onToggleAdd();
            }}
          />
          <Button type="button" size="sm" onClick={onConfirm} disabled={busy || !draft.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "إضافة"}
          </Button>
        </div>
      )}
    </div>
  );
}
