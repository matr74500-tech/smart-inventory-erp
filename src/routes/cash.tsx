import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/hooks/use-inventory";
import type { Tables } from "@/integrations/supabase/types";
import { enqueueRpc } from "@/lib/offline/rpc-queue";

export const Route = createFileRoute("/cash")({
  head: () => ({ meta: [{ title: "الصندوق والإقفال اليومي | نظام المخزون الذكي" }] }),
  component: CashPage,
});

type CashTransaction = Tables<"cash_transactions">;
type CashClosing = Tables<"daily_cash_closings">;

function CashPage() {
  const { canAction } = useAuth();
  const { currencies } = useInventory();
  const [businessDate, setBusinessDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [closings, setClosings] = useState<CashClosing[]>([]);
  const [openingAmounts, setOpeningAmounts] = useState<Record<string, string>>({});
  const [countedAmounts, setCountedAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setOpeningAmounts({});
    setCountedAmounts({});
    setNotes("");
    const start = new Date(`${businessDate}T00:00:00`);
    const end = addDays(start, 1);
    async function loadCashData() {
      const [transactionResult, closingResult] = await Promise.all([
        supabase
          .from("cash_transactions")
          .select("*")
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .eq("affects_drawer", true)
          .order("created_at", { ascending: false }),
        supabase.from("daily_cash_closings").select("*").eq("business_date", businessDate),
      ]);
      if (!active) return;
      if (transactionResult.error)
        toast.error(`تعذر تحميل حركة الصندوق: ${transactionResult.error.message}`);
      else setTransactions(transactionResult.data ?? []);
      if (closingResult.error) toast.error(`تعذر تحميل الإقفال: ${closingResult.error.message}`);
      else {
        setClosings(closingResult.data ?? []);
        setOpeningAmounts((values) => {
          const next = { ...values };
          for (const closing of closingResult.data ?? [])
            next[closing.currency_code] ??= String(closing.opening_amount);
          return next;
        });
        setCountedAmounts((values) => {
          const next = { ...values };
          for (const closing of closingResult.data ?? [])
            next[closing.currency_code] ??= String(closing.counted_amount);
          return next;
        });
        const existingNotes = closingResult.data?.[0]?.notes;
        if (existingNotes) setNotes(existingNotes);
      }
      setLoading(false);
    }

    setLoading(true);
    void loadCashData();
    const channel = supabase
      .channel(`cash-${businessDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_transactions" },
        () => void loadCashData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_cash_closings" },
        () => void loadCashData(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [businessDate]);

  const closingsByCurrency = useMemo(
    () => new Map(closings.map((closing) => [closing.currency_code, closing])),
    [closings],
  );
  const movementTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const transaction of transactions) {
      totals[transaction.currency_code] =
        (totals[transaction.currency_code] ?? 0) + Number(transaction.amount);
    }
    return totals;
  }, [transactions]);

  function getOpening(code: string) {
    return Number(openingAmounts[code] ?? closingsByCurrency.get(code)?.opening_amount ?? 0);
  }

  function getExpected(code: string) {
    return getOpening(code) + (movementTotals[code] ?? 0);
  }

  async function closeDay() {
    if (!canAction("cash.close")) {
      toast.error("ليس لديك صلاحية إقفال الصندوق");
      return;
    }
    if (!businessDate) {
      toast.error("اختر تاريخ الإقفال");
      return;
    }
    const activeCurrencies = currencies.filter((currency) => currency.active);
    const counts = activeCurrencies.map((currency) => ({
      currency_code: currency.code,
      opening_amount: Number(
        openingAmounts[currency.code] ?? closingsByCurrency.get(currency.code)?.opening_amount,
      ),
      counted_amount: Number(countedAmounts[currency.code]),
    }));
    if (
      !counts.length ||
      counts.some((count, index) => {
        const code = activeCurrencies[index]?.code;
        const openingInput = code
          ? (openingAmounts[code] ?? closingsByCurrency.get(code)?.opening_amount)
          : undefined;
        const countedInput = code ? countedAmounts[code] : undefined;
        return (
          openingInput === undefined ||
          String(openingInput).trim() === "" ||
          countedInput === undefined ||
          countedInput.trim() === "" ||
          !Number.isFinite(count.opening_amount) ||
          count.opening_amount < 0 ||
          !Number.isFinite(count.counted_amount) ||
          count.counted_amount < 0
        );
      })
    ) {
      toast.error("أدخل رصيد الافتتاح والعد الفعلي لكل عملة");
      return;
    }
    setBusy(true);
    try {
      const operationId = crypto.randomUUID();
      const args = {
        _operation_id: operationId,
        _business_date: businessDate,
        _counts: counts,
        _notes: notes.trim() || null,
      };
      if (!navigator.onLine) {
        await enqueueRpc({ id: operationId, name: "close_daily_cash_offline", args });
        toast.success("تم حفظ الإقفال محليًا للمزامنة عند عودة الاتصال");
        return;
      }
      const { error } = await supabase.rpc("close_daily_cash_offline", args);
      if (error) {
        if (/network|fetch|offline|failed/i.test(error.message)) {
          await enqueueRpc({ id: operationId, name: "close_daily_cash_offline", args });
          toast.success("تعذر الاتصال؛ حُفظ الإقفال محليًا للمزامنة");
          return;
        }
        toast.error(`تعذر إقفال الصندوق: ${error.message}`);
        return;
      }
      toast.success("تم حفظ الإقفال اليومي ومزامنته");
    } catch (error) {
      toast.error(
        `تعذر الاتصال لإقفال الصندوق: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="الصندوق والإقفال اليومي">
      <div className="space-y-5">
        <section className="rounded-xl bg-card p-5 shadow-card space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="cash-business-date">تاريخ العمل</Label>
              <Input
                id="cash-business-date"
                type="date"
                value={businessDate}
                onChange={(event) => setBusinessDate(event.target.value)}
              />
            </div>
            <Button onClick={closeDay} disabled={loading || busy || !canAction("cash.close")}>
              {busy ? "جارٍ حفظ الإقفال…" : "حفظ الإقفال اليومي"}
            </Button>
          </div>
          {!canAction("cash.close") && (
            <p className="text-sm text-muted-foreground">
              يمكنك عرض حركة الصندوق، لكن صلاحية الإقفال للمدير أو الموظف المخوّل.
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {currencies
              .filter((currency) => currency.active)
              .map((currency) => {
                const closing = closingsByCurrency.get(currency.code);
                const expected = getExpected(currency.code);
                const counted = Number(countedAmounts[currency.code]);
                const difference = Number.isFinite(counted) ? counted - expected : null;
                return (
                  <div key={currency.code} className="rounded-lg border p-4 space-y-3">
                    <h2 className="font-bold">
                      {currency.name} ({currency.code})
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`opening-${currency.code}`}>رصيد بداية اليوم</Label>
                        <Input
                          id={`opening-${currency.code}`}
                          type="number"
                          min="0"
                          step="any"
                          value={openingAmounts[currency.code] ?? closing?.opening_amount ?? ""}
                          onChange={(event) =>
                            setOpeningAmounts((values) => ({
                              ...values,
                              [currency.code]: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`counted-${currency.code}`}>النقد الفعلي في الدرج</Label>
                        <Input
                          id={`counted-${currency.code}`}
                          type="number"
                          min="0"
                          step="any"
                          value={countedAmounts[currency.code] ?? ""}
                          onChange={(event) =>
                            setCountedAmounts((values) => ({
                              ...values,
                              [currency.code]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>الرصيد المتوقع</span>
                      <strong>
                        {expected.toFixed(2)} {currency.code}
                      </strong>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>الفرق</span>
                      <strong
                        className={
                          difference === null
                            ? ""
                            : difference === 0
                              ? "text-success"
                              : "text-destructive"
                        }
                      >
                        {difference === null ? "—" : `${difference.toFixed(2)} ${currency.code}`}
                      </strong>
                    </div>
                    {closing && (
                      <p className="text-xs text-muted-foreground">
                        آخر إقفال: {new Date(closing.closed_at).toLocaleString("ar")}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="space-y-1">
            <Label htmlFor="cash-closing-notes">ملاحظات الإقفال</Label>
            <Input
              id="cash-closing-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="ملاحظات أو فروقات الجرد"
            />
          </div>
        </section>

        <section className="rounded-xl bg-card shadow-card">
          <div className="border-b p-4">
            <h2 className="font-bold">الحركة النقدية لهذا اليوم</h2>
            <p className="text-sm text-muted-foreground">
              المبالغ تشمل المبيعات والسندات المرحلة فقط.
            </p>
          </div>
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">جارٍ تحميل الحركة…</p>
          ) : (
            <div className="divide-y">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm"
                >
                  <div>
                    <div className="font-medium">
                      {transaction.source_type === "sale" ? "فاتورة بيع" : "سند نقدي"} ·{" "}
                      {transaction.payment_method}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(transaction.created_at).toLocaleString("ar")} · رقم مرجعي{" "}
                      {transaction.source_id}
                    </div>
                  </div>
                  <strong className={transaction.amount > 0 ? "text-success" : "text-destructive"}>
                    {Number(transaction.amount).toFixed(2)} {transaction.currency_code}
                  </strong>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="p-8 text-center text-muted-foreground">
                  لا توجد حركات نقدية لهذا التاريخ.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
