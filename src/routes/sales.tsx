import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle2,
  QrCode,
  AlertTriangle,
  UserPlus,
  Contact,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory, type Product } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { findByCode, PRICE_TIERS, type PriceKey } from "@/lib/inventory-utils";
import { isContactPickerSupported, pickPhoneContact } from "@/lib/contacts";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { enqueueRpc, isTransientNetworkError } from "@/lib/offline/rpc-queue";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sales")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: search["view"] === "invoice" ? ("invoice" as const) : ("pos" as const),
  }),
  head: () => ({
    meta: [
      { title: "وحدة المبيعات ونقطة البيع | نظام المخزون الذكي" },
      {
        name: "description",
        content:
          "نظام المبيعات الفوري مع شرائح الأسعار، الباركود، خصم المخزون والطباعة الحرارية وتحديث حسابات العملاء.",
      },
    ],
  }),
  component: SalesPage,
});

type CartItem = { product: Product; qty: number; price: number; tier: PriceKey };
type Customer = Tables<"customers">;
type SalesInvoice = Tables<"sales_invoices">;

function SalesPage() {
  const { canAction } = useAuth();
  const { products, warehouses, qty, reload, currencies, exchangeRates, settings } = useInventory();
  const { view } = Route.useSearch();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drafts, setDrafts] = useState<SalesInvoice[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [q, setQ] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showTierColumn, setShowTierColumn] = useState(true);
  const [warehouse, setWarehouse] = useState(() => warehouses[0]?.id || undefined);
  const [defaultTier, setDefaultTier] = useState<PriceKey>("price");
  const [currency, setCurrency] = useState("YER");
  const [paymentMethod, setPaymentMethod] = useState("نقدي YER");
  const [customerId, setCustomerId] = useState("");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [pendingCustomerOp, setPendingCustomerOp] = useState<{
    operationId: string;
    customerId: string;
  } | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    secondary_phone: "",
    address: "",
    customer_type: "credit" as "cash" | "credit" | "wholesale",
    credit_limit_yer: "500000",
  });
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const postingRef = useRef(false);

  const paymentMethods = (settings?.payment_methods as string[]) ?? [
    "نقدي YER",
    "سعودي SAR",
    "تحويلات شبكات محلية",
    "آجل",
  ];

  const refreshDrafts = useCallback(async () => {
    const { data, error } = await supabase
      .from("sales_invoices")
      .select("*")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) toast.error(`تعذر تحميل مسودات البيع: ${error.message}`);
    else setDrafts(data ?? []);
  }, []);

  useEffect(() => {
    void refreshDrafts();
    const channel = supabase
      .channel("sales-drafts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_invoices" },
        () => void refreshDrafts(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshDrafts]);

  useEffect(() => {
    let active = true;
    const loadCustomers = async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("active", true)
        .order("name");
      if (!active) return;
      if (error) toast.error(`تعذر تحميل العملاء: ${error.message}`);
      else setCustomers(data ?? []);
    };
    void loadCustomers();
    const channel = supabase
      .channel("sales-customers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => void loadCustomers(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!warehouse && warehouses[0]) setWarehouse(warehouses[0].id);
  }, [warehouses, warehouse]);

  const addToCart = useCallback(
    (p: Product, delta = 1, tier: PriceKey = defaultTier) => {
      const itemPrice = Number(p[tier] ?? p.price ?? 0);
      setCart((items) => {
        const idx = items.findIndex((i) => i.product.id === p.id && i.tier === tier);
        if (idx >= 0) {
          const next = [...items];
          const existing = next[idx];
          if (!existing) return items;
          const newQty = existing.qty + delta;
          if (newQty <= 0) return items.filter((_, i) => i !== idx);
          next[idx] = { ...existing, qty: newQty };
          return next;
        }
        if (delta <= 0) return items;
        return [...items, { product: p, qty: delta, price: itemPrice, tier }];
      });
      setQ("");
    },
    [defaultTier],
  );

  const onScan = useCallback(
    (code: string) => {
      const p = findByCode(products, code);
      if (p) {
        addToCart(p, 1, defaultTier);
        toast.success(`تمت الإضافة: ${p.name} (+1)`);
      } else {
        toast.error("الصنف غير موجود بالباركود المدخل");
      }
    },
    [products, addToCart, defaultTier],
  );

  function updateCartItem(index: number, patch: Partial<CartItem>) {
    setCart((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const discountVal = Number(discount) || 0;
  const taxVal = Number(tax) || 0;
  const netTotal = Math.max(0, subtotal - discountVal + taxVal);
  const activeCurrencies = currencies.filter((item) => item.active);
  const currentCurrency = activeCurrencies.find((item) => item.code === currency);
  const currentRate =
    currency === "YER"
      ? 1
      : exchangeRates.find((rate) => rate.currency_code === currency)?.rate_to_yer;
  const rateMissing =
    currentRate === undefined || !Number.isFinite(Number(currentRate)) || Number(currentRate) <= 0;
  const finalAmount = rateMissing ? 0 : netTotal / Number(currentRate);

  async function saveDraft(): Promise<string | null> {
    if (!canAction("sales.draft")) {
      toast.error("ليس لديك صلاحية حفظ مسودة بيع");
      return null;
    }
    if (savingRef.current) {
      toast.error("عملية حفظ قيد التنفيذ، يرجى الانتظار");
      return null;
    }
    savingRef.current = true;
    try {
      if (!cart.length) {
        toast.error("السلة فارغة");
        return null;
      }
      if (!warehouse || warehouse === "undefined" || warehouse === "null") {
        toast.error("الرجاء اختيار المستودع");
        return null;
      }
      if (rateMissing) {
        toast.error("لا يوجد سعر صرف صالح لهذه العملة");
        return null;
      }

      const selectedCustomer = customers.find((item) => item.id === customerId);
      const operationId = draftId ?? crypto.randomUUID();
      const args = {
        _id: operationId,
        _customer_id: selectedCustomer?.id?.trim() || null,
        _customer_name: selectedCustomer?.name ?? "",
        _warehouse: warehouse?.trim() || null,
        _currency_code: currency,
        _rate_to_yer: Number(currentRate),
        _payment_method: paymentMethod,
        _affects_drawer: paymentMethod.includes("نقدي") || paymentMethod.startsWith("سعودي"),
        _paid_amount: paymentMethod === "آجل" ? 0 : finalAmount,
        _discount_yer: discountVal,
        _tax_yer: taxVal,
        _notes: "",
        _items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.qty,
          unit_price_yer: item.price,
          price_tier: item.tier,
        })),
      };
      if (!navigator.onLine) {
        await enqueueRpc({ id: operationId, name: "save_sale_draft_offline", args: args as never });
        setDraftId(operationId);
        toast.success("تم حفظ مسودة البيع محليًا وستتم مزامنتها عند عودة الاتصال");
        return operationId;
      }
      try {
        const { data, error } = await supabase.rpc("save_sale_draft" as never, args as never);
        if (error) {
          // إذا كانت الفاتورة已 posts (ليست مسودة)، نفترض draftId غير صالح ونحاول بمعرف جديد
          if (
            /لا يمكن تعديل|غير مسودة|not a draft|already posted/i.test(error.message) &&
            draftId
          ) {
            setDraftId(null);
            return saveDraft();
          }
          if (/network|fetch|offline|failed/i.test(error.message)) {
            await enqueueRpc({
              id: operationId,
              name: "save_sale_draft_offline",
              args: args as never,
            });
            setDraftId(operationId);
            toast.success("تعذر الاتصال؛ حُفظت مسودة البيع محليًا للمزامنة");
            return operationId;
          }
          toast.error(`تعذر حفظ المسودة: ${error.message}`);
          return null;
        }
        setDraftId(data);
        void refreshDrafts();
        return data;
      } catch (error) {
        if (isTransientNetworkError(error)) {
          await enqueueRpc({
            id: operationId,
            name: "save_sale_draft_offline",
            args: args as never,
          });
          setDraftId(operationId);
          toast.success("انقطع الاتصال؛ حُفظت مسودة البيع محليًا للمزامنة");
          return operationId;
        }
        // إذا كانت الفاتورة已 posts، نفترض draftId غير صالح ونحاول بمعرف جديد
        if (
          /لا يمكن تعديل|غير مسودة|not a draft|already posted/i.test(
            error instanceof Error ? error.message : String(error),
          ) &&
          draftId
        ) {
          setDraftId(null);
          return saveDraft();
        }
        toast.error(
          `تعذر الاتصال لحفظ المسودة: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      }
    } finally {
      savingRef.current = false;
    }
  }

  async function postDraft(id: string) {
    if (!canAction("sales.post")) {
      toast.error("ليس لديك صلاحية ترحيل فاتورة البيع");
      return;
    }
    if (postingRef.current) {
      toast.error("عملية ترحيل قيد التنفيذ، يرجى الانتظار");
      return;
    }
    postingRef.current = true;
    try {
      const operationId = crypto.randomUUID();
      const args = { _operation_id: operationId, _id: id };
      try {
        if (!navigator.onLine) {
          await enqueueRpc({ id: operationId, name: "post_sale_offline", args });
          toast.success("تم حفظ طلب ترحيل الفاتورة محليًا للمزامنة");
          return;
        }
        const { error } = await supabase.rpc("post_sale_offline", args);
        if (error) {
          if (/network|fetch|offline|failed/i.test(error.message)) {
            await enqueueRpc({ id: operationId, name: "post_sale_offline", args });
            toast.success("تعذر الاتصال؛ حُفظ طلب الترحيل للمزامنة");
            return;
          }
          toast.error(`تعذر ترحيل الفاتورة؛ حُفظت كمسودة: ${error.message}`);
          return;
        }
        toast.success("تم ترحيل الفاتورة وتحديث المخزون والصندوق");
        setDraftId(null);
        void refreshDrafts();
        setCart([]);
        setDiscount("0");
        setTax("0");
        reload();
      } catch (error) {
        if (isTransientNetworkError(error)) {
          await enqueueRpc({ id: operationId, name: "post_sale_offline", args });
          toast.success("انقطع الاتصال؛ حُفظ طلب الترحيل للمزامنة");
          return;
        }
        toast.error(
          `تعذر الاتصال لترحيل الفاتورة؛ بقيت مسودة: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      postingRef.current = false;
    }
  }

  async function postSavedDraft() {
    if (!draftId) return;
    setBusy(true);
    try {
      await postDraft(draftId);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftOnly() {
    setBusy(true);
    try {
      const id = await saveDraft();
      if (id) toast.success("تم حفظ الفاتورة كمسودة");
    } finally {
      setBusy(false);
    }
  }

  async function postCurrentSale() {
    setBusy(true);
    try {
      const id = await saveDraft();
      if (id) await postDraft(id);
    } finally {
      setBusy(false);
    }
  }

  const resetNewCustomer = () => {
    setNewCustomer({
      name: "",
      phone: "",
      secondary_phone: "",
      address: "",
      customer_type: "credit",
      credit_limit_yer: "500000",
    });
  };

  useEffect(() => {
    if (!customerDialogOpen) setPendingCustomerOp(null);
  }, [customerDialogOpen]);

  const openCustomerDialog = () => {
    if (!pendingCustomerOp) {
      setPendingCustomerOp({ operationId: crypto.randomUUID(), customerId: crypto.randomUUID() });
    }
    setCustomerDialogOpen(true);
  };

  const importCustomerContact = async () => {
    if (!isContactPickerSupported()) {
      toast.error("استيراد جهات الاتصال غير مدعوم في هذا المتصفح");
      return;
    }
    const picked = await pickPhoneContact();
    if (!picked?.phone) {
      toast.error("لم يتم اختيار رقم هاتف صالح");
      return;
    }
    setNewCustomer((prev) => ({
      ...prev,
      phone: picked.phone,
      ...(picked.name && !prev.name.trim() ? { name: picked.name } : {}),
    }));
    toast.success("تم استيراد بيانات جهة الاتصال");
  };

  const saveNewCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (savingCustomer) return;
    if (!newCustomer.name.trim() || !newCustomer.phone.trim()) {
      toast.error("الاسم ورقم الهاتف مطلوبان");
      return;
    }
    const creditLimit = Number(newCustomer.credit_limit_yer);
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      toast.error("سقف المديونية يجب أن يكون رقماً موجباً أو صفراً");
      return;
    }
    setSavingCustomer(true);
    try {
      const pending = pendingCustomerOp ?? {
        operationId: crypto.randomUUID(),
        customerId: crypto.randomUUID(),
      };
      if (!pendingCustomerOp) setPendingCustomerOp(pending);
      const args = {
        _operation_id: pending.operationId,
        _id: pending.customerId,
        _name: newCustomer.name.trim(),
        _phone: newCustomer.phone.trim(),
        _secondary_phone: newCustomer.secondary_phone.trim() || "",
        _address: newCustomer.address.trim(),
        _customer_type: newCustomer.customer_type,
        _credit_limit_yer: creditLimit,
        _inactive_alert_enabled: true,
      };
      const cacheLocalCustomer = async () => {
        setCustomers((items) => [
          ...items,
          {
            id: pending.customerId,
            name: newCustomer.name.trim(),
            phone: newCustomer.phone.trim(),
            secondary_phone: newCustomer.secondary_phone.trim() || null,
            address: newCustomer.address.trim(),
            customer_type: newCustomer.customer_type,
            credit_limit_yer: Number(newCustomer.credit_limit_yer) || 0,
            balance_yer: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            active: true,
            inactive_alert_enabled: true,
            last_sale_at: null,
          },
        ]);
      };
      if (!navigator.onLine) {
        await enqueueRpc({ id: pending.operationId, name: "save_customer_offline", args });
        await cacheLocalCustomer();
        toast.success("تم حفظ العميل على الجهاز وسيُزامن عند عودة الاتصال");
        setCustomerDialogOpen(false);
        resetNewCustomer();
        return;
      }
      let customerResult: { data: string | null; error: { message: string } | null };
      try {
        customerResult = await supabase.rpc("save_customer_offline", args);
      } catch (networkError) {
        if (!isTransientNetworkError(networkError)) {
          toast.error(networkError instanceof Error ? networkError.message : "تعذر حفظ العميل");
          return;
        }
        await enqueueRpc({ id: pending.operationId, name: "save_customer_offline", args });
        await cacheLocalCustomer();
        toast.success("انقطع الاتصال؛ حُفظ العميل محليًا للمزامنة");
        setCustomerDialogOpen(false);
        resetNewCustomer();
        return;
      }
      const { data: savedCustomerId, error } = customerResult;
      if (error) {
        if (isTransientNetworkError(error)) {
          await enqueueRpc({ id: pending.operationId, name: "save_customer_offline", args });
          await cacheLocalCustomer();
          toast.success("تعذر الاتصال؛ حُفظ العميل محليًا للمزامنة");
          setCustomerDialogOpen(false);
          resetNewCustomer();
          return;
        }
        toast.error(`تعذر حفظ العميل: ${error.message}`);
        return;
      }
      if (!savedCustomerId) {
        toast.error("تمت العملية دون إرجاع معرف العميل؛ أعد تحميل القائمة عند الاتصال");
        return;
      }
      setCustomerId(savedCustomerId);
      setCustomers((items) => [
        ...items.filter((item) => item.id !== savedCustomerId),
        {
          id: savedCustomerId,
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim(),
          secondary_phone: newCustomer.secondary_phone.trim() || null,
          address: newCustomer.address.trim(),
          customer_type: newCustomer.customer_type,
          credit_limit_yer: Number(newCustomer.credit_limit_yer) || 0,
          balance_yer: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          active: true,
          inactive_alert_enabled: true,
          last_sale_at: null,
        },
      ]);
      setCustomerDialogOpen(false);
      resetNewCustomer();
    } finally {
      setSavingCustomer(false);
    }
  };

  async function loadDraft(invoice: SalesInvoice) {
    const { data, error } = await supabase
      .from("sales_items")
      .select("*")
      .eq("invoice_id", invoice.id);
    if (error) {
      toast.error(`تعذر تحميل أصناف المسودة: ${error.message}`);
      return;
    }
    const restored: CartItem[] = [];
    for (const line of data ?? []) {
      const product = products.find((item) => item.id === line.product_id);
      if (!product) {
        toast.error(`تعذر استعادة المسودة: الصنف ${line.product_id} غير متاح بصلاحياتك`);
        return;
      }
      const tier = PRICE_TIERS.find((item) => item.key === line.price_tier)?.key ?? "price";
      restored.push({
        product,
        qty: Number(line.quantity),
        price: Number(line.unit_price_yer),
        tier,
      });
    }
    setDraftId(invoice.id);
    setCart(restored);
    setCustomerId(invoice.customer_id ?? "");
    setWarehouse(invoice.warehouse_id);
    setCurrency(invoice.currency_code);
    setPaymentMethod(invoice.payment_method);
    setDiscount(String(invoice.discount_yer));
    setTax(String(invoice.tax_yer));
    toast.success(`تم تحميل مسودة الفاتورة #${invoice.number}`);
  }

  const storeInfo =
    "مكتبة ومحلات الإخوة - ذمار، جولة رداع، سوق عنس، أمام فندق الأهرام، ت: 777758043 - 771508085";

  // Auto-save draft to localStorage on every change, restore on mount
  useEffect(() => {
    const key = "sales_draft_v1";
    const save = () => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            cart,
            customerId,
            warehouse,
            currency,
            paymentMethod,
            discount,
            tax,
          }),
        );
      } catch {
        // ignore storage errors
      }
    };
    save();

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      save();
      e.preventDefault();
      e.returnValue = "";
    };
    const handlePageHide = () => save();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") save();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("visibilitychange", handleVisibilityChange);

    // Restore on mount
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.cart?.length) setCart(saved.cart);
        if (saved.customerId) setCustomerId(saved.customerId);
        if (saved.warehouse) setWarehouse(saved.warehouse);
        if (saved.currency) setCurrency(saved.currency);
        if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod);
        if (saved.discount !== undefined) setDiscount(String(saved.discount));
        if (saved.tax !== undefined) setTax(String(saved.tax));
      }
    } catch {
      // ignore restore errors
    }

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [cart, customerId, warehouse, currency, paymentMethod, discount, tax]);

  return (
    <AppShell title="وحدة المبيعات والفواتير (POS & NewInvoice)">
      {drafts.length > 0 && (
        <section className="mb-4 rounded-xl bg-card p-4 shadow-card">
          <h2 className="mb-3 font-bold">المسودات المحفوظة</h2>
          <div className="flex flex-wrap gap-2">
            {drafts.map((invoice) => (
              <Button
                key={invoice.id}
                type="button"
                variant={draftId === invoice.id ? "default" : "outline"}
                disabled={!products.length}
                onClick={() => void loadDraft(invoice)}
              >
                #{invoice.number} · {invoice.customer_name || "عميل نقدي"} ·{" "}
                {Number(invoice.total_yer).toFixed(2)} ر.ي
              </Button>
            ))}
          </div>
        </section>
      )}
      <Tabs defaultValue={view} dir="rtl" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="pos">نقطة البيع السريع (FastPOS)</TabsTrigger>
          <TabsTrigger value="invoice">فاتورة مبيعات تفصيلية (NewInvoice)</TabsTrigger>
        </TabsList>

        <TabsContent value="pos" className="space-y-4">
          <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-56">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    className="pr-10 h-11 bg-card text-base"
                    placeholder="امسح الباركود أو ابحث عن الصنف بالاسم أو الكود…"
                    value={q}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQ(val);
                      if (val.trim()) {
                        const matches = products.filter(
                          (p) =>
                            p.name.includes(val) ||
                            p.code?.includes(val) ||
                            p.barcode?.includes(val),
                        );
                        setSearchResults(matches.slice(0, 8));
                        setShowSearchDropdown(true);
                      } else {
                        setSearchResults([]);
                        setShowSearchDropdown(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const p =
                          findByCode(products, q) || products.find((x) => x.name.includes(q));
                        if (p) {
                          addToCart(p, 1, defaultTier);
                          setSearchResults([]);
                          setShowSearchDropdown(false);
                        } else {
                          toast.error("الصنف غير موجود");
                        }
                      }
                      if (e.key === "Escape") {
                        setSearchResults([]);
                        setShowSearchDropdown(false);
                      }
                    }}
                  />
                  {showSearchDropdown && searchResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto">
                      {searchResults.map((p) => {
                        const stock = qty(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              addToCart(p, 1, defaultTier);
                              setQ("");
                              setSearchResults([]);
                              setShowSearchDropdown(false);
                            }}
                            disabled={!stock || stock <= 0}
                            className={`w-full text-left p-3 hover:bg-accent flex justify-between items-center border-b last:border-b-0 ${
                              !stock || stock <= 0
                                ? "text-muted-foreground cursor-not-allowed opacity-50"
                                : "text-foreground cursor-pointer"
                            }`}
                          >
                            <div>
                              <div className="font-medium text-sm truncate">{p.name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {p.code ?? ""} · {p.barcode ?? ""}
                              </div>
                            </div>
                            {stock && stock > 0 ? (
                              <span className="text-xs font-bold text-primary">
                                {stock.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">نفد</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <BarcodeScanner onDetected={onScan} />
                <Select value={defaultTier} onValueChange={(v) => setDefaultTier(v as PriceKey)}>
                  <SelectTrigger className="w-36 bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICE_TIERS.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[70vh] overflow-y-auto p-2">
                {products
                  .filter(
                    (p) =>
                      !q || p.name.includes(q) || p.code?.includes(q) || p.barcode?.includes(q),
                  )
                  .slice(0, 36)
                  .map((p) => {
                    const stock = qty(p.id);
                    const lowStock =
                      Number(p.reorder_level) > 0 && stock <= Number(p.reorder_level);
                    return (
                      <button
                        key={p.id}
                        onClick={() => addToCart(p, 1, defaultTier)}
                        disabled={!stock || stock <= 0}
                        className={cn(
                          "rounded-xl p-3 text-right hover:border-primary border transition-all flex flex-col justify-between h-32 group",
                          !stock || stock <= 0
                            ? "bg-muted/50 text-muted-foreground cursor-not-allowed opacity-50"
                            : "bg-card shadow-sm border-border hover:bg-accent/50",
                          lowStock && "border-amber-200 hover:border-amber-400",
                        )}
                      >
                        <div className="font-semibold text-sm line-clamp-2 text-foreground">
                          {p.name}
                        </div>
                        <div className="mt-auto flex justify-between items-end pt-2">
                          <span className="text-primary font-bold text-sm">
                            {Number(p[defaultTier] ?? p.price).toLocaleString()} ر.ي
                          </span>
                          <Badge
                            variant={lowStock ? "destructive" : "secondary"}
                            className="text-xs px-2 py-1"
                          >
                            {lowStock ? "ناقص" : `رصيد: ${stock}`}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="rounded-xl bg-card shadow-card p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                  <ShoppingCart className="size-5 text-primary" /> سلة المبيعات الحالية
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto divide-y divide-border">
                  {cart.map((item, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-foreground truncate">
                          {item.product.name}
                          <span className="text-xs text-muted-foreground ml-1">
                            ({PRICE_TIERS.find((t) => t.key === item.tier)?.label})
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.price.toLocaleString()} ر.ي × {item.qty}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => addToCart(item.product, -1, item.tier)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <Input
                          className="w-16 h-8 text-center font-mono"
                          type="number"
                          min="0.01"
                          step="any"
                          aria-label={`كمية ${item.product.name}`}
                          value={item.qty}
                          onChange={(e) => {
                            const qty = Number(e.target.value);
                            if (Number.isFinite(qty) && qty > 0) updateCartItem(idx, { qty });
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => addToCart(item.product, 1, item.tier)}
                        >
                          <Plus className="size-3" />
                        </Button>
                      </div>
                      <Input
                        className="w-24 h-8 font-mono text-right"
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`سعر ${item.product.name}`}
                        value={item.price}
                        disabled={!canAction("sales.override_price")}
                        onChange={(e) => {
                          const price = Number(e.target.value);
                          if (Number.isFinite(price) && price >= 0) updateCartItem(idx, { price });
                        }}
                      />
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                      <ShoppingCart className="size-10 opacity-30" />
                      <p>السلة فارغة — امسح صنفاً للبدء</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-border">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>المستودع</Label>
                    <Select value={warehouse} onValueChange={setWarehouse}>
                      <SelectTrigger>
                        <SelectValue />
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
                  <div className="space-y-1">
                    <Label>طريقة الدفع</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((m: string) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>العميل</Label>
                    <Select
                      value={customerId}
                      onValueChange={(value) => setCustomerId(value === "__cash__" ? "" : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="عميل نقدي عام" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__cash__">عميل نقدي عام</SelectItem>
                        {customers.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>عملة الفاتورة</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activeCurrencies.map((item) => (
                          <SelectItem key={item.code} value={item.code}>
                            {item.name} ({item.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>الخصم</Label>
                    <Input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>الضريبة</Label>
                    <Input
                      type="number"
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="text-sm text-muted-foreground">الإجمالي النهائي:</span>
                  <span className="text-2xl font-bold text-primary font-display">
                    {finalAmount.toFixed(2)} {currentCurrency?.code ?? currency}
                  </span>
                </div>
                {rateMissing && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertTriangle className="size-4" />
                    لا يوجد سعر صرف صالح لهذه العملة. حدّثه من الإعدادات قبل إتمام البيع.
                  </p>
                )}

                <div className="grid gap-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={busy || rateMissing || !cart.length || !canAction("sales.draft")}
                    onClick={saveDraftOnly}
                  >
                    حفظ كمسودة
                  </Button>
                  {draftId && (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={busy || !canAction("sales.post")}
                      onClick={postSavedDraft}
                    >
                      ترحيل المسودة
                    </Button>
                  )}
                  <Button
                    className="w-full h-12 text-base font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
                    disabled={busy || rateMissing || !cart.length || !canAction("sales.post")}
                    onClick={postCurrentSale}
                  >
                    {busy ? "جاري الحفظ والترحيل..." : "حفظ وترحيل البيع"}
                  </Button>
                </div>
                <div className="text-[10px] text-center text-muted-foreground leading-tight mt-2">
                  {storeInfo}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="invoice" className="space-y-4">
          <div className="rounded-xl bg-card shadow-card p-6 space-y-4 max-w-4xl mx-auto">
            <div className="border-b pb-4 text-center">
              <h2 className="font-bold text-xl">{storeInfo}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                فاتورة مبيعات تفصيلية (NewInvoice)
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>العميل</Label>
                <Select
                  value={customerId || "__cash__"}
                  onValueChange={(value) => setCustomerId(value === "__cash__" ? "" : value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__cash__">عميل نقدي عام</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={openCustomerDialog}
                  disabled={!canAction("customers.manage")}
                >
                  <UserPlus className="size-4 ml-2" />
                  إضافة عميل جديد
                </Button>
              </div>
              <div className="space-y-1">
                <Label>مستودع الصرف</Label>
                <Select value={warehouse} onValueChange={setWarehouse}>
                  <SelectTrigger>
                    <SelectValue />
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
              <div className="space-y-1">
                <Label>شريحة الأسعار الافتراضية</Label>
                <Select value={defaultTier} onValueChange={(v) => setDefaultTier(v as PriceKey)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICE_TIERS.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>عملة الفاتورة</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeCurrencies.map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.name} ({item.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  className="h-11 bg-card"
                  placeholder="ابحث عن صنف لإضافته للفاتورة التفصيلية…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <BarcodeScanner onDetected={onScan} />
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right">الصنف</th>
                    {showTierColumn && <th className="p-3 text-right">الشريحة</th>}
                    <th className="p-3 text-right">السعر</th>
                    <th className="p-3 text-right">الكمية</th>
                    <th className="p-3 text-right">الإجمالي</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cart.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/50">
                      <td className="p-3 font-medium">{item.product.name}</td>
                      {showTierColumn && (
                        <td className="p-3 text-xs">
                          {PRICE_TIERS.find((t) => t.key === item.tier)?.label}
                        </td>
                      )}
                      <td className="p-3">
                        <Input
                          className="w-24 h-9"
                          type="number"
                          min="0"
                          step="any"
                          aria-label={`سعر ${item.product.name}`}
                          value={item.price}
                          disabled={!canAction("sales.override_price")}
                          onChange={(e) => {
                            const price = Number(e.target.value);
                            if (Number.isFinite(price) && price >= 0)
                              updateCartItem(idx, { price });
                          }}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => addToCart(item.product, -1, item.tier)}
                          >
                            <Minus className="size-3" />
                          </Button>
                          <Input
                            className="w-16 h-8 text-center"
                            type="number"
                            min="0.01"
                            step="any"
                            aria-label={`كمية ${item.product.name}`}
                            value={item.qty}
                            onChange={(e) => {
                              const qty = Number(e.target.value);
                              if (Number.isFinite(qty) && qty > 0) updateCartItem(idx, { qty });
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => addToCart(item.product, 1, item.tier)}
                          >
                            <Plus className="size-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="p-3 font-bold">{item.qty * item.price} ر.ي</td>
                      <td className="p-3">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setCart(cart.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {cart.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-muted-foreground">
                        لم يتم إضافة أصناف الفاتورة بعد
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-sm font-semibold">عدد الأصناف: {cart.length}</div>
              <div className="text-xl font-bold text-primary">
                المجموع الكلي: {finalAmount.toFixed(2)} {currentCurrency?.code ?? currency}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showTierColumn}
                  onChange={(e) => setShowTierColumn(e.target.checked)}
                  className="size-4 rounded"
                />
                <span>إظهار الشريحة على الفاتورة</span>
              </div>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="size-4 ml-1.5" /> طباعة حرارية
              </Button>
              <Button
                variant="outline"
                onClick={saveDraftOnly}
                disabled={busy || rateMissing || !cart.length || !canAction("sales.draft")}
              >
                حفظ مسودة
              </Button>
              {draftId && (
                <Button
                  variant="outline"
                  onClick={postSavedDraft}
                  disabled={busy || !canAction("sales.post")}
                >
                  ترحيل المسودة
                </Button>
              )}
              <Button
                onClick={postCurrentSale}
                disabled={busy || rateMissing || !cart.length || !canAction("sales.post")}
              >
                حفظ وترحيل الفاتورة
              </Button>
            </div>

            <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>إضافة عميل جديد</DialogTitle>
                  <DialogDescription>
                    أضف عميلاً جديداً من فاتورة البيع دون مغادرة الصفحة.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={saveNewCustomer} className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-customer-name">الاسم</Label>
                    <Input
                      id="new-customer-name"
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="new-customer-phone">الهاتف</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={importCustomerContact}
                        disabled={!isContactPickerSupported()}
                      >
                        <Contact className="size-4 ml-1" />
                        استيراد
                      </Button>
                    </div>
                    <Input
                      id="new-customer-phone"
                      type="tel"
                      dir="ltr"
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>الاسم الثانوي</Label>
                    <Input
                      value={newCustomer.secondary_phone}
                      onChange={(e) =>
                        setNewCustomer({ ...newCustomer, secondary_phone: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>العنوان</Label>
                    <Input
                      value={newCustomer.address}
                      onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>طبيعة العميل</Label>
                      <Select
                        value={newCustomer.customer_type}
                        onValueChange={(value) =>
                          setNewCustomer({
                            ...newCustomer,
                            customer_type: value as "cash" | "credit" | "wholesale",
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">نقدي</SelectItem>
                          <SelectItem value="credit">آجل</SelectItem>
                          <SelectItem value="wholesale">جملة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>سقف المديونية (ر.ي)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={newCustomer.credit_limit_yer}
                        onChange={(e) =>
                          setNewCustomer({ ...newCustomer, credit_limit_yer: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCustomerDialogOpen(false)}
                    >
                      إلغاء
                    </Button>
                    <Button
                      type="submit"
                      disabled={savingCustomer || !canAction("customers.manage")}
                    >
                      {savingCustomer ? "جاري الحفظ..." : "حفظ العميل"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
