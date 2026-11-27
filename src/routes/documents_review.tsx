import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileSearch, Loader2, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/documents_review")({
  head: () => ({
    meta: [
      { title: "مراجعة الفواتير والسندات | نظام المخزون الذكي" },
      { name: "description", content: "مراجعة الفواتير والمستندات المالية مع بحث وفلاتر." },
    ],
  }),
  component: DocumentsReviewPage,
});

type SalesInvoice = Tables<"sales_invoices">;
type SalesReturn = Tables<"sales_returns">;
type Voucher = Tables<"vouchers">;

type DocTab = "sales" | "returns" | "receipts" | "payments";

function DocumentsReviewPage() {
  const { canAction } = useAuth();
  const [tab, setTab] = useState<DocTab>("sales");
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SalesInvoice[]>([]);
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateMode, setDateMode] = useState<"doc" | "created">("doc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [onlyBackdated, setOnlyBackdated] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes, vRes] = await Promise.all([
        supabase
          .from("sales_invoices")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("sales_returns")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("vouchers").select("*").order("created_at", { ascending: false }).limit(500),
      ]);
      if (sRes.error) throw sRes.error;
      if (rRes.error) throw rRes.error;
      if (vRes.error) throw vRes.error;
      setSales((sRes.data as SalesInvoice[]) ?? []);
      setReturns((rRes.data as SalesReturn[]) ?? []);
      setVouchers((vRes.data as Voucher[]) ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل المستندات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filterRowDate = useCallback(
    (d: string | null | undefined, created: string | null | undefined) => {
      const key = dateMode === "doc" ? d : created?.slice(0, 10);
      if (!key) return false;
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      return true;
    },
    [dateFrom, dateTo, dateMode],
  );

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((row) => {
      const ext = row as SalesInvoice & { is_backdated?: boolean; display_number?: string | null };
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (onlyBackdated && !ext.is_backdated) return false;
      if ((dateFrom || dateTo) && !filterRowDate((ext as { document_date?: string }).document_date, row.created_at)) return false;
      if (!q) return true;
      const hay = [
        String(row.number),
        ext.display_number ?? "",
        row.customer_name ?? "",
        row.notes ?? "",
        row.payment_method ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sales, search, statusFilter, onlyBackdated, filterRowDate]);

  const filteredReturns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return returns.filter((row) => {
      const ext = row as SalesReturn & { is_backdated?: boolean; display_number?: string | null; document_date?: string };
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (onlyBackdated && !ext.is_backdated) return false;
      if ((dateFrom || dateTo) && !filterRowDate(ext.document_date, row.created_at)) return false;
      if (!q) return true;
      const hay = [
        String(row.number),
        ext.display_number ?? "",
        row.customer_name ?? "",
        row.notes ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [returns, search, statusFilter, onlyBackdated, filterRowDate]);

  const filteredVouchers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((row) => {
      const ext = row as Voucher & { is_backdated?: boolean; display_number?: string | null; document_date?: string };
      if (tab === "receipts" && row.kind !== "receipt") return false;
      if (tab === "payments" && row.kind !== "payment") return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (onlyBackdated && !ext.is_backdated) return false;
      if ((dateFrom || dateTo) && !filterRowDate(ext.document_date, row.created_at)) return false;
      if (!q) return true;
      const hay = [
        String(row.number),
        ext.display_number ?? "",
        row.payee ?? "",
        row.notes ?? "",
        row.category ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [vouchers, tab, search, statusFilter, onlyBackdated, filterRowDate]);

  const summary = useMemo(() => {
    if (tab === "sales") {
      const list = filteredSales;
      const totalYER = list.reduce((s, r) => s + Number(r.total_yer ?? 0), 0);
      const drafts = list.filter((r) => r.status === "draft").length;
      return { count: list.length, totalYER, drafts };
    }
    if (tab === "returns") {
      const list = filteredReturns;
      const totalYER = list.reduce((s, r) => s + Number((r as SalesReturn).total_yer ?? 0), 0);
      const drafts = list.filter((r) => r.status === "draft").length;
      return { count: list.length, totalYER, drafts };
    }
    const list = filteredVouchers;
    const total = list.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const drafts = list.filter((r) => r.status === "draft").length;
    return { count: list.length, totalYER: total, drafts, kindLabel: tab === "receipts" ? "قبض" : "صرف" };
  }, [tab, filteredSales, filteredReturns, filteredVouchers]);

  const pagedSales = filteredSales.slice(page * pageSize, (page + 1) * pageSize);
  const pagedReturns = filteredReturns.slice(page * pageSize, (page + 1) * pageSize);
  const pagedVouchers = filteredVouchers.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => {
    setPage(0);
  }, [tab, search, dateFrom, dateTo, dateMode, statusFilter, onlyBackdated]);

  return (
    <AppShell title="مراجعة الفواتير والسندات" roles={["storekeeper", "cashier"]}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSearch className="size-5 text-primary" />
            <h2 className="font-bold text-lg">مراجعة ومتابعة المستندات</h2>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-4 ml-1 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">عدد المستندات</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{summary.count}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي (ر.ي مكافئ/مبلغ)</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{Number(summary.totalYER).toLocaleString("ar-YE")}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">مسودات</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{summary.drafts}</CardContent>
          </Card>
        </div>

        <div className="rounded-xl bg-card p-4 shadow-card space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1 md:col-span-2">
              <Label>بحث فوري</Label>
              <Input
                placeholder="رقم، اسم عميل/طرف، ملاحظة..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>فلترة التاريخ على</Label>
              <Select value={dateMode} onValueChange={(v) => setDateMode(v as "doc" | "created")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="doc">تاريخ المستند</SelectItem>
                  <SelectItem value="created">تاريخ الإدخال</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>الحالة</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="posted">مرحّل</SelectItem>
                  <SelectItem value="cancelled">ملغى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyBackdated}
                  onChange={(e) => setOnlyBackdated(e.target.checked)}
                  className="rounded"
                />
                تاريخ قديم/معدّل فقط
              </label>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as DocTab)} dir="rtl">
          <TabsList className="flex-wrap">
            <TabsTrigger value="sales">فواتير البيع</TabsTrigger>
            <TabsTrigger value="returns">مرتجعات</TabsTrigger>
            <TabsTrigger value="receipts">سندات قبض</TabsTrigger>
            <TabsTrigger value="payments">سندات صرف</TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            {loading ? (
              <div className="py-10 text-center text-muted-foreground">جارٍ التحميل...</div>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="p-2 text-right">الرقم</th>
                      <th className="p-2 text-right">التاريخ</th>
                      <th className="p-2 text-right">العميل</th>
                      <th className="p-2 text-right">الحالة</th>
                      <th className="p-2 text-right">الإجمالي</th>
                      <th className="p-2 text-right">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pagedSales.map((row) => {
                      const ext = row as SalesInvoice & { is_backdated?: boolean; display_number?: string | null; document_date?: string };
                      const docDate = ext.document_date ?? row.created_at?.slice(0, 10) ?? "—";
                      return (
                        <tr key={row.id} className={ext.is_backdated ? "bg-amber-50/80 dark:bg-amber-950/20" : ""}>
                          <td className="p-2 font-mono">{ext.display_number ?? row.number}</td>
                          <td className="p-2">
                            {docDate}
                            {ext.is_backdated && (
                              <Badge variant="outline" className="mr-1 text-xs border-amber-500 text-amber-700">
                                تاريخ قديم
                              </Badge>
                            )}
                          </td>
                          <td className="p-2">{row.customer_name || "نقدي"}</td>
                          <td className="p-2">
                            <Badge variant={row.status === "posted" ? "default" : "secondary"}>{row.status}</Badge>
                          </td>
                          <td className="p-2">{Number(row.total_yer).toLocaleString("ar-YE")} ر.ي</td>
                          <td className="p-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => window.print()}>
                              <Printer className="size-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {pagedSales.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          لا توجد نتائج
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="returns">
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="p-2 text-right">الرقم</th>
                    <th className="p-2 text-right">التاريخ</th>
                    <th className="p-2 text-right">العميل</th>
                    <th className="p-2 text-right">الحالة</th>
                    <th className="p-2 text-right">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pagedReturns.map((row) => {
                    const ext = row as SalesReturn & { is_backdated?: boolean; display_number?: string | null; document_date?: string };
                    const docDate = ext.document_date ?? row.created_at?.slice(0, 10) ?? "—";
                    return (
                      <tr key={row.id} className={ext.is_backdated ? "bg-amber-50/80 dark:bg-amber-950/20" : ""}>
                        <td className="p-2 font-mono">{ext.display_number ?? row.number}</td>
                        <td className="p-2">{docDate}</td>
                        <td className="p-2">{row.customer_name || "—"}</td>
                        <td className="p-2">
                          <Badge variant="secondary">{row.status}</Badge>
                        </td>
                        <td className="p-2">{Number(row.total_yer).toLocaleString("ar-YE")} ر.ي</td>
                      </tr>
                    );
                  })}
                  {pagedReturns.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        لا توجد نتائج
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="receipts">
            <VoucherTable rows={pagedVouchers} kind="receipt" />
          </TabsContent>
          <TabsContent value="payments">
            <VoucherTable rows={pagedVouchers} kind="payment" />
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            صفحة {page + 1} — عرض {tab === "sales" ? filteredSales.length : tab === "returns" ? filteredReturns.length : filteredVouchers.length} نتيجة
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              السابق
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                (tab === "sales" && (page + 1) * pageSize >= filteredSales.length) ||
                (tab === "returns" && (page + 1) * pageSize >= filteredReturns.length) ||
                ((tab === "receipts" || tab === "payments") &&
                  (page + 1) * pageSize >= filteredVouchers.length)
              }
              onClick={() => setPage((p) => p + 1)}
            >
              التالي
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function VoucherTable({ rows, kind }: { rows: Voucher[]; kind: "receipt" | "payment" }) {
  const list = rows.filter((v) => v.kind === kind);
  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="p-2 text-right">الرقم</th>
            <th className="p-2 text-right">التاريخ</th>
            <th className="p-2 text-right">الطرف/العميل</th>
            <th className="p-2 text-right">الحالة</th>
            <th className="p-2 text-right">المبلغ</th>
            <th className="p-2 text-right">العملة</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {list.map((row) => {
            const ext = row as Voucher & { is_backdated?: boolean; display_number?: string | null; document_date?: string };
            const docDate = ext.document_date ?? row.created_at?.slice(0, 10) ?? "—";
            return (
              <tr key={row.id} className={ext.is_backdated ? "bg-amber-50/80 dark:bg-amber-950/20" : ""}>
                <td className="p-2 font-mono">{ext.display_number ?? row.number}</td>
                <td className="p-2">{docDate}</td>
                <td className="p-2">{row.payee || "—"}</td>
                <td className="p-2">
                  <Badge variant="secondary">{row.status}</Badge>
                </td>
                <td className="p-2">{Number(row.amount).toLocaleString("ar-YE")}</td>
                <td className="p-2">{row.currency_code}</td>
              </tr>
            );
          })}
          {list.length === 0 && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-muted-foreground">
                لا توجد نتائج
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
