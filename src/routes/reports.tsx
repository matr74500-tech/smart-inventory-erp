import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useInventory } from "@/hooks/use-inventory";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "تقارير المبيعات والحركة اليومية | نظام المخزون الذكي" }] }),
  component: ReportsPage,
});

type Invoice = Tables<"sales_invoices">;
type Movement = Tables<"stock_movements">;
type CashTransaction = Tables<"cash_transactions">;

function ReportsPage() {
  const { products } = useInventory();
  const [businessDate, setBusinessDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const start = new Date(`${businessDate}T00:00:00`);
    const end = addDays(start, 1);
    async function loadReport() {
      const [invoiceResult, movementResult, cashResult] = await Promise.all([
        supabase
          .from("sales_invoices")
          .select("*")
          .eq("status", "posted")
          .gte("posted_at", start.toISOString())
          .lt("posted_at", end.toISOString())
          .order("posted_at", { ascending: false }),
        supabase
          .from("stock_movements")
          .select("*")
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .order("created_at", { ascending: false }),
        supabase
          .from("cash_transactions")
          .select("*")
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString())
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      if (invoiceResult.error) {
        setInvoices([]);
        toast.error(`تعذر تحميل تقرير المبيعات: ${invoiceResult.error.message}`);
      } else setInvoices(invoiceResult.data ?? []);
      if (movementResult.error) {
        setMovements([]);
        toast.error(`تعذر تحميل حركة المخزون: ${movementResult.error.message}`);
      } else setMovements(movementResult.data ?? []);
      if (cashResult.error) {
        setCashTransactions([]);
        toast.error(`تعذر تحميل الحركة النقدية: ${cashResult.error.message}`);
      } else setCashTransactions(cashResult.data ?? []);
      setLoading(false);
    }

    setLoading(true);
    void loadReport();
    const channel = supabase
      .channel(`reports-${businessDate}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_invoices" },
        () => void loadReport(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_movements" },
        () => void loadReport(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_transactions" },
        () => void loadReport(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [businessDate]);

  const totals = useMemo(
    () => ({
      salesYer: invoices.reduce((sum, invoice) => sum + Number(invoice.total_yer), 0),
      paidYer: invoices.reduce(
        (sum, invoice) => sum + Number(invoice.paid_amount) * Number(invoice.exchange_rate_to_yer),
        0,
      ),
      drawerYer: cashTransactions
        .filter((item) => item.affects_drawer)
        .reduce((sum, item) => sum + Number(item.amount) * Number(item.rate_to_yer), 0),
    }),
    [invoices, cashTransactions],
  );
  const productNames = useMemo(
    () => new Map(products.map((product) => [product.id, product.name])),
    [products],
  );

  return (
    <AppShell title="تقارير المبيعات والحركة اليومية">
      <div className="space-y-5">
        <section className="rounded-xl bg-card p-5 shadow-card">
          <div className="max-w-xs space-y-1">
            <Label htmlFor="report-date">التاريخ</Label>
            <Input
              id="report-date"
              type="date"
              value={businessDate}
              onChange={(event) => setBusinessDate(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3 mt-4">
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">إجمالي المبيعات (ر.ي)</div>
              <strong className="text-xl">{totals.salesYer.toFixed(2)}</strong>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">المبالغ المدفوعة (ر.ي)</div>
              <strong className="text-xl">{totals.paidYer.toFixed(2)}</strong>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <div className="text-sm text-muted-foreground">صافي حركة درج الريال اليمني</div>
              <strong className="text-xl">{totals.drawerYer.toFixed(2)}</strong>
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-card shadow-card">
          <h2 className="border-b p-4 font-bold">فواتير البيع المرحلة ({invoices.length})</h2>
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">جارٍ تحميل التقرير…</p>
          ) : (
            <div className="divide-y">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
                  <div>
                    <strong>فاتورة #{invoice.number}</strong> ·{" "}
                    {invoice.customer_name || "عميل نقدي"}
                    <div className="text-xs text-muted-foreground">
                      {invoice.posted_at ? new Date(invoice.posted_at).toLocaleString("ar") : ""} ·{" "}
                      {invoice.payment_method}
                    </div>
                  </div>
                  <strong>
                    {Number(invoice.total_yer).toFixed(2)} ر.ي · مدفوع{" "}
                    {Number(invoice.paid_amount).toFixed(2)} {invoice.currency_code}
                  </strong>
                </div>
              ))}
              {invoices.length === 0 && (
                <p className="p-8 text-center text-muted-foreground">
                  لا توجد فواتير مرحلة في هذا اليوم.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl bg-card shadow-card">
          <h2 className="border-b p-4 font-bold">الحركة اليومية للمخزون ({movements.length})</h2>
          <div className="divide-y">
            {movements.map((movement) => (
              <div key={movement.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
                <div>
                  <strong>{productNames.get(movement.product_id) ?? movement.product_id}</strong> ·{" "}
                  {movement.kind}
                  <div className="text-xs text-muted-foreground">
                    {movement.note ?? ""} · {new Date(movement.created_at).toLocaleString("ar")}
                  </div>
                </div>
                <strong>{Number(movement.quantity).toFixed(2)}</strong>
              </div>
            ))}
            {!loading && movements.length === 0 && (
              <p className="p-8 text-center text-muted-foreground">
                لا توجد حركات مخزون في هذا اليوم.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
