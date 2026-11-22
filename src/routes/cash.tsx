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
type CashShift = Tables<"cash_shifts">;

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

  // Shift (وردية) state.
  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [shiftOpening, setShiftOpening] = useState<Record<string, string>>({});
  const [shiftCounted, setShiftCounted] = useState<Record<string, string>>({});
  const [shiftNotes, setShiftNotes] = useState("");
  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftTx, setShiftTx] = useState<CashTransaction[]>([]);

  const activeCurrencies = useMemo(
    () => currencies.filter((currency) => currency.active),
    [currencies],
  );

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

  // Load shifts and keep them live.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("cash_shifts")
        .select("*")
        .order("opened_at", { ascending: false });
      if (!active) return;
      if (error) toast.error(`تعذر تحميل الورديات: ${error.message}`);
      else setShifts(data ?? []);
    };
    void load();
    const channel = supabase
      .channel("cash-shifts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_shifts" },
        () => void load(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const openShift = useMemo(() => shifts.find((shift) => shift.status === "open"), [shifts]);
  const closedShifts = useMemo(() => shifts.filter((shift) => shift.status === "closed"), [shifts]);

  // Live cash movements inside the open shift window (sales + vouchers).
  useEffect(() => {
    let active = true;
    if (!openShift) {
      setShiftTx([]);
      return;
    }
    const load = async () => {
      const { data, error } = await supabase
        .from("cash_transactions")
        .select("*")
        .gte("created_at", openShift.opened_at)
        .eq("affects_drawer", true)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) toast.error(`تعذر تحميل حركة الوردية: ${error.message}`);
      else setShiftTx(data ?? []);
    };
    void load();
    const channel = supabase
      .channel(`cash-shift-tx-${openShift.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_transactions" },
        () => void load(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [openShift]);

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

  const shiftMovementTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const transaction of shiftTx) {
      totals[transaction.currency_code] =
        (totals[transaction.currency_code] ?? 0) + Number(transaction.amount);
    }
    return totals;
  }, [shiftTx]);

  const shiftBreakdown = useMemo(() => {
    let sales = 0;
    let receipts = 0;
    let payments = 0;
    for (const transaction of shiftTx) {
      const amount = Number(transaction.amount);
      if (transaction.source_type === "sale") sales += amount;
      else if (transaction.source_type === "voucher") {
        if (amount >= 0) receipts += amount;
        else payments += amount;
      }
    }
    return { sales, receipts, payments };
  }, [shiftTx]);

  const shiftOpeningMap = useMemo(() => {
    const raw = (openShift?.opening ?? {}) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [code, value] of Object.entries(raw)) out[code] = Number(value) || 0;
    return out;
  }, [openShift]);

  function getOpening(code: string) {
    return Number(openingAmounts[code] ?? closingsByCurrency.get(code)?.opening_amount ?? 0);
  }

  function getExpected(code: string) {
    return getOpening(code) + (movementTotals[code] ?? 0);
  }

  async function openShiftFn() {
    if (!canAction("cash.manage")) {
      toast.error("ليس لديك صلاحية إدارة الصندوق");
      return;
    }
    const opening = Object.fromEntries(
      activeCurrencies.map((currency) => [currency.code, Number(shiftOpening[currency.code] || 0)]),
    );
    if (
      activeCurrencies.some(
        (currency) =>
          shiftOpening[currency.code] === undefined ||
          shiftOpening[currency.code].trim() === "" ||
          !Number.isFinite(Number(shiftOpening[currency.code])) ||
          Number(shiftOpening[currency.code]) < 0,
      )
    ) {
      toast.error("أدخل رصيدًا افتتاحيًا صحيحًا لكل عملة");
      return;
    }
    setShiftBusy(true);
    try {
      const { error } = await supabase.rpc("open_cash_shift", { _opening: opening });
      if (error) {
        toast.error(`تعذر فتح الوردية: ${error.message}`);
        return;
      }
      toast.success("تم فتح الوردية");
      setShiftOpening({});
    } catch (error) {
      toast.error(
        `تعذر الاتصال لفتح الوردية: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setShiftBusy(false);
    }
  }

  async function closeShiftFn() {
    if (!openShift) return;
    if (!canAction("cash.close")) {
      toast.error("ليس لديك صلاحية إقفال الوردية");
      return;
    }
    const counts = Object.fromEntries(
      activeCurrencies.map((currency) => [
        currency.code,
        Number(shiftCounted[currency.code] ?? ""),
      ]),
    );
    if (
      activeCurrencies.some(
        (currency) =>
          shiftCounted[currency.code] === undefined ||
          shiftCounted[currency.code].trim() === "" ||
          !Number.isFinite(Number(shiftCounted[currency.code])) ||
          Number(shiftCounted[currency.code]) < 0,
      )
    ) {
      toast.error("أدخل النقد الفعلي لكل عملة");
      return;
    }
    setShiftBusy(true);
    try {
      const { error } = await supabase.rpc("close_cash_shift", {
        _id: openShift.id,
        _counts: counts,
        _notes: shiftNotes.trim() || null,
      });
      if (error) {
        toast.error(`تعذر إقفال الوردية: ${error.message}`);
        return;
      }
      toast.success("تم إقفال الوردية");
      setShiftCounted({});
      setShiftNotes("");
    } catch (error) {
      toast.error(
        `تعذر الاتصال لإقفال الوردية: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setShiftBusy(false);
    }
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
    const activeCurrencyList = activeCurrencies;
    const counts = activeCurrencyList.map((currency) => ({
      currency_code: currency.code,
      opening_amount: Number(
        openingAmounts[currency.code] ?? closingsByCurrency.get(currency.code)?.opening_amount,
      ),
      counted_amount: Number(countedAmounts[currency.code]),
    }));
    if (
      !counts.length ||
      counts.some((count, index) => {
        const code = activeCurrencyList[index]?.code;
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
        {/* Shifts (ورديات الكاشير والمستلم) */}
        <section className="rounded-xl bg-card p-5 shadow-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">ورديات الصندوق</h2>
            {openShift && (
              <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                وردية مفتوحة
              </span>
            )}
          </div>

          {!openShift ? (
            canAction("cash.manage") ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  أدخل الرصيد النقدي الافتتاحي (العهدة) لكل عملة ثم افتح الوردية. ستُربط حركة
                  المبيعات والسندات تلقائيًا بهذه الوردية.
                </p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {activeCurrencies.map((currency) => (
                    <div key={currency.code} className="space-y-1 rounded-lg border p-3">
                      <Label className="text-xs">
                        رصيد افتتاح {currency.name} ({currency.code})
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={shiftOpening[currency.code] ?? ""}
                        onChange={(event) =>
                          setShiftOpening((values) => ({
                            ...values,
                            [currency.code]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <Button onClick={openShiftFn} disabled={shiftBusy}>
                  {shiftBusy ? "جارٍ الفتح…" : "فتح وردية جديدة"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                لا توجد وردية مفتوحة. فتح الورديات يحتاج صلاحية إدارة الصندوق.
              </p>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                بدأت الوردية {new Date(openShift.opened_at).toLocaleString("ar")}
              </p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {activeCurrencies.map((currency) => {
                  const opening = shiftOpeningMap[currency.code] ?? 0;
                  const movement = shiftMovementTotals[currency.code] ?? 0;
                  const expected = opening + movement;
                  const countedRaw = shiftCounted[currency.code];
                  const difference =
                    countedRaw !== undefined &&
                    countedRaw.trim() !== "" &&
                    Number.isFinite(Number(countedRaw))
                      ? Number(countedRaw) - expected
                      : null;
                  return (
                    <div key={currency.code} className="space-y-2 rounded-lg border p-3">
                      <h3 className="text-sm font-semibold">
                        {currency.name} ({currency.code})
                      </h3>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">الرصيد الافتتاحي</span>
                        <strong>{opening.toFixed(2)}</strong>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">صافي الحركة</span>
                        <strong className={movement >= 0 ? "text-success" : "text-destructive"}>
                          {movement.toFixed(2)}
                        </strong>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">الرصيد المتوقع</span>
                        <strong>{expected.toFixed(2)}</strong>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">النقد الفعلي في الدرج</Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={shiftCounted[currency.code] ?? ""}
                          onChange={(event) =>
                            setShiftCounted((values) => ({
                              ...values,
                              [currency.code]: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">الفرق</span>
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
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-4 rounded-lg bg-muted/50 p-3 text-xs">
                <span>
                  مبيعات: <b>{shiftBreakdown.sales.toFixed(2)}</b>
                </span>
                <span>
                  مقبوضات: <b className="text-success">{shiftBreakdown.receipts.toFixed(2)}</b>
                </span>
                <span>
                  مصروفات/صرف:{" "}
                  <b className="text-destructive">{shiftBreakdown.payments.toFixed(2)}</b>
                </span>
              </div>
              <div className="space-y-1">
                <Label>ملاحظات الإقفال</Label>
                <Input
                  value={shiftNotes}
                  onChange={(event) => setShiftNotes(event.target.value)}
                  placeholder="ملاحظات أو فروقات الوردية"
                />
              </div>
              <Button onClick={closeShiftFn} disabled={shiftBusy || !canAction("cash.close")}>
                {shiftBusy ? "جارٍ الإقفال…" : "إقفال الوردية"}
              </Button>
            </div>
          )}

          {closedShifts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">الورديات المغلقة</h3>
              <div className="divide-y">
                {closedShifts.slice(0, 10).map((shift) => (
                  <div
                    key={shift.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {new Date(shift.opened_at).toLocaleString("ar")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {shift.closed_at
                          ? `أُقفلت ${new Date(shift.closed_at).toLocaleString("ar")}`
                          : ""}
                      </div>
                    </div>
                    <div className="text-xs">
                      {Object.entries((shift.difference ?? {}) as Record<string, number>).map(
                        ([code, diff]) => (
                          <span
                            key={code}
                            className={Number(diff) === 0 ? "text-success" : "text-destructive"}
                          >
                            {code}: {Number(diff).toFixed(2)}{" "}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

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
            {activeCurrencies.map((currency) => {
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
