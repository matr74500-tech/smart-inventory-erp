import { useState, useEffect, useMemo, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  UserPlus,
  Phone,
  MapPin,
  ShieldAlert,
  FileText,
  DollarSign,
  Calendar,
  MessageSquare,
  CheckCircle2,
  Trash2,
  Search,
  CreditCard,
  Receipt,
  Send,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/hooks/use-inventory";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { enqueueRpc, isTransientNetworkError } from "@/lib/offline/rpc-queue";
import { getPrivateSnapshot, savePrivateSnapshot } from "@/lib/offline/inventory-cache";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/customers")({
  validateSearch: (search: Record<string, unknown>) => ({
    voucher:
      search["voucher"] === "receipt" || search["voucher"] === "payment"
        ? search["voucher"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "إدارة العملاء والحسابات المالية | نظام المخزون الذكي" },
      {
        name: "description",
        content: "إدارة العملاء، الديون، خطط السداد، سندات القبض والصرف، وأتمتة الواتساب.",
      },
    ],
  }),
  component: CustomersPage,
});

type Customer = {
  id: string;
  name: string;
  phone: string;
  secondary_phone?: string;
  address: string;
  customer_type: "cash" | "credit" | "wholesale";
  credit_limit: number;
  balance: number;
  created_at: string;
  last_sale_at?: string | null;
  inactive_alert_enabled?: boolean;
};

type PaymentPlan = {
  id: string;
  customerId: string;
  totalAmount: number;
  installmentsCount: number;
  dueDate: string;
  status: "active" | "completed" | "overdue" | "cancelled";
};

type Voucher = {
  id: string;
  type: "receipt" | "payment";
  customerId: string;
  amount: number;
  currency: string;
  method: string;
  payee: string;
  notes: string;
  at: string;
  status: "draft" | "posted" | "cancelled";
};

function mapPaymentPlan(row: Tables<"customer_payment_plans">): PaymentPlan {
  return {
    id: row.id,
    customerId: row.customer_id,
    totalAmount: row.total_amount,
    installmentsCount: row.installments_count,
    dueDate: row.due_date,
    status: row.status as PaymentPlan["status"],
  };
}

function mapCustomer(row: Tables<"customers">): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    ...(row.secondary_phone ? { secondary_phone: row.secondary_phone } : {}),
    address: row.address,
    customer_type: row.customer_type as Customer["customer_type"],
    credit_limit: row.credit_limit_yer,
    balance: row.balance_yer,
    created_at: row.created_at,
    last_sale_at: row.last_sale_at,
    inactive_alert_enabled: row.inactive_alert_enabled,
  };
}

function mapVoucher(row: Tables<"vouchers">): Voucher {
  return {
    id: row.id,
    type: row.kind as Voucher["type"],
    customerId: row.customer_id ?? "",
    amount: row.amount,
    currency: row.currency_code,
    method: row.payment_method,
    payee: row.payee ?? "",
    notes: row.notes ?? "",
    at: row.created_at,
    status: row.status as Voucher["status"],
  };
}

function isInactiveCustomer(customer: Customer, days: number | null): boolean {
  if (!days) return false;
  const timestamp = Date.parse(customer.last_sale_at ?? customer.created_at);
  return Number.isFinite(timestamp) && Date.now() - timestamp >= days * 86400000;
}

function CustomersPage() {
  const { canAction, session } = useAuth();
  const { settings, currencies, exchangeRates } = useInventory();
  const { voucher: voucherShortcut } = Route.useSearch();
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [plans, setPlans] = useState<PaymentPlan[]>([]);

  const [vouchers, setVouchers] = useState<Voucher[]>([]);

  const [q, setQ] = useState("");
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [openVoucher, setOpenVoucher] = useState(false);
  const [openPlan, setOpenPlan] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Customer Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [secPhone, setSecPhone] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState<"cash" | "credit" | "wholesale">("credit");
  const [limit, setLimit] = useState("500000");

  // Voucher Form state
  const [vType, setVType] = useState<"receipt" | "payment">("receipt");
  const [vCustId, setVCustId] = useState("");
  const [vPayee, setVPayee] = useState("");
  const [vAmount, setVAmount] = useState("");
  const [vCurr, setVCurr] = useState("YER");
  const [vMethod, setVMethod] = useState("نقدي YER");
  const [vNotes, setVNotes] = useState("");

  useEffect(() => {
    let active = true;
    const loadFinancialData = async () => {
      const userId = session?.user.id;
      if (!navigator.onLine) {
        if (userId) {
          const [cachedCustomers, cachedVouchers, cachedPlans] = await Promise.all([
            getPrivateSnapshot<Customer[]>(userId, "customers"),
            getPrivateSnapshot<Voucher[]>(userId, "vouchers"),
            getPrivateSnapshot<PaymentPlan[]>(userId, "payment-plans"),
          ]);
          if (active) {
            if (cachedCustomers) setCustomers(cachedCustomers);
            if (cachedVouchers) setVouchers(cachedVouchers);
            if (cachedPlans) setPlans(cachedPlans);
          }
        }
        return;
      }
      const { error: statusError } = await supabase.rpc("refresh_payment_plan_statuses");
      if (statusError) toast.error(`تعذر تحديث حالات خطط السداد: ${statusError.message}`);
      const [customerResult, voucherResult, planResult] = await Promise.all([
        supabase.from("customers").select("*").eq("active", true).order("name"),
        supabase.from("vouchers").select("*").order("created_at", { ascending: false }),
        supabase
          .from("customer_payment_plans")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (customerResult.error) toast.error(`تعذر تحميل العملاء: ${customerResult.error.message}`);
      else {
        const mapped = (customerResult.data ?? []).map(mapCustomer);
        setCustomers(mapped);
        if (userId) await savePrivateSnapshot(userId, "customers", mapped);
      }
      if (voucherResult.error) toast.error(`تعذر تحميل السندات: ${voucherResult.error.message}`);
      else {
        const mapped = (voucherResult.data ?? []).map(mapVoucher);
        setVouchers(mapped);
        if (userId) await savePrivateSnapshot(userId, "vouchers", mapped);
      }
      if (planResult.error) toast.error(`تعذر تحميل خطط السداد: ${planResult.error.message}`);
      else {
        const mapped = (planResult.data ?? []).map(mapPaymentPlan);
        setPlans(mapped);
        if (userId) await savePrivateSnapshot(userId, "payment-plans", mapped);
      }
    };
    void loadFinancialData();
    const channel = supabase
      .channel("customer-financial-data")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => void loadFinancialData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vouchers" },
        () => void loadFinancialData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_payment_plans" },
        () => void loadFinancialData(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [session?.user.id]);

  useEffect(() => {
    if (!voucherShortcut) return;
    setVType(voucherShortcut === "payment" ? "payment" : "receipt");
    setOpenVoucher(true);
  }, [voucherShortcut]);

  // Plan Form state
  const [pCustId, setPCustId] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pCount, setPCount] = useState("3");
  const [pDate, setPDate] = useState("");

  const saveCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("الاسم ورقم الهاتف مطلوبان");
      return;
    }
    const creditLimit = Number(limit);
    if (!Number.isFinite(creditLimit) || creditLimit < 0) {
      toast.error("سقف المديونية يجب أن يكون رقماً موجباً أو صفراً");
      return;
    }
    const operationId = crypto.randomUUID();
    const customerId = crypto.randomUUID();
    const args = {
      _operation_id: operationId,
      _id: customerId,
      _name: name.trim(),
      _phone: phone.trim(),
      _secondary_phone: secPhone.trim() || "",
      _address: address.trim(),
      _customer_type: type,
      _credit_limit_yer: creditLimit,
      _inactive_alert_enabled: true,
    };
    const localCustomer: Customer = {
      id: customerId,
      name: name.trim(),
      phone: phone.trim(),
      ...(secPhone.trim() ? { secondary_phone: secPhone.trim() } : {}),
      address: address.trim(),
      customer_type: type,
      credit_limit: creditLimit,
      balance: 0,
      created_at: new Date().toISOString(),
    };
    const cacheLocalCustomer = async () => {
      setCustomers((items) => [localCustomer, ...items.filter((item) => item.id !== customerId)]);
      if (session?.user.id) {
        const cached = await getPrivateSnapshot<Customer[]>(session.user.id, "customers");
        await savePrivateSnapshot(session.user.id, "customers", [
          localCustomer,
          ...(cached ?? []).filter((item) => item.id !== customerId),
        ]);
      }
    };
    if (!navigator.onLine) {
      await enqueueRpc({ id: operationId, name: "save_customer_offline", args });
      await cacheLocalCustomer();
      toast.success("تم حفظ العميل على الجهاز وسيُزامن عند عودة الاتصال");
      setName("");
      setPhone("");
      setSecPhone("");
      setAddress("");
      setOpenAdd(false);
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
      await enqueueRpc({ id: operationId, name: "save_customer_offline", args });
      await cacheLocalCustomer();
      toast.success("انقطع الاتصال؛ حُفظ العميل محليًا للمزامنة");
      setName("");
      setPhone("");
      setSecPhone("");
      setAddress("");
      setOpenAdd(false);
      return;
    }
    const { data: savedCustomerId, error } = customerResult;
    if (error) {
      if (isTransientNetworkError(error)) {
        await enqueueRpc({ id: operationId, name: "save_customer_offline", args });
        await cacheLocalCustomer();
        toast.success("تعذر الاتصال؛ حُفظ العميل محليًا للمزامنة");
        setOpenAdd(false);
        return;
      }
      toast.error(`تعذر حفظ العميل: ${error.message}`);
      return;
    }
    if (!savedCustomerId) {
      toast.error("تمت العملية دون إرجاع معرف العميل؛ أعد تحميل القائمة عند الاتصال");
      return;
    }
    const { data, error: loadError } = await supabase
      .from("customers")
      .select("*")
      .eq("id", savedCustomerId)
      .single();
    if (loadError) {
      toast.error(`تم حفظ العميل لكن تعذر تحديث القائمة: ${loadError.message}`);
      return;
    }
    const mappedCustomer = mapCustomer(data);
    setCustomers((items) => [mappedCustomer, ...items.filter((item) => item.id !== data.id)]);
    if (session?.user.id) {
      const cached = await getPrivateSnapshot<Customer[]>(session.user.id, "customers");
      await savePrivateSnapshot(session.user.id, "customers", [
        mappedCustomer,
        ...(cached ?? []).filter((item) => item.id !== data.id),
      ]);
    }
    toast.success("تم حفظ العميل ومزامنته");
    setName("");
    setPhone("");
    setSecPhone("");
    setAddress("");
    setOpenAdd(false);
  };

  const saveVoucher = async (post = true) => {
    if (!vAmount || (vType === "receipt" && !vCustId)) {
      toast.error(vType === "receipt" ? "اختر العميل وحدد المبلغ" : "حدد المبلغ");
      return;
    }
    const amt = Number(vAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("مبلغ غير صالح");
      return;
    }

    const cust = customers.find((c) => c.id === vCustId);
    if (vCustId && !cust) {
      toast.error("العميل غير موجود");
      return;
    }
    if (vType === "payment" && !cust && !vPayee.trim()) {
      toast.error("أدخل اسم المستفيد أو جهة الصرف");
      return;
    }
    const rate =
      vCurr === "YER" ? 1 : exchangeRates.find((item) => item.currency_code === vCurr)?.rate_to_yer;
    if (!rate || !Number.isFinite(Number(rate)) || Number(rate) <= 0) {
      toast.error("لا يوجد سعر صرف صالح لهذه العملة");
      return;
    }
    const voucherIdStable = crypto.randomUUID();
    const saveOperationId = crypto.randomUUID();
    const args = {
      _operation_id: saveOperationId,
      _id: voucherIdStable,
      _kind: vType,
      _customer_id: vCustId || "",
      _payee: cust?.name ?? (vPayee.trim() || ""),
      _category: "عام",
      _amount: amt,
      _currency_code: vCurr,
      _rate_to_yer: Number(rate),
      _payment_method: vMethod,
      _affects_drawer: vMethod.includes("نقدي") || vMethod.startsWith("سعودي"),
      _notes: vNotes.trim() || "",
    };
    if (!navigator.onLine) {
      await enqueueRpc({ id: saveOperationId, name: "save_voucher_draft_offline", args });
      if (post) {
        const postOperationId = crypto.randomUUID();
        await enqueueRpc({
          id: postOperationId,
          name: "post_voucher_offline",
          args: { _operation_id: postOperationId, _id: voucherIdStable },
        });
      }
      toast.success("تم حفظ السند محليًا للمزامنة عند عودة الاتصال");
      setVAmount("");
      setVNotes("");
      setVPayee("");
      setVCustId("");
      setOpenVoucher(false);
      return;
    }
    const { data: voucherId, error } = await supabase.rpc("save_voucher_draft_offline", args);
    if (error) {
      if (/network|fetch|offline|failed/i.test(error.message)) {
        await enqueueRpc({ id: saveOperationId, name: "save_voucher_draft_offline", args });
        if (post) {
          const postOperationId = crypto.randomUUID();
          await enqueueRpc({
            id: postOperationId,
            name: "post_voucher_offline",
            args: { _operation_id: postOperationId, _id: voucherIdStable },
          });
        }
        toast.success("تعذر الاتصال؛ حُفظ السند محليًا للمزامنة");
        setVAmount("");
        setOpenVoucher(false);
        return;
      }
      toast.error(`تعذر حفظ السند: ${error.message}`);
      return;
    }
    if (post) {
      const postOperationId = crypto.randomUUID();
      const postArgs = { _operation_id: postOperationId, _id: voucherId };
      const { error: postError } = await supabase.rpc("post_voucher_offline", postArgs);
      if (postError) {
        if (/network|fetch|offline|failed/i.test(postError.message)) {
          await enqueueRpc({ id: postOperationId, name: "post_voucher_offline", args: postArgs });
          toast.success("تم حفظ السند؛ سيُرحّل تلقائيًا عند عودة الاتصال");
          setOpenVoucher(false);
          return;
        }
        toast.error(`حُفظ السند كمسودة، لكن تعذر ترحيله: ${postError.message}`);
        return;
      }
    }
    const { data, error: loadError } = await supabase
      .from("vouchers")
      .select("*")
      .eq("id", voucherId)
      .single();
    if (loadError) {
      toast.error(`تم حفظ السند لكن تعذر تحديث القائمة: ${loadError.message}`);
      return;
    }
    setVouchers((items) => [mapVoucher(data), ...items.filter((item) => item.id !== data.id)]);
    toast.success(post ? "تم حفظ السند وترحيله ومزامنة رصيد العميل" : "تم حفظ السند كمسودة");
    setVAmount("");
    setVNotes("");
    setVPayee("");
    setVCustId("");
    setOpenVoucher(false);
  };

  const savePlan = async (e: FormEvent) => {
    e.preventDefault();
    if (!pCustId || !pAmount || !pDate) {
      toast.error("جميع الحقول مطلوبة");
      return;
    }
    const operationId = crypto.randomUUID();
    const args = {
      _id: operationId,
      _customer_id: pCustId,
      _total_amount_yer: Number(pAmount),
      _installments_count: Number(pCount) || 3,
      _due_date: pDate,
    };
    if (!navigator.onLine) {
      await enqueueRpc({ id: operationId, name: "save_payment_plan", args });
      toast.success("تم حفظ خطة السداد محليًا وستتم مزامنتها عند عودة الاتصال");
      setPAmount("");
      setOpenPlan(false);
      return;
    }
    const { data, error } = await supabase.rpc("save_payment_plan", args);
    if (error || !data) {
      if (error && /network|fetch|offline|failed/i.test(error.message)) {
        await enqueueRpc({ id: operationId, name: "save_payment_plan", args });
        toast.success("تعذر الاتصال؛ تم حفظ الخطة محليًا وستتم مزامنتها تلقائيًا");
        setPAmount("");
        setOpenPlan(false);
        return;
      }
      toast.error(`تعذر إنشاء خطة السداد: ${error?.message || "استجابة غير صالحة"}`);
      return;
    }
    setPlans((items) => [mapPaymentPlan(data), ...items]);
    toast.success("تم إنشاء خطة السداد بنجاح");
    setPAmount("");
    setOpenPlan(false);
  };

  const updatePlanStatus = async (planId: string, status: "active" | "completed" | "cancelled") => {
    if (!canAction("customers.manage")) {
      toast.error("ليس لديك صلاحية تعديل خطط السداد");
      return;
    }
    const { data, error } = await supabase.rpc("update_payment_plan_status", {
      _id: planId,
      _status: status,
    });
    if (error || !data) {
      toast.error(`تعذر تحديث الخطة: ${error?.message || "استجابة غير صالحة"}`);
      return;
    }
    setPlans((items) => items.map((item) => (item.id === planId ? mapPaymentPlan(data) : item)));
    toast.success(status === "completed" ? "تم إكمال خطة السداد" : "تم إلغاء خطة السداد");
  };

  const deleteCust = async (id: string, custName: string) => {
    if (!canAction("customers.manage")) {
      toast.error("ليس لديك صلاحية أرشفة العملاء");
      return;
    }
    if (!confirm(`تأكيد أرشفة العميل ${custName}؟`)) return;
    const { error } = await supabase.rpc("archive_customer", { _id: id });
    if (error) {
      toast.error(`تعذر أرشفة العميل: ${error.message}`);
      return;
    }
    setCustomers((items) => items.filter((customer) => customer.id !== id));
    toast.success("تمت أرشفة العميل");
    if (selectedCustomer?.id === id) setSelectedCustomer(null);
  };

  async function postSavedVoucher(id: string) {
    if (!canAction("cash.manage")) {
      toast.error("ليس لديك صلاحية ترحيل السند");
      return;
    }
    const { error } = await supabase.rpc("post_voucher", { _id: id });
    if (error) {
      toast.error(`تعذر ترحيل السند: ${error.message}`);
      return;
    }
    const { data, error: loadError } = await supabase
      .from("vouchers")
      .select("*")
      .eq("id", id)
      .single();
    if (loadError) {
      toast.error(`تم ترحيل السند لكن تعذر تحديث القائمة: ${loadError.message}`);
      return;
    }
    setVouchers((items) => items.map((item) => (item.id === id ? mapVoucher(data) : item)));
    toast.success("تم ترحيل السند وتحديث رصيد العميل");
  }

  const inactivityDays = settings?.inactive_customer_days ?? null;
  const filtered = useMemo(
    () =>
      customers.filter(
        (c) =>
          (c.name.includes(q) || c.phone.includes(q) || c.address.includes(q)) &&
          (!inactiveOnly || isInactiveCustomer(c, inactivityDays)),
      ),
    [customers, q, inactiveOnly, inactivityDays],
  );
  const inactiveCustomers = customers.filter((customer) =>
    isInactiveCustomer(customer, inactivityDays),
  );

  async function setInactiveAlert(customerId: string, enabled: boolean) {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;
    const { error } = await supabase.rpc("save_customer", {
      _id: customer.id,
      _name: customer.name,
      _phone: customer.phone,
      _secondary_phone: customer.secondary_phone ?? "",
      _address: customer.address,
      _customer_type: customer.customer_type,
      _credit_limit_yer: customer.credit_limit,
      _inactive_alert_enabled: enabled,
    });
    if (error) {
      toast.error(`تعذر حفظ إعداد تنبيه العميل: ${error.message}`);
      return;
    }
    setCustomers((items) =>
      items.map((item) =>
        item.id === customerId ? { ...item, inactive_alert_enabled: enabled } : item,
      ),
    );
  }

  function sendWhatsApp(c: Customer, text: string) {
    const url = `https://wa.me/967${c.phone.replace(/^0+/, "")}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
    toast.success("تم فتح الواتساب للإرسال");
  }

  const TYPE_LABEL: Record<string, string> = {
    cash: "نقدي",
    credit: "آجل",
    wholesale: "جملة",
  };

  return (
    <AppShell title="إدارة العملاء والحسابات المالية (CRM & Credit)">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">إدارة العملاء والحسابات المالية</h1>
            <p className="text-xs text-muted-foreground">
              دليل العملاء، الديون، خطط السداد، وسندات القبض والصرف.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Button
              variant="outline"
              onClick={() => setOpenVoucher(true)}
              disabled={!canAction("cash.manage")}
              size="sm"
            >
              <Receipt className="size-4 ml-2" /> سند جديد
            </Button>
            <Button onClick={() => setOpenAdd(true)} disabled={!canAction("customers.manage")}>
              <UserPlus className="size-4 ml-2" /> إضافة عميل
            </Button>
          </div>
        </div>
        <Separator />

        <Tabs defaultValue="directory" dir="rtl" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1 sm:grid-cols-4 max-w-md">
            <TabsTrigger value="directory">دليل العملاء</TabsTrigger>
            <TabsTrigger value="crm">التحليل والمتابعة (CRM)</TabsTrigger>
            <TabsTrigger value="vouchers">سندات القبض والصرف</TabsTrigger>
            <TabsTrigger value="plans">خطط السداد</TabsTrigger>
          </TabsList>

          {/* Directory */}
          <TabsContent value="directory" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[260px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  className="pr-10 h-10 bg-card"
                  placeholder="ابحث باسم العميل أو رقم الهاتف أو العنوان…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              {inactivityDays !== null && (
                <Button
                  variant={inactiveOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInactiveOnly((value) => !value)}
                >
                  غير النشطين: {inactiveCustomers.length}
                </Button>
              )}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((c) => {
                const overLimit = c.customer_type === "credit" && c.balance > c.credit_limit;
                const inactive = isInactiveCustomer(c, inactivityDays);
                return (
                  <Card
                    key={c.id}
                    className="rounded-xl shadow-sm border hover:shadow-md transition-all group"
                  >
                    <CardHeader className="px-4 py-3">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0">
                          <div className="font-bold text-base truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {TYPE_LABEL[c.customer_type]}
                          </div>
                        </div>
                        <Badge
                          variant={overLimit ? "destructive" : inactive ? "secondary" : "secondary"}
                          className="text-xs px-2 py-1 shrink-0"
                        >
                          {overLimit ? "متجاوز الحد" : inactive ? "غير نشط" : `رصيد: ${c.balance}`}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Phone className="size-3.5" /> {c.phone}{" "}
                          {c.secondary_phone ? `· ${c.secondary_phone}` : ""}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="size-3.5" /> {c.address || "بدون عنوان"}
                        </div>
                        {inactive && <div className="font-semibold text-warning">عميل غير نشط</div>}
                        {c.customer_type === "credit" && (
                          <div>
                            سقف المديونية: {c.credit_limit} ر.ي{" "}
                            {overLimit && (
                              <span className="text-destructive font-bold text-xs">
                                (متجاوز الحد!)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardFooter className="border-t pt-3 px-4">
                      <div className="flex items-center justify-between gap-2">
                        {inactivityDays !== null && (
                          <label className="flex items-center gap-1 cursor-pointer">
                            <Checkbox
                              checked={c.inactive_alert_enabled !== false}
                              disabled={!canAction("customers.manage")}
                              onCheckedChange={(checked) =>
                                void setInactiveAlert(c.id, checked === true)
                              }
                            />
                            <span className="text-xs">تنبيه عدم النشاط</span>
                          </label>
                        )}
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedCustomer(c)}
                            className="px-3"
                          >
                            كشف حساب
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-success p-1.5 size-8"
                            onClick={() =>
                              sendWhatsApp(
                                c,
                                `مرحباً بك يا ${c.name}، نود تذكيركم بأن رصيدكم الحالي هو ${c.balance} ر.ي. شكراً لتعاملكم معنا (مكتبة ومحلات الإخوة).`,
                              )
                            }
                          >
                            <MessageSquare className="size-4 ml-1" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-destructive p-1.5"
                            onClick={() => deleteCust(c.id, c.name)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-full p-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <Users className="size-16 opacity-30" />
                  <p>لا توجد عملاء مطابقة للبحث</p>
                  {q && (
                    <Button variant="outline" size="sm" onClick={() => setQ("")}>
                      مسح البحث
                    </Button>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* CRM */}
          <TabsContent value="crm" className="space-y-4">
            <div className="rounded-xl bg-card shadow-card p-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-bold">
                  <Users className="size-5 text-primary" /> تحليل ومتابعة العملاء (CRM)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                    <CardDescription className="text-xs text-blue-600 font-medium mb-1">
                      إجمالي العملاء
                    </CardDescription>
                    <div className="text-3xl font-bold text-blue-900">{customers.length}</div>
                  </Card>
                  <Card className="p-4 rounded-lg bg-amber-50 border border-amber-100">
                    <CardDescription className="text-xs text-amber-600 font-medium mb-1">
                      عملاء عليهم مديونيات
                    </CardDescription>
                    <div className="text-3xl font-bold text-amber-900">
                      {customers.filter((c) => c.balance > 0).length}
                    </div>
                  </Card>
                  <Card className="p-4 rounded-lg bg-orange-50 border border-orange-100">
                    <CardDescription className="text-xs text-orange-600 font-medium mb-1">
                      متجاوزو سقف المديونية
                    </CardDescription>
                    <div className="text-3xl font-bold text-orange-900">
                      {
                        customers.filter(
                          (c) => c.customer_type === "credit" && c.balance > c.credit_limit,
                        ).length
                      }
                    </div>
                  </Card>
                  <Card className="p-4 rounded-lg bg-rose-50 border border-rose-100">
                    <CardDescription className="text-xs text-rose-600 font-medium mb-1">
                      عملاء غير نشطين
                    </CardDescription>
                    <div className="text-3xl font-bold text-rose-900">
                      {inactiveCustomers.length}
                    </div>
                  </Card>
                </div>
                {inactivityDays === null && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    حدد فترة عدم النشاط من الإعدادات لتفعيل متابعة العملاء غير النشطين.
                  </p>
                )}
                <div className="mt-6 pt-6 border-t flex gap-2">
                  <Button
                    onClick={(): void => {
                      const overdueList = inactiveCustomers.filter(
                        (customer) => customer.inactive_alert_enabled !== false,
                      );
                      if (!overdueList.length) {
                        toast.error("لا يوجد عملاء غير نشطين يسمح تنبيههم");
                        return;
                      }
                      for (const c of overdueList) {
                        const message =
                          c.balance > 0
                            ? `مرحباً ${c.name}، نود تذكيركم بالرصيد المستحق ${c.balance} ر.ي. يسعدنا تواصلكم.`
                            : `مرحباً ${c.name}، نفتقد زيارتكم ونسعد بخدمتكم من جديد.`;
                        sendWhatsApp(c, message);
                      }
                    }}
                    disabled={inactivityDays === null}
                    className="flex-1"
                  >
                    <Send className="size-4 ml-2" /> تنبيه العملاء غير النشطين عبر واتساب
                  </Button>
                </div>
              </CardContent>
            </div>
          </TabsContent>

          {/* Vouchers */}
          <TabsContent value="vouchers" className="space-y-4">
            <div className="rounded-xl bg-card shadow-card p-6">
              <CardHeader className="flex justify-between items-center">
                <CardTitle className="text-lg font-bold">سندات القبض والصرف الخزينة</CardTitle>
                <Button size="sm" onClick={() => setOpenVoucher(true)}>
                  <Receipt className="size-4 ml-2" /> سند جديد
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border divide-y text-sm overflow-hidden">
                  {vouchers.map((v) => {
                    const cust = customers.find((c) => c.id === v.customerId);
                    return (
                      <div
                        key={v.id}
                        className="p-4 flex justify-between items-center hover:bg-muted/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant={v.type === "receipt" ? "secondary" : "destructive"}
                              className="text-xs px-2 py-1"
                            >
                              {v.type === "receipt" ? "سند قبض" : "سند صرف"}
                            </Badge>
                            {v.status === "draft" && (
                              <Badge variant="outline" className="text-xs px-2 py-1">
                                مسودة
                              </Badge>
                            )}
                          </div>
                          <div className="font-semibold text-foreground truncate">
                            {cust?.name || v.payee || "غير محدد"}
                          </div>
                          <div className="text-xs text-muted-foreground">{v.method}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">
                            {v.amount} {v.currency}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(v.at).toLocaleString("ar")}
                          </div>
                        </div>
                        {v.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canAction("cash.manage")}
                            onClick={() => void postSavedVoucher(v.id)}
                          >
                            ترحيل
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {vouchers.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                      <Receipt className="size-12 opacity-30" />
                      <p>لا توجد سندات مسجلة بعد</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </div>
          </TabsContent>

          {/* Plans */}
          <TabsContent value="plans" className="space-y-4">
            <div className="rounded-xl bg-card shadow-card p-6">
              <CardHeader className="flex justify-between items-center">
                <CardTitle className="text-lg font-bold">خطط السداد وجدولة الديون</CardTitle>
                <Button size="sm" onClick={() => setOpenPlan(true)}>
                  <Calendar className="size-4 ml-2" /> خطة جديدة
                </Button>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border divide-y text-sm overflow-hidden">
                  {plans.map((p) => {
                    const cust = customers.find((c) => c.id === p.customerId);
                    return (
                      <div
                        key={p.id}
                        className="p-4 flex justify-between items-center hover:bg-muted/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-foreground truncate">
                            {cust?.name || "عميل"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            عدد الأقساط: {p.installmentsCount} · تاريخ الاستحقاق: {p.dueDate}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-left">
                          <div>
                            <div className="font-bold text-foreground">{p.totalAmount} ر.ي</div>
                            <div className="text-xs text-muted-foreground">
                              {p.status === "active"
                                ? "نشطة"
                                : p.status === "overdue"
                                  ? "متأخرة"
                                  : p.status === "completed"
                                    ? "مكتملة"
                                    : "ملغاة"}
                            </div>
                          </div>
                          {(p.status === "active" || p.status === "overdue") && (
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                title="تحديد كمكتملة"
                                onClick={() => void updatePlanStatus(p.id, "completed")}
                              >
                                <CheckCircle2 className="size-4 text-emerald-600" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="إلغاء الخطة"
                                onClick={() => void updatePlanStatus(p.id, "cancelled")}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {plans.length === 0 && (
                    <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                      <Calendar className="size-12 opacity-30" />
                      <p>لا توجد خطط سداد نشطة</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Customer Dialog (modern Dialog component) */}
      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة عميل جديد</DialogTitle>
            <DialogDescription>
              أضف بيانات العميل الأساسية ورقم الهاتف وسقف المديونية.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveCustomer} className="space-y-4 p-4">
            <div className="space-y-1">
              <Label>اسم العميل *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم العميل الكامل"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>رقم الهاتف الأساسي *</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="777123456"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>رقم هاتف ثانوي</Label>
                <Input
                  value={secPhone}
                  onChange={(e) => setSecPhone(e.target.value)}
                  placeholder="اختياري"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>العنوان</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="المدينة - الشارع"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>طبيعة العميل</Label>
                <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">آجل</SelectItem>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="wholesale">جملة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>سقف المديونية (ر.ي)</Label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  placeholder="500000"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenAdd(false)}>
                إلغاء
              </Button>
              <Button type="submit">حفظ العميل</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Voucher Dialog */}
      <Dialog open={openVoucher} onOpenChange={setOpenVoucher}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>سند قبض / صرف جديد</DialogTitle>
            <DialogDescription>
              سند مالية لتسجيل القبض أو الصرف وترحيل رصيد العميل.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveVoucher(true);
            }}
            className="space-y-4 p-4"
          >
            <div className="space-y-1">
              <Label>نوع السند</Label>
              <Select value={vType} onValueChange={(value) => setVType(value as typeof vType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">سند قبض (قبض دفعة من عميل)</SelectItem>
                  <SelectItem value="payment">سند صرف (صرف مصروفات)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>العميل {vType === "payment" ? "(اختياري للمصروفات)" : "*"}</Label>
              <Select
                value={vCustId || "__none__"}
                onValueChange={(value) => setVCustId(value === "__none__" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر العميل" />
                </SelectTrigger>
                <SelectContent>
                  {vType === "payment" && (
                    <SelectItem value="__none__">مصروف عام / مورد</SelectItem>
                  )}
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} (رصيد: {c.balance})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {vType === "payment" && !vCustId && (
              <div className="space-y-1">
                <Label htmlFor="voucher-payee">المستفيد / جهة الصرف *</Label>
                <Input
                  id="voucher-payee"
                  value={vPayee}
                  onChange={(event) => setVPayee(event.target.value)}
                  required
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>المبلغ *</Label>
                <Input
                  type="number"
                  step="any"
                  value={vAmount}
                  onChange={(e) => setVAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>العملة</Label>
                <Select value={vCurr} onValueChange={setVCurr}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currencies
                      .filter((currency) => currency.active)
                      .map((currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                          {currency.name} ({currency.code})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>طريقة الدفع</Label>
              <Input
                value={vMethod}
                onChange={(e) => setVMethod(e.target.value)}
                placeholder="نقدي / تحويل شبكة"
              />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات / البيان</Label>
              <Input
                value={vNotes}
                onChange={(e) => setVNotes(e.target.value)}
                placeholder="البيان التفصيلي"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenVoucher(false)}>
                إلغاء
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canAction("cash.manage")}
                onClick={() => void saveVoucher(false)}
              >
                حفظ كمسودة
              </Button>
              <Button type="submit" disabled={!canAction("cash.manage")}>
                حفظ وترحيل السند
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Plan Dialog */}
      <Dialog open={openPlan} onOpenChange={setOpenPlan}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء خطة سداد مخصصة</DialogTitle>
            <DialogDescription>جدولة دين العميل على أقساط مع تاريخ استحقاق.</DialogDescription>
          </DialogHeader>
          <form onSubmit={savePlan} className="space-y-4 p-4">
            <div className="space-y-1">
              <Label>العميل</Label>
              <Select value={pCustId} onValueChange={setPCustId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر العميل" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>المبلغ الإجمالي المستحق *</Label>
              <Input
                type="number"
                value={pAmount}
                onChange={(e) => setPAmount(e.target.value)}
                placeholder="100000"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>عدد الأقساط</Label>
                <Input
                  type="number"
                  value={pCount}
                  onChange={(e) => setPCount(e.target.value)}
                  placeholder="3"
                />
              </div>
              <div className="space-y-1">
                <Label>تاريخ استحقاق القسط الأول *</Label>
                <Input
                  type="date"
                  value={pDate}
                  onChange={(e) => setPDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenPlan(false)}>
                إلغاء
              </Button>
              <Button type="submit">حفظ الخطة</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Statement Dialog */}
      {selectedCustomer && (
        <Dialog open={true} onOpenChange={() => setSelectedCustomer(null)}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl">{selectedCustomer.name}</DialogTitle>
              <DialogDescription>
                {selectedCustomer.phone} · {selectedCustomer.address}
              </DialogDescription>
            </DialogHeader>
            <div className="p-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-3 bg-muted p-4 rounded-xl">
                <div>
                  <div className="text-xs text-muted-foreground">الرصيد الحالي</div>
                  <div className="text-2xl font-bold text-primary">
                    {selectedCustomer.balance} ر.ي
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">سقف المديونية</div>
                  <div className="text-2xl font-bold">{selectedCustomer.credit_limit} ر.ي</div>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">سجل العمليات وكشف الحساب</h4>
                <div className="rounded-lg border divide-y text-sm">
                  <div className="p-3 flex justify-between items-center text-muted-foreground">
                    <span>رصيد افتتاح الحساب</span>
                    <span>0 ر.ي</span>
                  </div>
                  {vouchers
                    .filter((v) => v.customerId === selectedCustomer.id && v.status === "posted")
                    .map((v) => (
                      <div
                        key={v.id}
                        className="p-3 flex justify-between items-center hover:bg-muted/50 transition-colors"
                      >
                        <span>
                          {v.type === "receipt" ? "سند قبض" : "سند صرف"} ({v.notes || v.method})
                        </span>
                        <span
                          className={
                            v.type === "receipt"
                              ? "text-success font-bold"
                              : "text-destructive font-bold"
                          }
                        >
                          {v.type === "receipt" ? `-${v.amount}` : `+${v.amount}`} {v.currency}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() =>
                    sendWhatsApp(
                      selectedCustomer,
                      `كشف حساب العميل ${selectedCustomer.name}: الرصيد الحالي هو ${selectedCustomer.balance} ر.ي. (مكتبة ومحلات الإخوة).`,
                    )
                  }
                >
                  <MessageSquare className="size-4 ml-1.5" /> إرسال كشف الحساب واتساب
                </Button>
                <Button variant="outline" onClick={() => setSelectedCustomer(null)}>
                  إغلاق
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
