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

type CartItem = {
  product: Product;
  qty: number;
  price: number;
  tier: PriceKey;
  warehouseId: string;
  unitName: string;
  bonusQty: number;
  lineDiscountYER: number;
  lineTaxYER: number;
  note: string;
};
type Customer = Tables<"customers">;
type SalesInvoice = Tables<"sales_invoices">;
type SalesItemRow = Tables<"sales_items">;
type SalesSettingsRow = {
  id: string;
  default_customer_id: string | null;
  default_warehouse_id: string | null;
  is_customer_required: boolean;
  is_warehouse_required: boolean;
  apply_to_quick_sales: boolean;
  apply_to_new_invoice: boolean;
  default_currency_code?: string | null;
  is_currency_required?: boolean;
  default_payment_method?: string | null;
  is_payment_method_required?: boolean;
  auto_add_on_scan?: boolean;
};
type SalesDefaultRow = Tables<"sales_defaults">;
type ScannerSettingRow = Tables<"scanner_settings">;
type PrintSettingRow = Tables<"print_settings">;
type AppSettingsRow = Tables<"app_settings">;

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
  const [warehouse, setWarehouse] = useState<string | undefined>(() => warehouses[0]?.id);
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
  const [documentDate, setDocumentDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [isBackdated, setIsBackdated] = useState(false);
  const [backdateReason, setBackdateReason] = useState("");
  const savingRef = useRef(false);
  const postingRef = useRef(false);
  const [salesSettings, setSalesSettings] = useState<SalesSettingsRow | null>(null);
  const [salesDefault, setSalesDefault] = useState<SalesDefaultRow | null>(null);
  const [scannerSetting, setScannerSetting] = useState<ScannerSettingRow | null>(null);
  const [printSetting, setPrintSetting] = useState<PrintSettingRow | null>(null);
  const [establishment, setEstablishment] = useState<AppSettingsRow | null>(null);
  const salesDefaultsAppliedRef = useRef(false);

  const paymentMethods = (settings?.payment_methods as string[]) ?? [
    "نقدي YER",
    "سعودي SAR",
    "تحويلات شبكات محلية",
    "آجل",
  ];

  useEffect(() => {
    let active = true;
    const loadSettings = async () => {
      const { data, error } = await (
        supabase.from("sales_settings" as never) as never as {
          select: (s: string) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => {
              limit: (n: number) => {
                maybeSingle: () => Promise<{
                  data: SalesSettingsRow | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        }
      )
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error(error);
        setSalesSettings(null);
        return;
      }
      setSalesSettings((data as SalesSettingsRow) ?? null);
    };
    void loadSettings();
    const ch = supabase
      .channel("sales-settings-sales-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_settings" },
        () => void loadSettings(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadSalesDefaults = async () => {
      const pageType = view === "invoice" ? "sales_invoice" : "quick_sales";
      const { data, error } = await supabase
        .from("sales_defaults")
        .select("*")
        .eq("page_type", pageType)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error(error);
        setSalesDefault(null);
        return;
      }
      setSalesDefault((data as SalesDefaultRow) ?? null);
    };
    void loadSalesDefaults();
    const ch = supabase
      .channel("sales-defaults-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_defaults" },
        () => void loadSalesDefaults(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(ch);
    };
  }, [view]);

  useEffect(() => {
    let active = true;
    const loadScanner = async () => {
      const { data, error } = await supabase
        .from("scanner_settings")
        .select("*")
        .eq("page_path", "/sales")
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error(error);
        setScannerSetting(null);
        return;
      }
      setScannerSetting((data as ScannerSettingRow) ?? null);
    };
    void loadScanner();
    const ch = supabase
      .channel("scanner-settings-sales")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scanner_settings" },
        () => void loadScanner(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadPrint = async () => {
      const { data, error } = await supabase
        .from("print_settings")
        .select("*")
        .eq("document_type", "invoice")
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error(error);
        setPrintSetting(null);
        return;
      }
      setPrintSetting((data as PrintSettingRow) ?? null);
    };
    void loadPrint();
    const ch = supabase
      .channel("print-settings-invoice-sales")
      .on("postgres_changes", { event: "*", schema: "public", table: "print_settings" }, () => void loadPrint())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadApp = async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (!active) return;
      if (error) {
        console.error(error);
        setEstablishment(null);
        return;
      }
      setEstablishment((data as AppSettingsRow) ?? null);
    };
    void loadApp();
    const ch = supabase
      .channel("app-settings-sales")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, () => void loadApp())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    if (!salesSettings) return;
    const isQuick = view !== "invoice";
    const allowed =
      (isQuick && salesSettings.apply_to_quick_sales) ||
      (!isQuick && salesSettings.apply_to_new_invoice);
    if (!allowed) return;
    if (salesSettings.default_warehouse_id) {
      const exists = warehouses.some((w) => w.id === salesSettings.default_warehouse_id);
      if (exists) setWarehouse((prev) => prev ?? salesSettings.default_warehouse_id ?? undefined);
    }
    if (salesSettings.default_customer_id && !customerId) {
      setCustomerId(salesSettings.default_customer_id);
    }
    if (
      salesSettings.default_currency_code &&
      currencies.some((c) => c.code === salesSettings.default_currency_code && c.active)
    ) {
      setCurrency((prev) =>
        prev === "YER" && salesSettings.default_currency_code
          ? salesSettings.default_currency_code
          : prev,
      );
    }
    if (
      salesSettings.default_payment_method &&
      paymentMethods.includes(salesSettings.default_payment_method)
    ) {
      setPaymentMethod((prev) =>
        prev === "نقدي YER" ? salesSettings.default_payment_method! : prev,
      );
    }
  }, [salesSettings, view, warehouses, customerId, currencies, paymentMethods]);

  useEffect(() => {
    if (!salesDefault) return;
    if (salesDefault.default_tier) setDefaultTier(salesDefault.default_tier as PriceKey);
    if (
      salesDefault.default_currency_code &&
      currencies.some((c) => c.code === salesDefault.default_currency_code && c.active)
    ) {
      setCurrency(salesDefault.default_currency_code);
    }
    if (
      salesDefault.default_payment_method &&
      paymentMethods.includes(salesDefault.default_payment_method)
    ) {
      setPaymentMethod(salesDefault.default_payment_method);
    }
    setDiscount(String(salesDefault.default_discount ?? 0));
    setTax(String(salesDefault.default_tax ?? 0));
  }, [salesDefault, currencies, paymentMethods]);

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
    (p: Product, delta = 1, tier: PriceKey = defaultTier, whId?: string) => {
      const itemPrice = Number(p[tier] ?? p.price ?? 0);
      const lineWh = whId ?? warehouse ?? p.warehouse_id ?? warehouses[0]?.id ?? "";
      const baseUnit = p.unit ?? p.major_unit ?? "حبة";
      setCart((items) => {
        const idx = items.findIndex(
          (i) => i.product.id === p.id && i.tier === tier && i.warehouseId === lineWh,
        );
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
        if (!lineWh) {
          toast.error("اختر مستودعاً أولاً قبل الإضافة");
          return items;
        }
        return [
          ...items,
          {
            product: p,
            qty: delta,
            price: itemPrice,
            tier,
            warehouseId: lineWh,
            unitName: baseUnit,
            bonusQty: 0,
            lineDiscountYER: 0,
            lineTaxYER: 0,
            note: "",
          },
        ];
      });
      setQ("");
    },
    [defaultTier, warehouse, warehouses],
  );

  const onScan = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      const p = findByCode(products, trimmed);
      const action = scannerSetting?.scanner_action ?? "add_to_cart";
      const autoExec = scannerSetting?.auto_execute !== false;
      const autoAddFromDefaults =
        (salesDefault as (SalesDefaultRow & { auto_add_on_scan?: boolean }) | null)
          ?.auto_add_on_scan ??
        salesSettings?.auto_add_on_scan ??
        true;
      if (scannerSetting?.beep_on_scan) {
        try {
          const ctx = new (
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          )();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          gain.gain.value = 0.08;
          osc.start();
          osc.stop(ctx.currentTime + 0.08);
        } catch {
          /* ignore */
        }
      }
      if (scannerSetting?.vibrate_on_scan && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(60);
        } catch {
          /* ignore */
        }
      }
      if (action === "none") {
        toast.message("ماسح الباركود معطّل في هذه الصفحة من الإعدادات");
        return;
      }
      if (action === "open_page") {
        const target = scannerSetting?.target_page;
        if (target) window.location.href = target;
        else toast.error("لم يتم تحديد صفحة الهدف في إعدادات الماسح");
        return;
      }
      if (!p) {
        toast.error("الصنف غير موجود بالباركود المدخل");
        return;
      }
      if (action === "find_product" || action === "search_invoice") {
        setQ(p.name);
        setShowSearchDropdown(false);
        toast.success(`تم العثور على: ${p.name}`);
        return;
      }
      // add_to_cart (default)
      if (!autoExec) {
        setQ(p.name);
        toast.message("تم المسح (التنفيذ التلقائي معطّل). أضف يدوياً من القائمة.");
        return;
      }
      if (!autoAddFromDefaults) {
        setQ(p.name);
        toast.message("الإضافة التلقائية بالمسح معطّلة من إعدادات المبيعات. أضف يدوياً.");
        return;
      }
      const wh = warehouse ?? p.warehouse_id ?? warehouses[0]?.id;
      const stockAtWh = qty(p.id, wh);
      if (!stockAtWh || stockAtWh <= 0) {
        toast.error(`لا يوجد رصيد كافٍ للصنف في المستودع المحدد: ${p.name}`);
        return;
      }
      addToCart(p, 1, defaultTier, wh);
      toast.success(`تمت الإضافة: ${p.name} (+1)`);
    },
    [products, addToCart, defaultTier, scannerSetting, salesDefault, salesSettings, qty],
  );

  function updateCartItem(index: number, patch: Partial<CartItem>) {
    setCart((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  const subtotal = cart.reduce(
    (s, i) =>
      s +
      Math.max(0, i.qty * i.price - (Number(i.lineDiscountYER) || 0) + (Number(i.lineTaxYER) || 0)),
    0,
  );
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

      const isQuick = view !== "invoice";
      const allowedBySettings =
        !salesSettings ||
        (isQuick ? salesSettings.apply_to_quick_sales : salesSettings.apply_to_new_invoice);
      let effectiveCustomerId = customerId.trim();
      let effectiveWarehouseId = (warehouse ?? "").trim();
      if (allowedBySettings && salesSettings) {
        if (salesSettings.is_customer_required) {
          if (
            !effectiveCustomerId ||
            effectiveCustomerId === "undefined" ||
            effectiveCustomerId === "null"
          ) {
            toast.error("يجب اختيار العميل");
            return null;
          }
        } else {
          if (
            (!effectiveCustomerId ||
              effectiveCustomerId === "undefined" ||
              effectiveCustomerId === "null") &&
            salesSettings.default_customer_id
          ) {
            effectiveCustomerId = salesSettings.default_customer_id;
          }
        }
        if (salesSettings.is_warehouse_required) {
          if (
            !effectiveWarehouseId ||
            effectiveWarehouseId === "undefined" ||
            effectiveWarehouseId === "null"
          ) {
            toast.error("يجب اختيار المستودع");
            return null;
          }
        } else {
          if (
            (!effectiveWarehouseId ||
              effectiveWarehouseId === "undefined" ||
              effectiveWarehouseId === "null") &&
            salesSettings.default_warehouse_id
          ) {
            effectiveWarehouseId = salesSettings.default_warehouse_id;
          }
        }
        if (salesSettings.is_currency_required) {
          const hasCur = activeCurrencies.some((c) => c.code === currency);
          if (!hasCur) {
            toast.error("يجب اختيار العملة وفق إعدادات المبيعات");
            return null;
          }
          if (
            salesSettings.default_currency_code &&
            currencies.some((c) => c.code === salesSettings.default_currency_code && c.active)
          ) {
            // keep user choice if valid; no override
          }
        } else if (
          salesSettings.default_currency_code &&
          currencies.some((c) => c.code === salesSettings.default_currency_code && c.active)
        ) {
          if (!currency || currency === "YER") {
            /* allow keeping existing default flow */
          }
        }
        if (salesSettings.is_payment_method_required) {
          if (!paymentMethod || !paymentMethods.includes(paymentMethod)) {
            toast.error("يجب اختيار طريقة دفع صالحة");
            return null;
          }
        }
      } else {
        if (
          !effectiveWarehouseId ||
          effectiveWarehouseId === "undefined" ||
          effectiveWarehouseId === "null"
        ) {
          toast.error("الرجاء اختيار المستودع");
          return null;
        }
      }
      if (
        !effectiveWarehouseId ||
        effectiveWarehouseId === "undefined" ||
        effectiveWarehouseId === "null"
      ) {
        toast.error("الرجاء اختيار المستودع");
        return null;
      }
      const selectedCustomer = customers.find((item) => item.id === effectiveCustomerId);
      const customerIdRaw = (selectedCustomer?.id ?? effectiveCustomerId ?? "").trim();
      const customerIdArg =
        customerIdRaw && customerIdRaw !== "undefined" && customerIdRaw !== "null"
          ? customerIdRaw
          : null;
      const warehouseArg = effectiveWarehouseId;
      const currentRateCalc =
        currency === "YER"
          ? 1
          : exchangeRates.find((rate) => rate.currency_code === currency)?.rate_to_yer;
      const rateMissingCalc =
        currentRateCalc === undefined ||
        !Number.isFinite(Number(currentRateCalc)) ||
        Number(currentRateCalc) <= 0;
      const finalAmountCalc = rateMissingCalc ? 0 : netTotal / Number(currentRateCalc);
      if (rateMissingCalc) {
        toast.error("لا يوجد سعر صرف صالح لهذه العملة");
        return null;
      }
      const operationId = draftId ?? crypto.randomUUID();
      const args: Record<string, unknown> = {
        _id: operationId,
        _customer_id: customerIdArg,
        _customer_name: selectedCustomer?.name ?? "",
        _warehouse: warehouseArg,
        _currency_code: currency,
        _rate_to_yer: Number(currentRateCalc),
        _payment_method: paymentMethod,
        _affects_drawer: paymentMethod.includes("نقدي") || paymentMethod.startsWith("سعودي"),
        _paid_amount: paymentMethod === "آجل" ? 0 : finalAmountCalc,
        _discount_yer: discountVal,
        _tax_yer: taxVal,
        _notes: "",
        _items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.qty,
          unit_price_yer: item.price,
          price_tier: item.tier,
          warehouse_id: item.warehouseId || warehouseArg,
          unit_name: item.unitName || item.product.unit || null,
          bonus_qty: item.bonusQty || 0,
          line_discount_yer: item.lineDiscountYER || 0,
          line_tax_yer: item.lineTaxYER || 0,
          note: item.note || null,
        })),
        _document_date: documentDate || null,
        _is_backdated: isBackdated || documentDate !== new Date().toISOString().slice(0, 10),
        _backdate_reason: backdateReason.trim() || null,
        _manual_number: null,
      };
      if (!navigator.onLine) {
        await enqueueRpc({
          id: operationId,
          name: "save_sale_draft_offline",
          args: args as never,
        });
        setDraftId(operationId);
        toast.success("تم حفظ مسودة البيع محليًا وستتم مزامنتها عند عودة الاتصال");
        return operationId;
      }
      try {
        const { data, error } = await supabase.rpc("save_sale_draft" as never, args as never);
        if (error) {
          if (
            /لا يمكن تعديل|غير مسودة|not a draft|already posted/i.test(error.message) &&
            draftId
          ) {
            setDraftId(null);
            const retryId = crypto.randomUUID();
            try {
              const retryArgs: Record<string, unknown> = { ...args, _id: retryId };
              const retry = await supabase.rpc("save_sale_draft" as never, retryArgs as never);
              if (retry.error) {
                toast.error(`تعذر حفظ المسودة: ${retry.error.message}`);
                return null;
              }
              setDraftId(retry.data);
              void refreshDrafts();
              toast.success("تم إنشاء مسودة جديدة (المسودة السابقة لم تعد قابلة للتعديل)");
              return retry.data;
            } catch {
              toast.error("تعذر إنشاء مسودة جديدة بعد فقدان صلاحية المسودة السابقة");
              return null;
            }
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
        if (
          /لا يمكن تعديل|غير مسودة|not a draft|already posted/i.test(
            error instanceof Error ? error.message : String(error),
          ) &&
          draftId
        ) {
          setDraftId(null);
          toast.error("المسودة السابقة لم تعد قابلة للتعديل. أنشئ مسودة جديدة وحاول مرة أخرى.");
          return null;
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
      const lr = line as SalesItemRow & {
        warehouse_id?: string | null;
        unit_name?: string | null;
        bonus_qty?: number | null;
        line_discount_yer?: number | null;
        line_tax_yer?: number | null;
        note?: string | null;
      };
      restored.push({
        product,
        qty: Number(line.quantity),
        price: Number(line.unit_price_yer),
        tier,
        warehouseId: lr.warehouse_id ?? invoice.warehouse_id,
        unitName: lr.unit_name ?? product.unit ?? "حبة",
        bonusQty: Number(lr.bonus_qty ?? 0),
        lineDiscountYER: Number(lr.line_discount_yer ?? 0),
        lineTaxYER: Number(lr.line_tax_yer ?? 0),
        note: lr.note ?? "",
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
    const invExt = invoice as SalesInvoice & {
      document_date?: string | null;
      is_backdated?: boolean | null;
      backdate_reason?: string | null;
    };
    setDocumentDate(
      invExt.document_date ??
        invoice.created_at?.slice(0, 10) ??
        new Date().toISOString().slice(0, 10),
    );
    setIsBackdated(Boolean(invExt.is_backdated));
    setBackdateReason(invExt.backdate_reason ?? "");
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
                          onClick={() => addToCart(item.product, -1, item.tier, item.warehouseId)}
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
              <div className="space-y-1">
                <Label>تاريخ المستند</Label>
                <Input
                  type="date"
                  value={documentDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDocumentDate(v);
                    const today = new Date().toISOString().slice(0, 10);
                    if (v && v < today) setIsBackdated(true);
                    else if (v === today) setIsBackdated(false);
                  }}
                />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label>سبب التأريخ الخلفي (اختياري)</Label>
                <Input
                  value={backdateReason}
                  onChange={(e) => setBackdateReason(e.target.value)}
                  placeholder="مثال: فاتورة ورقية قديمة"
                />
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
                    <th className="p-2 text-right min-w-[140px]">الصنف</th>
                    <th className="p-2 text-right">المستودع</th>
                    {showTierColumn && <th className="p-2 text-right">الشريحة</th>}
                    <th className="p-2 text-right">السعر</th>
                    <th className="p-2 text-right">الكمية</th>
                    <th className="p-2 text-right">بونص</th>
                    <th className="p-2 text-right">خصم سطر</th>
                    <th className="p-2 text-right">ضريبة سطر</th>
                    <th className="p-2 text-right">الإجمالي</th>
                    <th className="p-2 text-right">ملاحظة</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cart.map((item, idx) => {
                    const lineTotal = Math.max(
                      0,
                      item.qty * item.price - (item.lineDiscountYER || 0) + (item.lineTaxYER || 0),
                    );
                    return (
                      <tr key={idx} className="hover:bg-muted/50">
                        <td className="p-2 font-medium align-top">{item.product.name}</td>
                        <td className="p-2 align-top">
                          <Select
                            value={item.warehouseId || warehouse || ""}
                            onValueChange={(v) => updateCartItem(idx, { warehouseId: v })}
                          >
                            <SelectTrigger className="h-9 min-w-[120px]">
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
                        </td>
                        {showTierColumn && (
                          <td className="p-2 align-top">
                            <Select
                              value={item.tier}
                              onValueChange={(v) => {
                                const tier = v as PriceKey;
                                const newPrice = Number(item.product[tier] ?? item.product.price);
                                updateCartItem(idx, { tier, price: newPrice });
                              }}
                            >
                              <SelectTrigger className="h-9 min-w-[120px]">
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
                          </td>
                        )}
                        <td className="p-2 align-top">
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
                        <td className="p-2 align-top">
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() =>
                                addToCart(item.product, -1, item.tier, item.warehouseId)
                              }
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
                              onClick={() =>
                                addToCart(item.product, 1, item.tier, item.warehouseId)
                              }
                            >
                              <Plus className="size-3" />
                            </Button>
                          </div>
                          {(() => {
                            const av = qty(item.product.id, item.warehouseId);
                            return av <= 0 ? (
                              <p className="text-[10px] text-destructive mt-1">لا رصيد</p>
                            ) : av < item.qty ? (
                              <p className="text-[10px] text-amber-600 mt-1">متاح: {av}</p>
                            ) : null;
                          })()}
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            className="w-20 h-9"
                            type="number"
                            min="0"
                            step="any"
                            value={item.bonusQty}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              updateCartItem(idx, {
                                bonusQty: Number.isFinite(v) && v >= 0 ? v : 0,
                              });
                            }}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            className="w-24 h-9"
                            type="number"
                            min="0"
                            step="any"
                            value={item.lineDiscountYER}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              updateCartItem(idx, {
                                lineDiscountYER: Number.isFinite(v) && v >= 0 ? v : 0,
                              });
                            }}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            className="w-24 h-9"
                            type="number"
                            min="0"
                            step="any"
                            value={item.lineTaxYER}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              updateCartItem(idx, {
                                lineTaxYER: Number.isFinite(v) && v >= 0 ? v : 0,
                              });
                            }}
                          />
                        </td>
                        <td className="p-2 font-bold align-top whitespace-nowrap">
                          {lineTotal.toFixed(2)} ر.ي
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            className="min-w-[140px] h-9 text-xs"
                            placeholder="ملاحظة"
                            value={item.note}
                            onChange={(e) => updateCartItem(idx, { note: e.target.value })}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setCart(cart.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {cart.length === 0 && (
                    <tr>
                      <td
                        colSpan={showTierColumn ? 11 : 10}
                        className="p-12 text-center text-muted-foreground"
                      >
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

            {/* Print area (invoice) */}
            <div className="print-area hidden print:block mt-6 text-foreground bg-white p-4 rounded-lg" dir="rtl">
              {(() => {
                const ps = printSetting;
                const est = establishment;
                const slogans = Array.isArray((est as { marketing_slogans?: unknown[] } | null)?.marketing_slogans)
                  ? ((est as { marketing_slogans?: string[] }).marketing_slogans ?? [])
                  : [];
                const idx = Number((est as { active_marketing_slogan_index?: number } | null)?.active_marketing_slogan_index ?? 0);
                const slogan = slogans.length ? slogans[Math.min(idx, slogans.length - 1)] : "";
                const mktMode = (ps as { marketing_mode?: string } | null)?.marketing_mode ?? "footer";
                const showMkt = mktMode !== "none" && slogan;
                const mkHeader = showMkt && mktMode === "header" ? slogan : null;
                const mkFooter = showMkt && mktMode === "footer" ? slogan : null;
                const showCashier = (ps as { show_cashier_name?: boolean } | null)?.show_cashier_name ?? true;
                const showBal = (ps as { show_customer_balance?: boolean } | null)?.show_customer_balance ?? false;
                const showTasqit = (ps as { show_tasqit?: boolean } | null)?.show_tasqit ?? false;
                const cust = customers.find((c) => c.id === customerId);
                return (
                  <>
                    {mkHeader && <div className="text-center text-sm mb-2 font-medium">{mkHeader}</div>}
                    <div className="border-b pb-3 mb-3">
                      {(ps?.show_logo ?? true) && est?.logo_url && (
                        <img src={est.logo_url} alt="" className="h-14 object-contain mb-2" />
                      )}
                      {(ps?.show_shop_name ?? true) && <h2 className="text-lg font-bold">{est?.business_name || est?.shop_name || "المحل"}</h2>}
                      {(ps?.show_shop_address ?? false) && est?.address && <p className="text-sm">{est.address}</p>}
                      {(ps?.show_shop_phone ?? false) && (est?.contact_numbers || est?.phone) && (
                        <p className="text-sm">{est?.contact_numbers || est?.phone}</p>
                      )}
                      {est?.business_activity && <p className="text-xs text-gray-600">{est.business_activity}</p>}
                    </div>
                    {(ps?.show_date_time ?? true) && (
                      <p className="text-sm mb-2">التاريخ: {documentDate} {new Date().toLocaleTimeString("ar-YE")}</p>
                    )}
                    {showCashier && <p className="text-sm mb-1">الكاشير: (المستخدم الحالي)</p>}
                    {(ps?.show_customer_info ?? true) && cust && (
                      <div className="text-sm mb-2">
                        <p>العميل: {cust.name}</p>
                        {cust.phone && <p>الهاتف: {cust.phone}</p>}
                        {showBal && <p>الرصيد (تقريبي): راجع كشف الحساب</p>}
                      </div>
                    )}
                    {ps?.show_items_table !== false && (
                      <table className="w-full text-sm border-collapse border border-gray-300 mb-3">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 p-1 text-right">الصنف</th>
                            <th className="border border-gray-300 p-1">الكمية</th>
                            <th className="border border-gray-300 p-1">السعر</th>
                            <th className="border border-gray-300 p-1">الإجمالي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cart.map((item, idx) => (
                            <tr key={idx}>
                              <td className="border border-gray-300 p-1">{item.product.name}</td>
                              <td className="border border-gray-300 p-1 text-center">{item.qty}</td>
                              <td className="border border-gray-300 p-1 text-center">{item.price.toFixed(2)}</td>
                              <td className="border border-gray-300 p-1 text-center">{(item.qty * item.price).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {(ps?.show_totals ?? true) && (
                      <div className="text-sm space-y-1">
                        <p>المجموع الفرعي: {subtotal.toFixed(2)} ر.ي</p>
                        {(ps?.show_discount ?? true) && <p>الخصم: {Number(discount || 0).toFixed(2)} ر.ي</p>}
                        {(ps?.show_tax ?? true) && <p>الضريبة: {Number(tax || 0).toFixed(2)} ر.ي</p>}
                        <p className="font-bold">الإجمالي: {finalAmount.toFixed(2)} {currentCurrency?.code ?? currency}</p>
                      </div>
                    )}
                    {(ps?.show_payment_method ?? true) && <p className="text-sm mt-2">طريقة الدفع: {paymentMethod}</p>}
                    {showTasqit && <p className="text-sm mt-1">ملاحظة: تسقيط/تفاصيل التقسيط حسب الاتفاق.</p>}
                    {mkFooter && <div className="text-center text-sm mt-4 border-t pt-2">{mkFooter}</div>}
                    {ps?.show_footer && ps?.footer_text && <p className="text-center text-xs mt-2">{ps.footer_text}</p>}
                  </>
                );
              })()}
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
