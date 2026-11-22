import { useState, type FormEvent } from "react";
import { Barcode, ImagePlus, Loader2, X } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { PRICE_TIERS, fileToDataUrl } from "@/lib/inventory-utils";
import { enqueueRpc, isTransientNetworkError } from "@/lib/offline/rpc-queue";

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

export function ProductDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
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
  const { canField, canAction } = useAuth();
  const visibleFields = fields.filter((fd) => canField(`attribute:${fd.name}`));
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(p?.barcode ?? barcode ?? "");
  const [category, setCategory] = useState(p?.category_id ?? NONE);
  const [warehouse, setWarehouse] = useState(p?.warehouse_id ?? NONE);
  const [unit, setUnit] = useState(p?.unit ?? units[0]?.name ?? "حبة");
  const [major, setMajor] = useState(p?.major_unit ?? NONE);
  const [initialStocks, setInitialStocks] = useState<Record<string, string>>({});
  const [image, setImage] = useState<string | null>(p?.image_url ?? null);
  const [attrs, setAttrs] = useState<Record<string, string>>(
    (p?.attributes as Record<string, string>) ?? {},
  );

  async function pickImage(file?: File) {
    if (!file) return;
    try {
      setImage(await fileToDataUrl(file));
    } catch {
      toast.error("تعذر قراءة الصورة");
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(f.get(k) || 0);
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
      supplier: String(f.get("supplier") || "") || null,
      image_url: image,
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
    const initialBalances =
      canField("quantity") && canAction("stocktake.adjust")
        ? warehouses
            .map((item) => ({
              warehouse_id: item.id,
              quantity: Number(initialStocks[item.id] || 0),
            }))
            .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0)
        : [];
    setBusy(true);
    const productId = p?.id ?? crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const offlineRow = { ...allowedRow, image_url: p?.image_url ?? null };
    const offlineArgs = {
      _operation_id: operationId,
      _id: productId,
      _product: offlineRow,
      _attributes: visibleFields.length
        ? Object.fromEntries(Object.entries(attrs).filter(([k]) => canField(`attribute:${k}`)))
        : {},
      _balances: initialBalances,
    };
    const saveOffline = async () =>
      enqueueRpc({ id: operationId, name: "save_product_offline", args: offlineArgs as never });
    if (p) {
      delete allowedRow.attributes;
      const { error } = await supabase.from("products").update(allowedRow).eq("id", p.id);
      setBusy(false);
      if (error && isTransientNetworkError(error)) {
        try {
          await saveOffline();
        } catch (queueError) {
          setBusy(false);
          toast.error(queueError instanceof Error ? queueError.message : "تعذر حفظ العملية محليًا");
          return;
        }
        setBusy(false);
        toast.info("حُفظ تعديل الصنف على هذا الجهاز وسيُزامن عند عودة الاتصال؛ الصورة تبقى كما هي");
        onOpenChange(false);
        return;
      }
      if (error) {
        toast.error(error.code === "23505" ? "الباركود أو الكود مستخدم لصنف آخر" : error.message);
        return;
      }
      if (visibleFields.length && !error) {
        const { error: attrError } = await supabase.rpc("save_product_attributes", {
          _product: p.id,
          _attributes: Object.fromEntries(
            Object.entries(attrs).filter(([k]) => canField(`attribute:${k}`)),
          ),
        });
        if (attrError) {
          toast.error(attrError.message);
          return;
        }
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
        toast.info("حُفظ الصنف على هذا الجهاز وسيُزامن عند عودة الاتصال؛ الصورة ستحتاج رفعًا لاحقًا");
        onOpenChange(false);
        return;
      }
      if (error) {
        setBusy(false);
        toast.error(error.code === "23505" ? "الباركود أو الكود مستخدم لصنف آخر" : error.message);
        return;
      }
      if (initialBalances.length > 0 && data) {
        const { error: stockErr } = await supabase.rpc("set_initial_stocks", {
          _product: data.id,
          _balances: initialBalances,
        });
        if (stockErr) {
          setBusy(false);
          toast.error(`أُضيف الصنف لكن تعذر تسجيل الأرصدة الافتتاحية: ${stockErr.message}`);
          return;
        }
      }
      setBusy(false);
      toast.success("تمت إضافة الصنف");
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
        <Pick
          label="القسم / الفئة"
          value={category}
          onChange={setCategory}
          items={categories.map((c) => [c.id, c.name])}
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
        <Pick
          label="الوحدة الأساسية"
          value={unit}
          onChange={setUnit}
          items={units.map((u) => [u.name, u.name])}
          allowNone={false}
        />
      )}
      {canField("major_unit") && (
        <Pick
          label="الوحدة الكبرى"
          value={major}
          onChange={setMajor}
          items={units.map((u) => [u.name, u.name])}
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
      {canField("supplier") && (
        <div className="space-y-1">
          <Label>المورد</Label>
          <Input
            name="supplier"
            placeholder="اسم المورد أو الشركة"
            defaultValue={p?.supplier ?? ""}
          />
        </div>
      )}
      {!p && canField("quantity") && canAction("stocktake.adjust") && (
        <div className="col-span-2 space-y-2">
          <Label>الرصيد الافتتاحي في كل مستودع</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {warehouses.map((item) => (
              <div key={item.id} className="space-y-1">
                <Label htmlFor={`initial-stock-${item.id}`} className="text-xs">
                  {item.name}
                </Label>
                <Input
                  id={`initial-stock-${item.id}`}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={initialStocks[item.id] ?? ""}
                  onChange={(event) =>
                    setInitialStocks((values) => ({ ...values, [item.id]: event.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            يُسجل كل رصيد افتتاحي كحركة مخزون مستقلة للمستودع المختار.
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
