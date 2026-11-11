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

export const Route = createFileRoute("/customers")({
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
  whatsapp_auto: boolean;
  created_at: string;
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
  notes: string;
  at: string;
};

function CustomersPage() {
  const { canAction } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("suhail_customers") || '[{"id":"1","name":"محمد علي","phone":"777123456","address":"ذمار - المركز","customer_type":"credit","credit_limit":500000,"balance":120000,"whatsapp_auto":true,"created_at":"2026-01-01"}]');
    } catch {
      return [];
    }
  });

  const [plans, setPlans] = useState<PaymentPlan[]>(() => {
    try { return JSON.parse(localStorage.getItem("suhail_payment_plans") || "[]"); } catch { return []; }
  });

  const [vouchers, setVouchers] = useState<Voucher[]>(() => {
    try { return JSON.parse(localStorage.getItem("suhail_vouchers") || "[]"); } catch { return []; }
  });

  const [q, setQ] = useState("");
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
  const [vAmount, setVAmount] = useState("");
  const [vCurr, setVCurr] = useState("YER");
  const [vMethod, setVMethod] = useState("نقدي YER");
  const [vNotes, setVNotes] = useState("");

  // Plan Form state
  const [pCustId, setPCustId] = useState("");
  const [pAmount, setPAmount] = useState("");
  const [pCount, setPCount] = useState("3");
  const [pDate, setPDate] = useState("");

  const saveCustomer = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return toast.error("الاسم ورقم الهاتف مطلوبان");

    const newCust: Customer = {
      id: Date.now().toString(),
      name: name.trim(),
      phone: phone.trim(),
      secondary_phone: secPhone.trim(),
      address: address.trim(),
      customer_type: type,
      credit_limit: Number(limit) || 0,
      balance: 0,
      whatsapp_auto: true,
      created_at: new Date().toISOString(),
    };

    const next = [newCust, ...customers];
    setCustomers(next);
    localStorage.setItem("suhail_customers", JSON.stringify(next));
    logMovement(newCust.id, "إضافة عميل", 0, `إضافة العميل: ${newCust.name} (${newCust.customer_type})`);
    toast.success("تمت إضافة العميل بنجاح");
    setName(""); setPhone(""); setSecPhone(""); setAddress(""); setOpenAdd(false);
  };

  const saveVoucher = (e: FormEvent) => {
    e.preventDefault();
    if (!vCustId || !vAmount) return toast.error("الرجاء اختيار العميل وتحديد المبلغ");
    const amt = Number(vAmount);
    if (isNaN(amt) || amt <= 0) return toast.error("مبلغ غير صالح");

    const cust = customers.find(c => c.id === vCustId);
    if (!cust) return toast.error("العميل غير موجود");

    const newVoucher: Voucher = {
      id: Date.now().toString(),
      type: vType,
      customerId: vCustId,
      amount: amt,
      currency: vCurr,
      method: vMethod,
      notes: vNotes.trim(),
      at: new Date().toISOString(),
    };

    const nextV = [newVoucher, ...vouchers];
    setVouchers(nextV);
    localStorage.setItem("suhail_vouchers", JSON.stringify(nextV));

    // Update customer balance
    const nextC = customers.map(c => {
      if (c.id === vCustId) {
        const newBal = vType === "receipt" ? c.balance - amt : c.balance + amt;
        return { ...c, balance: newBal };
      }
      return c;
    });
    setCustomers(nextC);
    localStorage.setItem("suhail_customers", JSON.stringify(nextC));

    logMovement(vCustId, vType === "receipt" ? "سند قبض" : "سند صرف", amt, `سند ${vType === "receipt" ? "قبض" : "صرف"} بقيمة ${amt} ${vCurr} للعميل ${cust.name}`);
    toast.success(`تم تسجيل وحفظ سند ال${vType === "receipt" ? "قبض" : "صرف"} بنجاح`);

    if (cust.whatsapp_auto) {
      const msg = `مكتبة ومحلات الإخوة:\nسند ${vType === "receipt" ? "قبض" : "صرف"} بقيمة ${amt} ${vCurr}\nالعميل: ${cust.name}\nالرصيد الحالي: ${cust.balance} ر.ي`;
      window.open(`https://wa.me/967${cust.phone.replace(/^0+/, '')}?text=${encodeURIComponent(msg)}`, "_blank");
    }

    setVAmount(""); setVNotes(""); setOpenVoucher(false);
  };

  const savePlan = (e: FormEvent) => {
    e.preventDefault();
    if (!pCustId || !pAmount || !pDate) return toast.error("جميع الحقول مطلوبة");
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

  const deleteCust = (id: string, custName: string) => {
    if (!canAction("inventory.delete")) return toast.error("ليس لديك صلاحية الحذف");
    if (!confirm(`تأكيد حذف العميل ${custName}؟`)) return;
    const next = customers.filter(c => c.id !== id);
    setCustomers(next);
    localStorage.setItem("suhail_customers", JSON.stringify(next));
    logMovement(id, "حذف عميل", 0, `حذف العميل: ${custName}`);
    toast.success("تم حذف العميل");
    if (selectedCustomer?.id === id) setSelectedCustomer(null);
  };

  const filtered = useMemo(() => customers.filter(c => c.name.includes(q) || c.phone.includes(q) || c.address.includes(q)), [customers, q]);

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
            <Button variant="outline" onClick={() => setOpenVoucher(true)}><Receipt className="size-4 ml-2" /> سند جديد</Button>
            <Button onClick={() => setOpenAdd(true)}><UserPlus className="size-4 ml-2" /> إضافة عميل</Button>
          </div>
        </div>

        <TabsContent value="directory" className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input className="pr-10 bg-card" placeholder="ابحث باسم العميل أو رقم الهاتف أو العنوان…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
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
                      {c.customer_type === "credit" && <div>سقف المديونية: {c.credit_limit} ر.ي {overLimit && <span className="text-destructive font-bold">(متجاوز الحد!)</span>}</div>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t text-xs">
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
            </div>
            <div className="pt-4 border-t flex gap-2">
              <Button onClick={() => {
                const overdueList = customers.filter(c => c.balance > 0);
                if (!overdueList.length) return toast.error("لا توجد مديونيات مستحقة");
                for (const c of overdueList) {
                  sendWhatsApp(c, `تنبيه سداد من مكتبة ومحلات الإخوة:\nعزيزنا العميل ${c.name}، نود تذكيركم بسداد المديونية المستحقة بقيمة ${c.balance} ر.ي.`);
                }
              }}><Send className="size-4 ml-2" /> إرسال تنبيهات جماعية واتساب للمتعثرين</Button>
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
                      <span className="font-semibold mx-2">{cust?.name || "عميل غير معروف"}</span>
                      <span className="text-muted-foreground">({v.method})</span>
                    </div>
                    <div className="text-left">
                      <div className="font-bold">{v.amount} {v.currency}</div>
                      <div className="text-xs text-muted-foreground">{new Date(v.at).toLocaleString("ar")}</div>
                    </div>
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
            <form onSubmit={saveVoucher} className="space-y-3">
              <div className="space-y-1"><Label>نوع السند</Label>
                <Select value={vType} onValueChange={(v: any) => setVType(v)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="receipt">سند قبض (قبض دفعة من عميل)</SelectItem><SelectItem value="payment">سند صرف (صرف مصروفات)</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>العميل</Label>
                <Select value={vCustId} onValueChange={setVCustId}><SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} (رصيد: {c.balance})</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label>المبلغ *</Label><Input type="number" step="any" value={vAmount} onChange={(e) => setVAmount(e.target.value)} placeholder="0.00" required /></div>
                <div className="space-y-1"><Label>العملة</Label>
                  <Select value={vCurr} onValueChange={setVCurr}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="YER">ريال يمني (YER)</SelectItem><SelectItem value="SAR">ريال سعودي (SAR)</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="space-y-1"><Label>طريقة الدفع</Label><Input value={vMethod} onChange={(e) => setVMethod(e.target.value)} placeholder="نقدي / تحويل شبكة" /></div>
              <div className="space-y-1"><Label>ملاحظات / البيان</Label><Input value={vNotes} onChange={(e) => setVNotes(e.target.value)} placeholder="البيان التفصيلي" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpenVoucher(false)}>إلغاء</Button>
                <Button type="submit">حفظ وترحيل السند</Button>
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
                {vouchers.filter(v => v.customerId === selectedCustomer.id).map(v => (
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
