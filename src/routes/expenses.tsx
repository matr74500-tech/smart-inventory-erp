import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, RotateCcw, Filter, CreditCard, Calendar, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/hooks/use-inventory";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { enqueueRpc, isTransientNetworkError } from "@/lib/offline/rpc-queue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "المصروفات العامة | نظام المخزون الذكي" },
      {
        name: "description",
        content: "تسجيل المصروفات اليومية والشهرية والدورية والتشغيلية وربطها بحركات الصندوق.",
      },
    ],
  }),
  component: ExpensesPage,
});

type Expense = Tables<"general_expenses">;

const EXPENSE_TYPES: { value: string; label: string }[] = [
  { value: "daily", label: "يومي" },
  { value: "monthly", label: "شهري" },
  { value: "recurring", label: "دوري" },
  { value: "operational", label: "تشغيلي" },
];

const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: "rent", label: "إيجار" },
  { value: "salaries", label: "رواتب" },
  { value: "utilities", label: "مرافق (كهرباء/ماء/إنترنت)" },
  { value: "maintenance", label: "صيانة" },
  { value: "office_supplies", label: "مستلزمات مكتبية" },
  { value: "transport", label: "مواصلات" },
  { value: "marketing", label: "تسويق وإعلان" },
  { value: "other", label: "أخرى" },
];

const PAYMENT_METHODS = ["نقدي", "تحويل بنكي", "محفظة إلكترونية"];

function ExpensesPage() {
  const { canAction, can } = useAuth();
  const { currencies } = useInventory();
  const activeCurrencies = currencies.filter((c) => c.active);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openForm, setOpenForm] = useState(false);

  // Form state
  const [expenseType, setExpenseType] = useState<string>("operational");
  const [category, setCategory] = useState<string>("other");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState<string>(activeCurrencies[0]?.code ?? "YER");
  const [rateToYer, setRateToYer] = useState<number>(1);
  const [expenseDate, setExpenseDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("نقدي");

  // Filter state
  const [filterType, setFilterType] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const loadExpenses = useCallback(async () => {
    let query = supabase
      .from("general_expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (filterType !== "all") {
      query = query.eq("expense_type", filterType);
    }
    if (filterDateFrom) {
      query = query.gte("expense_date", filterDateFrom);
    }
    if (filterDateTo) {
      query = query.lte("expense_date", filterDateTo);
    }

    const { data, error } = await query;
    if (!error) setExpenses(data ?? []);
    setLoading(false);
  }, [filterType, filterDateFrom, filterDateTo]);

  useEffect(() => {
    void loadExpenses();
    const channel = supabase
      .channel("general-expenses")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "general_expenses" },
        () => void loadExpenses(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadExpenses]);

  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    [expenses],
  );

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (filterType !== "all" && e.expense_type !== filterType) return false;
      if (filterDateFrom && e.expense_date < filterDateFrom) return false;
      if (filterDateTo && e.expense_date > filterDateTo) return false;
      return true;
    });
  }, [expenses, filterType, filterDateFrom, filterDateTo]);

  async function saveExpense() {
    if (!canAction("expenses.manage")) {
      toast.error("ليس لديك صلاحية تسجيل المصروفات");
      return;
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("أدخل مبلغًا صحيحًا");
      return;
    }
    if (!expenseDate) {
      toast.error("اختر تاريخ المصروف");
      return;
    }
    if (!currencyCode) {
      toast.error("اختر العملة");
      return;
    }

    setBusy(true);
    const operationId = crypto.randomUUID();
    const args = {
      _expense_type: expenseType,
      _category: category,
      _description: description.trim() || null,
      _amount: amt,
      _currency_code: currencyCode,
      _rate_to_yer: rateToYer,
      _expense_date: expenseDate,
      _payment_method: paymentMethod,
    };

    try {
      if (!navigator.onLine) {
        await enqueueRpc({
          id: operationId,
          name: "record_general_expense_offline",
          args: { ...args, _operation_id: operationId },
        });
        toast.success("تم حفظ المصروف محليًا للمزامنة عند عودة الاتصال");
        resetForm();
        setOpenForm(false);
        setBusy(false);
        return;
      }
      const { error } = await supabase.rpc("record_general_expense", args);
      if (error) {
        if (/network|fetch|offline|failed/i.test(error.message)) {
          await enqueueRpc({
            id: operationId,
            name: "record_general_expense_offline",
            args: { ...args, _operation_id: operationId },
          });
          toast.success("تعذر الاتصال؛ حُفظ المصروف للمزامنة");
        } else {
          toast.error(`تعذر تسجيل المصروف: ${error.message}`);
        }
      } else {
        toast.success("تم تسجيل المصروف وإنشاء حركة الصندوق المقابلة");
        resetForm();
        setOpenForm(false);
      }
    } catch (error) {
      if (isTransientNetworkError(error)) {
        await enqueueRpc({
          id: operationId,
          name: "record_general_expense_offline",
          args: { ...args, _operation_id: operationId },
        });
        toast.success("انقطع الاتصال؛ حُفظ المصروف للمزامنة");
      } else {
        toast.error(
          `تعذر تسجيل المصروف: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setExpenseType("operational");
    setCategory("other");
    setDescription("");
    setAmount("");
    setPaymentMethod("نقدي");
    setExpenseDate("");
  }

  async function deleteExpense(id: string) {
    if (!confirm("تأكيد حذف المصروف؟")) return;
    const { error } = await supabase.from("general_expenses").delete().eq("id", id);
    if (error) toast.error(`تعذر الحذف: ${error.message}`);
    else toast.success("تم حذف المصروف");
  }

  const fmtMoney = (val: number, code: string) =>
    val.toLocaleString("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + code;

  const fmtDate = (val: string | null) => {
    if (!val) return "—";
    try {
      return new Date(val).toLocaleDateString("ar", {
        dateStyle: "medium",
      });
    } catch {
      return val;
    }
  };

  const typeLabels: Record<string, string> = {
    daily: "يومي",
    monthly: "شهري",
    recurring: "دوري",
    operational: "تشغيلي",
  };

  return (
    <AppShell title="المصروفات العامة" roles={["storekeeper"]}>
      <div className="space-y-5">
        {/* Header: total + add button */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">المصروفات العامة</h2>
            <p className="text-sm text-muted-foreground">
              إجمالي المصروفات المعروضة:{" "}
              <span className="font-medium">{fmtMoney(totalExpenses, "YER")}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setOpenForm(true)} disabled={!canAction("expenses.manage")}>
              <Plus className="size-4" /> مصروف جديد
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-xl bg-card p-4 shadow-card space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="size-4" /> تصفية
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="النوع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {EXPENSE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              placeholder="من تاريخ"
            />
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              placeholder="إلى تاريخ"
            />
          </div>
        </div>

        {/* Add expense form */}
        <DialogForm
          open={openForm}
          onOpenChange={setOpenForm}
          onSave={saveExpense}
          busy={busy}
          expenseType={expenseType}
          setExpenseType={setExpenseType}
          category={category}
          setCategory={setCategory}
          description={description}
          setDescription={setDescription}
          amount={amount}
          setAmount={setAmount}
          currencyCode={currencyCode}
          setCurrencyCode={setCurrencyCode}
          rateToYer={rateToYer}
          setRateToYer={setRateToYer}
          expenseDate={expenseDate}
          setExpenseDate={setExpenseDate}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          activeCurrencies={activeCurrencies}
          expenseTypes={EXPENSE_TYPES}
          expenseCategories={EXPENSE_CATEGORIES}
          paymentMethods={PAYMENT_METHODS}
          canSave={canAction("expenses.manage")}
        />

        {/* Expenses list */}
        <div className="rounded-xl bg-card shadow-card">
          <div className="border-b p-4">
            <h2 className="font-bold">سجل المصروفات</h2>
            <p className="text-sm text-muted-foreground">
              {filteredExpenses.length} مصروف · {fmtMoney(totalExpenses, "YER")} إجمالي
            </p>
          </div>
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">جارٍ التحميل…</p>
          ) : filteredExpenses.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">لا توجد مصروفات مدرجة.</p>
          ) : (
            <div className="divide-y">
              {filteredExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                >
                  <div className="flex-1 min-w-40">
                    <div className="font-medium">
                      {exp.category} —{" "}
                      {exp.expense_type === "operational"
                        ? typeLabels[exp.expense_type]
                        : typeLabels[exp.expense_type]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {exp.description || "بدون وصف"} · {fmtDate(exp.expense_date)}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span
                      className={`font-medium ${Number(exp.amount) >= 0 ? "text-destructive" : ""}`}
                    >
                      -{fmtMoney(Math.abs(Number(exp.amount)), exp.currency_code)}
                    </span>
                    {exp.cash_transaction_id && (
                      <span className="text-xs text-muted-foreground">مرتبط بالصندوق</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteExpense(exp.id)}
                      disabled={!canAction("expenses.manage")}
                      aria-label="حذف المصروف"
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
    </AppShell>
  );
}

function DialogForm({
  open,
  onOpenChange,
  onSave,
  busy,
  expenseType,
  setExpenseType,
  category,
  setCategory,
  description,
  setDescription,
  amount,
  setAmount,
  currencyCode,
  setCurrencyCode,
  rateToYer,
  setRateToYer,
  expenseDate,
  setExpenseDate,
  paymentMethod,
  setPaymentMethod,
  activeCurrencies,
  expenseTypes,
  expenseCategories,
  paymentMethods,
  canSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: () => void;
  busy: boolean;
  expenseType: string;
  setExpenseType: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  currencyCode: string;
  setCurrencyCode: (v: string) => void;
  rateToYer: number;
  setRateToYer: (v: number) => void;
  expenseDate: string;
  setExpenseDate: (v: string) => void;
  paymentMethod: string;
  setPaymentMethod: (v: string) => void;
  activeCurrencies: Tables<"currencies">[];
  expenseTypes: { value: string; label: string }[];
  expenseCategories: { value: string; label: string }[];
  paymentMethods: string[];
  canSave: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>تسجيل مصروف جديد</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="space-y-4"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>نوع المصروف</Label>
              <Select value={expenseType} onValueChange={setExpenseType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expenseTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الفئة</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>وصف المصروف</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثال: إيجار المتجر لشهر نوفمبر"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>المبلغ</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>طريقة الدفع</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>العملة</Label>
              <Select value={currencyCode} onValueChange={setCurrencyCode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeCurrencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>سعر الصرف إلى الريال</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={String(rateToYer)}
                onChange={(e) => setRateToYer(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>تاريخ المصروف</Label>
            <Input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !canSave}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CreditCard className="size-4" />
              )}
              {" تسجيل المصروف"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
