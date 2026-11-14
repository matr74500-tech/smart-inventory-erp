import { useState, useEffect, useMemo, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Users, UserPlus, Phone, MapPin, ShieldAlert, FileText, DollarSign, Calendar, MessageSquare, CheckCircle2, Trash2, Search, RotateCcw, CreditCard, Receipt, Send } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { logMovement } from "@/lib/inventory-utils";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/hooks/use-inventory";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/customers")({
  validateSearch: (search: Record<string, unknown>) => ({
    voucher: search["voucher"] === "receipt" || search["voucher"] === "payment" ? search["voucher"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "إدارة العملاء والحسابات المالية | سهيل سوفت" },
      { name: "description", content: "إدارة العملاء، الديون، خطط السداد، سندات القبض والصرف، وأتمتة الواتساب." },
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
  status: "active" | "completed" | "overdue";
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
  const { canAction } = useAuth();
  const { settings, currencies, exchangeRates } = useInventory();
  const { voucher: voucherShortcut } = Route.useSearch();
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [plans, setPlans] = useState<PaymentPlan[]>(() => {
    try { return JSON.parse(localStorage.getItem("suhail_payment_plans") || "[]"); } catch { return []; }
  });

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
      const [customerResult, voucherResult] = await Promise.all([
        supabase.from("customers").select("*").eq("active", true).order("name"),
        supabase.from("vouchers").select("*").order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (customerResult.error) toast.error(`تعذر تحميل العملاء: ${customerResult.error.message}`);
      else setCustomers((customerResult.data ?? []).map(mapCustomer));
      if (voucherResult.error) toast.error(`تعذر تحميل السندات: ${voucherResult.error.message}`);
      else setVouchers((voucherResult.data ?? []).map(mapVoucher));
    };
    void loadFinancialData();
    const channel = supabase.channel("customer-financial-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => void loadFinancialData())
      .on("postgres_changes", { event: "*", schema: "public", table: "vouchers" }, () => void loadFinancialData())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

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
    const { data: customerId, error } = await supabase.rpc("save_customer", {
      _id: null,
      _name: name.trim(),
      _phone: phone.trim(),
      _secondary_phone: secPhone.trim() || null,
      _address: address.trim(),
      _customer_type: type,
      _credit_limit_yer: creditLimit,
      _inactive_alert_enabled: true,
    });
    if (error) {
      toast.error(`تعذر حفظ العميل: ${error.message}`);
      return;
    }
    const { data, error: loadError } = await supabase.from("customers").select("*").eq("id", customerId).single();
    if (loadError) {
      toast.error(`تم حفظ العميل لكن تعذر تحديث القائمة: ${loadError.message}`);
      return;
    }
    setCustomers((items) => [mapCustomer(data), ...items.filter((item) => item.id !== data.id)]);
    toast.success("تم حفظ العميل ومزامنته");
    setName(""); setPhone(""); setSecPhone(""); setAddress(""); setOpenAdd(false);
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

    const cust = customers.find(c => c.id === vCustId);
    if (vCustId && !cust) {
      toast.error("العميل غير موجود");
      return;
    }
    if (vType === "payment" && !cust && !vPayee.trim()) {
      toast.error("أدخل اسم المستفيد أو جهة الصرف");
      return;
    }
    const rate = vCurr === "YER" ? 1 : exchangeRates.find((item) => item.currency_code === vCurr)?.rate_to_yer;
    if (!rate || !Number.isFinite(Number(rate)) || Number(rate) <= 0) {
      toast.error("لا يوجد سعر صرف صالح لهذه العملة");
      return;
    }
    const { data: voucherId, error } = await supabase.rpc("save_voucher_draft", {
      _id: null,
      _kind: vType,
      _customer_id: vCustId || null,
      _payee: cust?.name ?? (vPayee.trim() || null),
      _category: "عام",
      _amount: amt,
      _currency_code: vCurr,
      _rate_to_yer: Number(rate),
      _payment_method: vMethod,
      _affects_drawer: vMethod.includes("نقدي") || vMethod.startsWith("سعودي"),
      _notes: vNotes.trim() || null,
    });
    if (error) {
      toast.error(`تعذر حفظ السند: ${error.message}`);
      return;
    }
    if (post) {
      const { error: postError } = await supabase.rpc("post_voucher", { _id: voucherId });
      if (postError) {
        toast.error(`حُفظ السند كمسودة، لكن تعذر ترحيله: ${postError.message}`);
        return;
      }
    }
    const { data, error: loadError } = await supabase.from("vouchers").select("*").eq("id", voucherId).single();
    if (loadError) {
      toast.error(`تم حفظ السند لكن تعذر تحديث القائمة: ${loadError.message}`);
      return;
    }
    setVouchers((items) => [mapVoucher(data), ...items.filter((item) => item.id !== data.id)]);
    toast.success(post ? "تم حفظ السند وترحيله ومزامنة رصيد العميل" : "تم حفظ السند كمسودة");
    setVAmount(""); setVNotes(""); setVPayee(""); setVCustId(""); setOpenVoucher(false);
  };

  const savePlan = (e: FormEvent) => {
    e.preventDefault();
    if (!pCustId || !pAmount || !pDate) {
      toast.error("جميع الحقول مطلوبة");
      return;
    }
    const newPlan: PaymentPlan = {
      id: Date.now().toString(),
      customerId: pCustId,
      totalAmount: Number(pAmount) || 0,
      installmentsCount: Number(pCount) || 3,
      dueDate: pDate,
      status: "active",
    };
    const next = [newPlan, ...plans];
    setPlans(next);
    localStorage.setItem("suhail_payment_plans", JSON.stringify(next));
    logMovement(pCustId, "خطة سداد", Number(pAmount), `إنشاء خطة سداد بقيمة ${pAmount} على ${pCount} أقساط`);
    toast.success("تم إنشاء خطة السداد بنجاح");
    setPAmount(""); setOpenPlan(false);
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
    const { data, error: loadError } = await supabase.from("vouchers").select("*").eq("id", id).single();
    if (loadError) {
      toast.error(`تم ترحيل السند لكن تعذر تحديث القائمة: ${loadError.message}`);
      return;
    }
    setVouchers((items) => items.map((item) => item.id === id ? mapVoucher(data) : item));
    toast.success("تم ترحيل السند وتحديث رصيد العميل");
  }

  const inactivityDays = settings?.inactive_customer_days ?? null;
  const filtered = useMemo(
    () => customers.filter((c) => (c.name.includes(q) || c.phone.includes(q) || c.address.includes(q)) && (!inactiveOnly || isInactiveCustomer(c, inactivityDays))),
    [customers, q, inactiveOnly, inactivityDays],
  );
  const inactiveCustomers = customers.filter((customer) => isInactiveCustomer(customer, inactivityDays));

  async function setInactiveAlert(customerId: string, enabled: boolean) {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;
    const { error } = await supabase.rpc("save_customer", {
      _id: customer.id,
      _name: customer.name,
      _phone: customer.phone,
      _secondary_phone: customer.secondary_phone ?? null,
      _address: customer.address,
      _customer_type: customer.customer_type,
      _credit_limit_yer: customer.credit_limit,
      _inactive_alert_enabled: enabled,
    });
    if (error) {
      toast.error(`تعذر حفظ إعداد تنبيه العميل: ${error.message}`);
      return;
    }
    setCustomers((items) => items.map((item) => item.id === customerId ? { ...item, inactive_alert_enabled: enabled } : item));
  }

  function sendWhatsApp(c: Customer, text: string) {
    const url = `https://wa.me/967${c.phone.replace(/^0+/, '')}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
    toast.success("تم فتح الواتساب للإرسال");
    logMovement(c.id, "واتساب", 0, `إرسال رسالة واتساب للعميل: ${c.name}`);
  }

  return (
    <AppShell title="إدارة العملاء والحسابات المالية (CRM & Credit)">
      <Tabs defaultValue="directory" dir="rtl" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 no-print">
          <TabsList>
            <TabsTrigger value="directory">دليل العملاء</TabsTrigger>
            <TabsTrigger value="crm">التحليل والمتابعة (CRM)</TabsTrigger>
            <TabsTrigger value="vouchers">سندات القبض والصرف</TabsTrigger>
            <TabsTrigger value="plans">خطط السداد</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpenVoucher(true)} disabled={!canAction("cash.manage")}><Receipt className="size-4 ml-2" /> سند جديد</Button>
            <Button onClick={() => setOpenAdd(true)} disabled={!canAction("customers.manage")}><UserPlus className="size-4 ml-2" /> إضافة عميل</Button>
          </div>
        </div>

        <TabsContent value="directory" className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input className="pr-10 bg-card" placeholder="ابحث باسم العميل أو رقم الهاتف أو العنوان…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {inactivityDays !== null && <Button variant={inactiveOnly ? "default" : "outline"} onClick={() => setInactiveOnly((value) => !value)}>غير النشطين: {inactiveCustomers.length}</Button>}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const overLimit = c.customer_type === "credit" && c.balance > c.credit_limit;
              return (
                <div key={c.id} className="rounded-xl bg-card shadow-card p-4 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-base">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.customer_type === "credit" ? "آجل" : c.customer_type === "wholesale" ? "جملة" : "نقدي"}</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${overLimit ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                        الرصيد: {c.balance} ر.ي
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5"><Phone className="size-3.5" /> {c.phone} {c.secondary_phone ? `· ${c.secondary_phone}` : ""}</div>
                      <div className="flex items-center gap-1.5"><MapPin className="size-3.5" /> {c.address || "بدون عنوان"}</div>
                      {isInactiveCustomer(c, inactivityDays) && <div className="font-semibold text-warning">عميل غير نشط</div>}
                      {c.customer_type === "credit" && <div>سقف المديونية: {c.credit_limit} ر.ي {overLimit && <span className="text-destructive font-bold">(متجاوز الحد!)</span>}</div>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t text-xs">
                  {inactivityDays !== null && <label className="flex items-center gap-1"><Checkbox checked={c.inactive_alert_enabled !== false} disabled={!canAction("customers.manage")} onCheckedChange={(checked) => void setInactiveAlert(c.id, checked === true)} /><span>تنبيه عدم النشاط</span></label>}
                    <Button size="sm" variant="outline" onClick={() => setSelectedCustomer(c)}>كشف حساب</Button>
                    <Button size="sm" variant="ghost" className="text-success" onClick={() => sendWhatsApp(c, `مرحباً بك يا ${c.name}، نود تذكيركم بأن رصيدكم الحالي هو ${c.balance} ر.ي. شكراً لتعاملكم معنا (مكتبة ومحلات الإخوة).`)}>
                      <MessageSquare className="size-4 ml-1" /> واتساب
                    </Button>
                    <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => deleteCust(c.id, c.name)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="crm">
          <div className="rounded-xl bg-card shadow-card p-6 space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2"><Users className="size-5 text-primary" /> تحليل ومتابعة العملاء وخدمة العملاء (CRM)</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted"><div className="text-2xl font-bold">{customers.length}</div><div className="text-xs text-muted-foreground">إجمالي العملاء</div></div>
              <div className="p-4 rounded-lg bg-muted"><div className="text-2xl font-bold">{customers.filter(c => c.balance > 0).length}</div><div className="text-xs text-muted-foreground">عملاء عليهم مديونيات</div></div>
              <div className="p-4 rounded-lg bg-muted"><div className="text-2xl font-bold">{customers.filter(c => c.customer_type === "credit" && c.balance > c.credit_limit).length}</div><div className="text-xs text-muted-foreground">متجاوزو سقف المديونية</div></div>
              <div className="p-4 rounded-lg bg-muted"><div className="text-2xl font-bold">{inactiveCustomers.length}</div><div className="text-xs text-muted-foreground">عملاء غير نشطين</div></div>
            </div>
            {inactivityDays === null && <p className="text-sm text-muted-foreground">حدد فترة عدم النشاط من الإعدادات لتفعيل متابعة العملاء غير النشطين.</p>}
            <div className="pt-4 border-t flex gap-2">
              <Button onClick={(): void => {
                const overdueList = inactiveCustomers.filter((customer) => customer.inactive_alert_enabled !== false);
                if (!overdueList.length) {
                  toast.error("لا يوجد عملاء غير نشطين يسمح تنبيههم");
                  return;
                }
                for (const c of overdueList) {
                  const message = c.balance > 0
                    ? `مرحباً ${c.name}، نود تذكيركم بالرصيد المستحق ${c.balance} ر.ي. يسعدنا تواصلكم.`
                    : `مرحباً ${c.name}، نفتقد زيارتكم ونسعد بخدمتكم من جديد.`;
                  sendWhatsApp(c, message);
                }
              }} disabled={inactivityDays === null}><Send className="size-4 ml-2" /> تنبيه العملاء غير النشطين عبر واتساب</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vouchers">
          <div className="rounded-xl bg-card shadow-card p-6 space-y-4">
            <div className="flex justify-between items-center"><h3 className="font-bold text-lg">سندات القبض والصرف الخزينة</h3><Button onClick={() => setOpenVoucher(true)}><Receipt className="size-4 ml-2" /> سند جديد</Button></div>
            <div className="rounded-lg border divide-y text-sm">
              {vouchers.map(v => {
                const cust = customers.find(c => c.id === v.customerId);
                return (
                  <div key={v.id} className="p-3 flex justify-between items-center">
                    <div>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${v.type === "receipt" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {v.type === "receipt" ? "سند قبض" : "سند صرف"}
                      </span>
                      <span className="font-semibold mx-2">{cust?.name || v.payee || "غير محدد"}</span>
                      <span className="text-muted-foreground">({v.method})</span>
                      {v.status === "draft" && <span className="text-warning text-xs mr-2">مسودة</span>}
                    </div>
                    <div className="text-left">
                      <div className="font-bold">{v.amount} {v.currency}</div>
                      <div className="text-xs text-muted-foreground">{new Date(v.at).toLocaleString("ar")}</div>
                    </div>
                    {v.status === "draft" && <Button size="sm" variant="outline" disabled={!canAction("cash.manage")} onClick={() => void postSavedVoucher(v.id)}>ترحيل</Button>}
                  </div>
                );
              })}
              {vouchers.length === 0 && <div className="p-8 text-center text-muted-foreground">لا توجد سندات مسجلة بعد</div>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="plans">
          <div className="rounded-xl bg-card shadow-card p-6 space-y-4">
            <div className="flex justify-between items-center"><h3 className="font-bold text-lg">خطط السداد وجدولة الديون</h3><Button onClick={() => setOpenPlan(true)}><Calendar className="size-4 ml-2" /> خطة جديدة</Button></div>
            <div className="rounded-lg border divide-y text-sm">
              {plans.map(p => {
                const cust = customers.find(c => c.id === p.customerId);
                return (
                  <div key={p.id} className="p-3 flex justify-between items-center">
                    <div>
                      <div className="font-bold">{cust?.name || "عميل"}</div>
                      <div className="text-xs text-muted-foreground">عدد الأقساط: {p.installmentsCount} · تاريخ الاستحقاق: {p.dueDate}</div>
                    </div>
                    <div className="text-left font-bold">{p.totalAmount} ر.ي</div>
                  </div>
                );
              })}
              {plans.length === 0 && <div className="p-8 text-center text-muted-foreground">لا توجد خطط سداد نشطة</div>}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Customer Dialog */}
      {openAdd && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">إضافة عميل جديد</h3>
            <form onSubmit={saveCustomer} className="space-y-3">
              <div className="space-y-1"><Label>اسم العميل *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم العميل الكامل" required /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>رقم الهاتف الأساسي *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="777123456" required /></div>
                <div className="space-y-1"><Label>رقم هاتف ثانوي</Label><Input value={secPhone} onChange={(e) => setSecPhone(e.target.value)} placeholder="اختياري" /></div>
              </div>
              <div className="space-y-1"><Label>العنوان</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="المدينة - الشارع" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>طبيعة العميل</Label>
                  <Select value={type} onValueChange={(v: any) => setType(v)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="credit">آجل</SelectItem><SelectItem value="cash">نقدي</SelectItem><SelectItem value="wholesale">جملة</SelectItem></SelectContent></Select>
                </div>
                <div className="space-y-1"><Label>سقف المديونية (ر.ي)</Label><Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="500000" /></div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpenAdd(false)}>إلغاء</Button>
                <Button type="submit">حفظ العميل</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Voucher Dialog */}
      {openVoucher && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">سند قبض / صرف جديد</h3>
            <form onSubmit={(event) => { event.preventDefault(); void saveVoucher(true); }} className="space-y-3">
              <div className="space-y-1"><Label>نوع السند</Label>
                <Select value={vType} onValueChange={(v: any) => setVType(v)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="receipt">سند قبض (قبض دفعة من عميل)</SelectItem><SelectItem value="payment">سند صرف (صرف مصروفات)</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>العميل {vType === "payment" ? "(اختياري للمصروفات)" : "*"}</Label>
                <Select value={vCustId || "__none__"} onValueChange={(value) => setVCustId(value === "__none__" ? "" : value)}><SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>{vType === "payment" && <SelectItem value="__none__">مصروف عام / مورد</SelectItem>}{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} (رصيد: {c.balance})</SelectItem>)}</SelectContent></Select>
              </div>
              {vType === "payment" && !vCustId && <div className="space-y-1"><Label htmlFor="voucher-payee">المستفيد / جهة الصرف *</Label><Input id="voucher-payee" value={vPayee} onChange={(event) => setVPayee(event.target.value)} required /></div>}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>المبلغ *</Label><Input type="number" step="any" value={vAmount} onChange={(e) => setVAmount(e.target.value)} placeholder="0.00" required /></div>
                <div className="space-y-1"><Label>العملة</Label>
                  <Select value={vCurr} onValueChange={setVCurr}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{currencies.filter((currency) => currency.active).map((currency) => <SelectItem key={currency.code} value={currency.code}>{currency.name} ({currency.code})</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              <div className="space-y-1"><Label>طريقة الدفع</Label><Input value={vMethod} onChange={(e) => setVMethod(e.target.value)} placeholder="نقدي / تحويل شبكة" /></div>
              <div className="space-y-1"><Label>ملاحظات / البيان</Label><Input value={vNotes} onChange={(e) => setVNotes(e.target.value)} placeholder="البيان التفصيلي" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpenVoucher(false)}>إلغاء</Button>
                <Button type="button" variant="outline" disabled={!canAction("cash.manage")} onClick={() => void saveVoucher(false)}>حفظ كمسودة</Button>
                <Button type="submit" disabled={!canAction("cash.manage")}>حفظ وترحيل السند</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Plan Dialog */}
      {openPlan && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">إنشاء خطة سداد مخصصة</h3>
            <form onSubmit={savePlan} className="space-y-3">
              <div className="space-y-1"><Label>العميل</Label>
                <Select value={pCustId} onValueChange={setPCustId}><SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>المبلغ الإجمالي المستحق *</Label><Input type="number" value={pAmount} onChange={(e) => setPAmount(e.target.value)} placeholder="100000" required /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>عدد الأقساط</Label><Input type="number" value={pCount} onChange={(e) => setPCount(e.target.value)} placeholder="3" /></div>
                <div className="space-y-1"><Label>تاريخ استحقاق القسط الأول *</Label><Input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} required /></div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpenPlan(false)}>إلغاء</Button>
                <Button type="submit">حفظ الخطة</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Statement Dialog */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b pb-3">
              <div><h3 className="font-bold text-xl">{selectedCustomer.name}</h3><p className="text-xs text-muted-foreground">{selectedCustomer.phone} · {selectedCustomer.address}</p></div>
              <Button size="icon" variant="ghost" onClick={() => setSelectedCustomer(null)}>✕</Button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 bg-muted p-4 rounded-xl">
              <div><div className="text-xs text-muted-foreground">الرصيد الحالي</div><div className="text-2xl font-bold text-primary">{selectedCustomer.balance} ر.ي</div></div>
              <div><div className="text-xs text-muted-foreground">سقف المديونية</div><div className="text-2xl font-bold">{selectedCustomer.credit_limit} ر.ي</div></div>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">سجل العمليات وكشف الحساب</h4>
              <div className="rounded-lg border divide-y text-sm">
                <div className="p-3 flex justify-between items-center text-muted-foreground"><span>رصيد افتتاح الحساب</span><span>0 ر.ي</span></div>
                {vouchers.filter(v => v.customerId === selectedCustomer.id && v.status === "posted").map(v => (
                  <div key={v.id} className="p-3 flex justify-between items-center">
                    <span>{v.type === "receipt" ? "سند قبض" : "سند صرف"} ({v.notes || v.method})</span>
                    <span className={v.type === "receipt" ? "text-success font-bold" : "text-destructive font-bold"}>{v.type === "receipt" ? `-${v.amount}` : `+${v.amount}`} {v.currency}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => sendWhatsApp(selectedCustomer, `كشف حساب العميل ${selectedCustomer.name}: الرصيد الحالي هو ${selectedCustomer.balance} ر.ي. (مكتبة ومحلات الإخوة).`)}>
                <MessageSquare className="size-4 ml-1.5" /> إرسال كشف الحساب واتساب
              </Button>
              <Button onClick={() => setSelectedCustomer(null)}>إغلاق</Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
