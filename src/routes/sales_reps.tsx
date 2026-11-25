import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Plus,
  RotateCcw,
  Filter,
  CreditCard,
  Percent,
  Users,
  BadgeDollarSign,
  Tag,
  Loader2,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/hooks/use-inventory";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/sales_reps")({
  head: () => ({
    meta: [
      { title: "المناديب والعمولات | نظام المخزون الذكي" },
      {
        name: "description",
        content:
          "إدارة المناديب وحساب العمولات، فئات الأسعار، وتحديد السعر الحر للمدير مع توثيق الفروقات.",
      },
    ],
  }),
  component: SalesRepsPage,
});

type SalesRep = Tables<"sales_representatives">;
type RepCommission = Tables<"rep_commissions">;
type PriceCategory = Tables<"price_categories">;
type ProductFreePrice = Tables<"product_free_prices">;

function SalesRepsPage() {
  const { canAction, can } = useAuth();
  const { products } = useInventory();

  const [reps, setReps] = useState<SalesRep[]>([]);
  const [commissions, setCommissions] = useState<RepCommission[]>([]);
  const [priceCategories, setPriceCategories] = useState<PriceCategory[]>([]);
  const [freePrices, setFreePrices] = useState<ProductFreePrice[]>([]);
  const [invoices, setInvoices] = useState<
    { id: string; number: number; customer_name: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("reps");

  // Form states
  const [repFormOpen, setRepFormOpen] = useState(false);
  const [repName, setRepName] = useState("");
  const [repPhone, setRepPhone] = useState("");
  const [repCommissionRate, setRepCommissionRate] = useState("");
  const [repActive, setRepActive] = useState(true);
  const [editingRepId, setEditingRepId] = useState<string | null>(null);

  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categoryMultiplier, setCategoryMultiplier] = useState("1");
  const [categoryActive, setCategoryActive] = useState(true);

  // Commission calculation state
  const [calcRepId, setCalcRepId] = useState<string | null>(null);
  const [calcInvoiceId, setCalcInvoiceId] = useState<string | null>(null);

  const [freePriceProductId, setFreePriceProductId] = useState<string | null>(null);
  const [freePriceCategoryId, setFreePriceCategoryId] = useState<string | null>(null);
  const [freePriceValue, setFreePriceValue] = useState("");

  const loadData = useCallback(async () => {
    const [repsResult, commissionsResult, categoriesResult, freePricesResult, invoicesResult] =
      await Promise.all([
        supabase.from("sales_representatives").select("*").order("name"),
        supabase
          .from("rep_commissions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("price_categories").select("*").order("name"),
        supabase.from("product_free_prices").select("*"),
        supabase
          .from("sales_invoices")
          .select("id,number,customer_name")
          .eq("status", "posted")
          .order("posted_at", { ascending: false })
          .limit(200),
      ]);
    if (!repsResult.error) setReps(repsResult.data ?? []);
    if (!commissionsResult.error) setCommissions(commissionsResult.data ?? []);
    if (!categoriesResult.error) setPriceCategories(categoriesResult.data ?? []);
    if (!freePricesResult.error) setFreePrices(freePricesResult.data ?? []);
    if (!invoicesResult.error) setInvoices(invoicesResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    const channels = [
      supabase
        .channel("sales-reps")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sales_representatives" },
          () => void loadData(),
        )
        .subscribe(),
      supabase
        .channel("rep-commissions")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rep_commissions" },
          () => void loadData(),
        )
        .subscribe(),
      supabase
        .channel("price-categories")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "price_categories" },
          () => void loadData(),
        )
        .subscribe(),
      supabase
        .channel("product-free-prices")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "product_free_prices" },
          () => void loadData(),
        )
        .subscribe(),
    ];
    return () => {
      channels.forEach((ch) => void supabase.removeChannel(ch));
    };
  }, [loadData]);

  const totalCommission = useMemo(
    () => commissions.reduce((sum, c) => sum + Number(c.commission_amount), 0),
    [commissions],
  );
  const unpaidCommission = useMemo(
    () =>
      commissions.filter((c) => !c.paid).reduce((sum, c) => sum + Number(c.commission_amount), 0),
    [commissions],
  );

  async function saveRep() {
    if (!canAction("sales_reps.manage")) {
      toast.error("ليس لديك صلاحية إدارة المناديب");
      return;
    }
    const rate = Number(repCommissionRate);
    if (rate < 0 || rate > 100) {
      toast.error("نسبة العمولة يجب أن تكون بين 0 و 100");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_sales_representative", {
        _id: editingRepId ?? crypto.randomUUID(),
        _name: repName.trim(),
        _phone: repPhone.trim() || "",
        _commission_rate: rate,
        _active: repActive,
      });
      if (error) throw error;
      toast.success(editingRepId ? "تم تعديل المندوب" : "تم إضافة مندوب جديد");
      resetRepForm();
      setRepFormOpen(false);
    } catch (error) {
      toast.error(`تعذر حفظ المندوب: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function resetRepForm() {
    setRepName("");
    setRepPhone("");
    setRepCommissionRate("");
    setRepActive(true);
    setEditingRepId(null);
  }

  function editRep(rep: SalesRep) {
    setEditingRepId(rep.id);
    setRepName(rep.name);
    setRepPhone(rep.phone ?? "");
    setRepCommissionRate(String(rep.commission_rate));
    setRepActive(rep.active);
    setRepFormOpen(true);
  }

  async function deleteRep(id: string) {
    if (!confirm("تأكيد حذف المندوب؟")) return;
    const { error } = await supabase.from("sales_representatives").delete().eq("id", id);
    if (error) toast.error(`تعذر الحذف: ${error.message}`);
    else toast.success("تم حذف المندوب");
  }

  async function savePriceCategory() {
    if (!canAction("sales_reps.manage")) {
      toast.error("ليس لديك صلاحية إدارة فئات الأسعار");
      return;
    }
    const mult = Number(categoryMultiplier);
    if (!categoryName.trim()) {
      toast.error("أدخل اسم فئة السعر");
      return;
    }
    if (mult <= 0) {
      toast.error("معامل التحويل يجب أن يكون أكبر من صفر");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("price_categories").upsert({
        name: categoryName.trim(),
        description: categoryDescription.trim() || null,
        multiplier: mult,
        active: categoryActive,
      });
      if (error) throw error;
      toast.success("تم حفظ فئة السعر");
      setCategoryName("");
      setCategoryDescription("");
      setCategoryMultiplier("1");
      setCategoryActive(true);
      setCategoryFormOpen(false);
      void loadData();
    } catch (error) {
      toast.error(`تعذر حفظ فئة السعر: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function calculateCommission() {
    if (!canAction("sales_reps.manage")) {
      toast.error("ليس لديك صلاحية حساب العمولات");
      return;
    }
    if (!calcRepId || !calcInvoiceId) {
      toast.error("اختر المندوب والفاتورة أولاً");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("calculate_rep_commission", {
        _rep_id: calcRepId,
        _sale_invoice_id: calcInvoiceId,
      });
      if (error) throw error;
      toast.success("تم حساب العمولة");
      setCalcRepId(null);
      setCalcInvoiceId(null);
      void loadData();
    } catch (error) {
      toast.error(`تعذر حساب العمولة: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function payCommission(commission: RepCommission) {
    if (!canAction("sales_reps.manage")) {
      toast.error("ليس لديك صلاحية دفع العمولات");
      return;
    }
    if (!confirm(`تأكيد دفع عمولة قدرها ${commission.commission_amount} للمندوب؟`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("pay_rep_commission", {
        _commission_id: commission.id,
        _payment_method: "نقدي",
      });
      if (error) throw error;
      toast.success("تم دفع العمولة وإنشاء حركة الصندوق");
      void loadData();
    } catch (error) {
      toast.error(`تعذر دفع العمولة: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function setFreePrice(productId: string, categoryId: string) {
    if (!canAction("sales.override_price")) {
      toast.error("تحديد السعر الحر صلاحية المدير فقط");
      return;
    }
    const price = Number(freePriceValue);
    if (price < 0) {
      toast.error("أدخل سعرًا صحيحًا");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_product_free_price", {
        _product_id: productId,
        _price_category_id: categoryId,
        _free_price: price,
      });
      if (error) throw error;
      toast.success("تم تحديد السعر الحر وتوثيق الفرق عن السعر الافتراضي");
      setFreePriceProductId(null);
      setFreePriceCategoryId(null);
      setFreePriceValue("");
      void loadData();
    } catch (error) {
      toast.error(`تعذر تعيين السعر: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  const fmtMoney = (val: number) =>
    val.toLocaleString("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ريال";

  const repMap = useMemo(() => new Map(reps.map((r) => [r.id, r.name])), [reps]);

  return (
    <AppShell title="المناديب والعمولات" roles={["storekeeper"]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">المناديب والعمولات</h2>
            <p className="text-sm text-muted-foreground">
              إدارة المناديب، حساب العمولات، فئات الأسعار، والسعر الحر للمدير.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setActiveTab("reps")} disabled={!canAction("sales_reps.manage")}>
              <Plus className="size-4" /> مندوب جديد
            </Button>
          </div>
        </div>

        <Tabs defaultValue="reps" onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex-wrap">
            <TabsTrigger value="reps">
              <Users className="size-4 mr-2" /> المناديب
            </TabsTrigger>
            <TabsTrigger value="commissions">
              <Percent className="size-4 mr-2" /> العمولات
            </TabsTrigger>
            <TabsTrigger value="price_categories">
              <BadgeDollarSign className="size-4 mr-2" /> فئات الأسعار
            </TabsTrigger>
            <TabsTrigger value="free_prices">
              <Tag className="size-4 mr-2" /> السعر الحر
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reps">
            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-card p-4 shadow-card space-y-3">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <Label>اسم المندوب</Label>
                    <Input
                      value={repName}
                      onChange={(e) => setRepName(e.target.value)}
                      placeholder="اسم المندوب"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>الهاتف</Label>
                    <Input
                      value={repPhone}
                      onChange={(e) => setRepPhone(e.target.value)}
                      placeholder="رقم الهاتف"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>نسبة العمولة (%)</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={repCommissionRate}
                      onChange={(e) => setRepCommissionRate(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>نشط</Label>
                    <Select
                      value={repActive ? "true" : "false"}
                      onValueChange={(v) => setRepActive(v === "true")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">نعم</SelectItem>
                        <SelectItem value="false">لا</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={saveRep} disabled={busy || !canAction("sales_reps.manage")}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CreditCard className="size-4" />
                  )}
                  {editingRepId ? "تعديل المندوب" : "إضافة مندوب"}
                </Button>
                {!editingRepId && (
                  <Button variant="outline" size="sm" onClick={resetRepForm}>
                    إلغاء
                  </Button>
                )}
              </div>

              <div className="rounded-xl bg-card shadow-card">
                <div className="border-b p-4">
                  <h3 className="font-bold">قائمة المناديب</h3>
                  <p className="text-sm text-muted-foreground">
                    {reps.length} مندوب · العمولة غير المدفوعة: {fmtMoney(unpaidCommission)}
                  </p>
                </div>
                {loading ? (
                  <p className="p-8 text-center text-muted-foreground">جارٍ التحميل…</p>
                ) : reps.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">لا يوجد مندوبون مضافون.</p>
                ) : (
                  <div className="divide-y">
                    {reps.map((rep) => (
                      <div
                        key={rep.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                      >
                        <div className="flex-1 min-w-48">
                          <div className="font-medium">{rep.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {rep.phone || "بدون هاتف"} · نسبة العمولة: {rep.commission_rate}%
                          </div>
                          <div className="text-xs">
                            {rep.active ? (
                              <span className="text-success">نشط</span>
                            ) : (
                              <span className="text-destructive">غير نشط</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => editRep(rep)}
                            disabled={!canAction("sales_reps.manage")}
                          >
                            <ShieldCheck className="size-4" /> تعديل
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteRep(rep.id)}
                            disabled={!canAction("sales_reps.manage")}
                            aria-label="حذف المندوب"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="commissions">
            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-card p-4 shadow-card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">إجمالي العمولات</h3>
                    <p className="text-sm text-muted-foreground">
                      تم حساب: {fmtMoney(totalCommission)} · غير مدفوع: {fmtMoney(unpaidCommission)}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <Label>اختر المندوب</Label>
                    <Select value={calcRepId ?? ""} onValueChange={setCalcRepId}>
                      <SelectTrigger>
                        <SelectValue placeholder="المندوب" />
                      </SelectTrigger>
                      <SelectContent>
                        {reps.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name} ({r.commission_rate}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>اختر الفاتورة</Label>
                    <Select value={calcInvoiceId ?? ""} onValueChange={setCalcInvoiceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="الفاتورة" />
                      </SelectTrigger>
                      <SelectContent>
                        {invoices.map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            #{inv.number} — {inv.customer_name ?? "عميل نقدي"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>&nbsp;</Label>
                    <Button
                      onClick={calculateCommission}
                      disabled={
                        busy || !canAction("sales_reps.manage") || !calcRepId || !calcInvoiceId
                      }
                    >
                      <Percent className="size-4 mr-2" /> حساب العمولة
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-card shadow-card">
                <div className="border-b p-4">
                  <h3 className="font-bold">سجل العمولات</h3>
                </div>
                {loading ? (
                  <p className="p-8 text-center text-muted-foreground">جارٍ التحميل…</p>
                ) : commissions.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">لا توجد عمولات مسجلة.</p>
                ) : (
                  <div className="divide-y">
                    {commissions.map((comm) => (
                      <div
                        key={comm.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                      >
                        <div className="flex-1 min-w-48">
                          <div className="font-medium">{repMap.get(comm.rep_id) ?? "مندوب"}</div>
                          <div className="text-xs text-muted-foreground">
                            فاتورة: {comm.sale_invoice_id ?? "—"} · الفترة:{" "}
                            {new Date(comm.period_month).toLocaleDateString("ar", {
                              dateStyle: "medium",
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-medium ${comm.paid ? "text-success" : "text-destructive"}`}
                          >
                            {comm.paid ? "مدفوع" : "غير مدفوع"} ·{" "}
                            {fmtMoney(Number(comm.commission_amount))}
                          </span>
                          {!comm.paid && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => payCommission(comm)}
                              disabled={busy || !canAction("sales_reps.manage")}
                            >
                              <CreditCard className="size-4" /> دفع
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="price_categories">
            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-card p-4 shadow-card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">فئات الأسعار</h3>
                    <p className="text-sm text-muted-foreground">
                      تصنيف الأصناف حسب فئات السعر لتمكين السعر الحر لكل فئة.
                    </p>
                  </div>
                </div>
                <div className="rounded-xl bg-card p-4 shadow-card space-y-3">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="space-y-1">
                      <Label>اسم الفئة</Label>
                      <Input
                        value={categoryName}
                        onChange={(e) => setCategoryName(e.target.value)}
                        placeholder="مثال: جملة، تجزئة، تعديل"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>وصف الفئة</Label>
                      <Input
                        value={categoryDescription}
                        onChange={(e) => setCategoryDescription(e.target.value)}
                        placeholder="وصف اختياري"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>المعامل</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={categoryMultiplier}
                        onChange={(e) => setCategoryMultiplier(e.target.value)}
                        placeholder="1"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>نشط</Label>
                      <Select
                        value={categoryActive ? "true" : "false"}
                        onValueChange={(v) => setCategoryActive(v === "true")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">نعم</SelectItem>
                          <SelectItem value="false">لا</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    onClick={savePriceCategory}
                    disabled={busy || !canAction("sales_reps.manage")}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CreditCard className="size-4" />
                    )}
                    حفظ فئة السعر
                  </Button>
                </div>
                {priceCategories.length === 0 ? (
                  <p className="p-8 text-center text-muted-foreground">لا توجد فئات أسعار مضافة.</p>
                ) : (
                  <div className="divide-y">
                    {priceCategories.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                      >
                        <div className="flex-1 min-w-48">
                          <div className="font-medium">{cat.name}</div>
                          <div className="text-xs text-muted-foreground">
                            معامل: {cat.multiplier} · {cat.active ? "نشط" : "غير نشط"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="free_prices">
            <div className="mt-4 space-y-4">
              <div className="rounded-xl bg-card p-4 shadow-card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">تحديد السعر الحر</h3>
                    <p className="text-sm text-muted-foreground">
                      هذه الصلاحية للمدير فقط. يحدد سعرًا حرًا لكل صنف ضمن فئة سعر معينة، مع توثيق
                      الفرق عن السعر الافتراضي.
                    </p>
                    {!can("admin") && (
                      <p className="text-sm text-warning">
                        تحتاج صلاحية المدير (override_price) لتحديد الأسعار الحرة.
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <Label>الصنف</Label>
                    <Select
                      value={freePriceProductId ?? ""}
                      onValueChange={(v) => setFreePriceProductId(v || null)}
                      disabled={!can("admin")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الصنف" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>فئة السعر</Label>
                    <Select
                      value={freePriceCategoryId ?? ""}
                      onValueChange={(v) => setFreePriceCategoryId(v || null)}
                      disabled={!can("admin")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="الفئة" />
                      </SelectTrigger>
                      <SelectContent>
                        {priceCategories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>السعر الحر</Label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={freePriceValue}
                      onChange={(e) => setFreePriceValue(e.target.value)}
                      disabled={!can("admin")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>&nbsp;</Label>
                    <Button
                      onClick={() => {
                        if (!freePriceProductId || !freePriceCategoryId) return;
                        setFreePrice(freePriceProductId, freePriceCategoryId);
                      }}
                      disabled={
                        busy ||
                        !can("admin") ||
                        !freePriceProductId ||
                        !freePriceCategoryId ||
                        !freePriceValue
                      }
                    >
                      <Tag className="size-4 mr-2" /> تعيين السعر الحر
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl bg-card shadow-card">
                  <div className="border-b p-4">
                    <h3 className="font-bold">الأسعار الحرة المسجلة</h3>
                    <p className="text-sm text-muted-foreground">
                      توثيق الفرق بين السعر الحر والسعر الافتراضي لكل صنف.
                    </p>
                  </div>
                  {freePrices.length === 0 ? (
                    <p className="p-8 text-center text-muted-foreground">
                      لا توجد أسعار حرة مسجلة.
                    </p>
                  ) : (
                    <div className="divide-y">
                      {freePrices.map((fp) => {
                        const product = products.find((p) => p.id === fp.product_id);
                        const category = priceCategories.find((c) => c.id === fp.price_category_id);
                        return (
                          <div
                            key={`${fp.product_id}-${fp.price_category_id}`}
                            className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                          >
                            <div className="flex-1 min-w-64">
                              <div className="font-medium">{product?.name ?? "صنف غير معروف"}</div>
                              <div className="text-xs text-muted-foreground">
                                {category?.name ?? "فئة غير معروفة"}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{fmtMoney(Number(fp.free_price))}</span>
                              <span
                                className={`text-xs ${Number(fp.price_difference) >= 0 ? "text-success" : "text-destructive"}`}
                              >
                                {fp.price_difference >= 0 ? "+" : ""}
                                {fmtMoney(Number(fp.price_difference))} عن الافتراضي
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
