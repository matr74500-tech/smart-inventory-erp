import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Printer,
  Search,
  Share2,
  Truck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/hooks/use-inventory";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { enqueueRpc, isTransientNetworkError } from "@/lib/offline/rpc-queue";
import { writeSheet } from "@/lib/inventory-utils";
import { buildWhatsAppUrl, shareTextOrFile } from "@/lib/share";
export const Route = createFileRoute("/account_statements")({
  head: () => ({
    meta: [
      { title: "حسابات العملاء والموردين وكشوفات الحساب | نظام المخزون الذكي" },
      {
        name: "description",
        content: "إدارة حسابات العملاء والموردين وكشوفات الحساب مع الطباعة والتصدير والمشاركة.",
      },
    ],
  }),
  component: AccountStatementsPage,
});
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type SupplierRow = Database["public"]["Tables"]["suppliers"]["Row"];
type SalesInvoiceRow = Database["public"]["Tables"]["sales_invoices"]["Row"];
type SalesReturnRow = Database["public"]["Tables"]["sales_returns"]["Row"];
type PurchaseInvoiceRow = Database["public"]["Tables"]["purchase_invoices"]["Row"];
type PurchaseItemRow = Database["public"]["Tables"]["purchase_items"]["Row"];
type SupplierReturnRow = Database["public"]["Tables"]["supplier_returns"]["Row"];
type SupplierReturnItemRow = Database["public"]["Tables"]["supplier_return_items"]["Row"];
type VoucherRow = Database["public"]["Tables"]["vouchers"]["Row"];

type KindFilter = "all" | "invoice" | "return" | "voucher";
type OrderDir = "asc" | "desc";

type CustomerAccount = {
  id: string;
  name: string;
  phone: string;
  secondaryPhone: string;
  address: string;
  type: "cash" | "credit" | "wholesale";
  creditLimit: number;
  balance: number;
  active: boolean;
};

type SupplierAccount = {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string | null;
  active: boolean;
};

type MovementRow = {
  id: string;
  at: string;
  type: "invoice" | "return" | "voucher";
  docNo: string;
  description: string;
  debit: number;
  credit: number;
  currency: string;
  status?: string;
};

function safeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function formatNum(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0";
}

function formatDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ar-YE", { dateStyle: "short", timeStyle: "short" });
}

function toDateOnly(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function AccountStatementsPage() {
  const { canAction } = useAuth();
  const { settings, currencies } = useInventory();

  const [tab, setTab] = useState<"customers" | "suppliers">("customers");
  const [loading, setLoading] = useState(true);

  const [customers, setCustomers] = useState<CustomerAccount[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierAccount[]>([]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "overlimit">(
    "all",
  );
  const [currencyFilter, setCurrencyFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<KindFilter>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [orderDir, setOrderDir] = useState<OrderDir>("asc");

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const [custInvoices, setCustInvoices] = useState<SalesInvoiceRow[]>([]);
  const [custReturns, setCustReturns] = useState<SalesReturnRow[]>([]);
  const [custVouchers, setCustVouchers] = useState<VoucherRow[]>([]);

  const [supInvoices, setSupInvoices] = useState<PurchaseInvoiceRow[]>([]);
  const [supReturns, setSupReturns] = useState<SupplierReturnRow[]>([]);
  const [supVouchers, setSupVouchers] = useState<VoucherRow[]>([]);

  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [editSupplierOpen, setEditSupplierOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerAccount | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<SupplierAccount | null>(null);

  const [voucherOpen, setVoucherOpen] = useState(false);
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [vKind, setVKind] = useState<"receipt" | "payment">("receipt");
  const [vAmount, setVAmount] = useState("");
  const [vCurr, setVCurr] = useState("YER");
  const [vMethod, setVMethod] = useState("نقدي");
  const [vNotes, setVNotes] = useState("");
  const [vPayee, setVPayee] = useState("");
  const [vAffectsDrawer, setVAffectsDrawer] = useState(true);

  const [previewOpen, setPreviewOpen] = useState(false);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([
        supabase.from("customers").select("*").eq("active", true).order("name"),
        supabase.from("suppliers").select("*").eq("active", true).order("name"),
      ]);
      if (cRes.error) throw cRes.error;
      if (sRes.error) throw sRes.error;

      const cm = (cRes.data ?? []).map((r: CustomerRow) => ({
        id: r.id,
        name: r.name,
        phone: r.phone ?? "",
        secondaryPhone: r.secondary_phone ?? "",
        address: r.address ?? "",
        type: (r.customer_type as CustomerAccount["type"]) ?? "credit",
        creditLimit: Number(r.credit_limit_yer ?? 0),
        balance: Number(r.balance_yer ?? 0),
        active: r.active,
      }));
      const sm = (sRes.data ?? []).map((r: SupplierRow) => ({
        id: r.id,
        name: r.name,
        phone: r.phone ?? "",
        address: r.address ?? "",
        notes: r.notes ?? null,
        active: r.active,
      }));
      setCustomers(cm);
      setSuppliers(sm);
      if (!selectedCustomerId && cm[0]) setSelectedCustomerId(cm[0].id);
      if (!selectedSupplierId && sm[0]) setSelectedSupplierId(sm[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل الحسابات");
    } finally {
      setLoading(false);
    }
  }, [selectedCustomerId, selectedSupplierId]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId) ?? null,
    [suppliers, selectedSupplierId],
  );

  const loadCustomerStatement = useCallback(async (customerId: string) => {
    try {
      const [invRes, retRes, vouRes] = await Promise.all([
        supabase
          .from("sales_invoices")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("sales_returns")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("vouchers")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
      ]);
      if (invRes.error) throw invRes.error;
      if (retRes.error) throw retRes.error;
      if (vouRes.error) throw vouRes.error;
      setCustInvoices((invRes.data ?? []) as SalesInvoiceRow[]);
      setCustReturns((retRes.data ?? []) as SalesReturnRow[]);
      setCustVouchers((vouRes.data ?? []) as VoucherRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل كشف حساب العميل");
    }
  }, []);

  const loadSupplierStatement = useCallback(async (supplier: SupplierAccount) => {
    try {
      const [invRes, retRes, vouRes] = await Promise.all([
        supabase
          .from("purchase_invoices")
          .select("*")
          .ilike("supplier", supplier.name)
          .order("created_at", { ascending: false }),
        supabase
          .from("supplier_returns")
          .select("*")
          .eq("supplier_id", supplier.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("vouchers")
          .select("*")
          .ilike("payee", supplier.name)
          .order("created_at", { ascending: false }),
      ]);
      if (invRes.error) throw invRes.error;
      if (retRes.error) throw retRes.error;
      if (vouRes.error) throw vouRes.error;
      const invoices = (invRes.data ?? []) as PurchaseInvoiceRow[];
      const returnsList = (retRes.data ?? []) as SupplierReturnRow[];
      if (invoices.length) {
        const ids = invoices.map((i) => i.id);
        const { data: items } = await supabase
          .from("purchase_items")
          .select("*")
          .in("invoice_id", ids);
        const byInv = new Map<string, number>();
        ((items ?? []) as PurchaseItemRow[]).forEach((it) => {
          const sum = byInv.get(it.invoice_id) ?? 0;
          byInv.set(it.invoice_id, sum + Number(it.cost ?? 0) * Number(it.quantity ?? 0));
        });
        (invoices as Array<PurchaseInvoiceRow & { total_cost_calc?: number }>).forEach((inv) => {
          inv.total_cost_calc = byInv.get(inv.id) ?? Number(inv.total ?? 0);
        });
      } else {
        (invoices as Array<PurchaseInvoiceRow & { total_cost_calc?: number }>).forEach((inv) => {
          inv.total_cost_calc = Number(inv.total ?? 0);
        });
      }
      setSupInvoices(invoices);
      if (returnsList.length) {
        const rIds = returnsList.map((r) => r.id);
        const { data: rItems } = await supabase
          .from("supplier_return_items")
          .select("*")
          .in("supplier_return_id", rIds);
        const byRet = new Map<string, number>();
        ((rItems ?? []) as SupplierReturnItemRow[]).forEach((it) => {
          const sum = byRet.get(it.supplier_return_id) ?? 0;
          byRet.set(
            it.supplier_return_id,
            sum + Number(it.unit_cost ?? 0) * Number(it.quantity ?? 0),
          );
        });
        (returnsList as Array<SupplierReturnRow & { total_cost_calc?: number }>).forEach((r) => {
          r.total_cost_calc = byRet.get(r.id) ?? Number(r.total_cost ?? 0);
        });
      }
      setSupReturns(returnsList);
      setSupVouchers((vouRes.data ?? []) as VoucherRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحميل كشف حساب المورد");
    }
  }, []);

  useEffect(() => {
    if (tab !== "customers" || !selectedCustomerId) return;
    void loadCustomerStatement(selectedCustomerId);
  }, [tab, selectedCustomerId, loadCustomerStatement]);

  useEffect(() => {
    if (tab !== "suppliers" || !selectedSupplier) return;
    void loadSupplierStatement(selectedSupplier);
  }, [tab, selectedSupplier, loadSupplierStatement]);

  const filteredCustomers = useMemo(() => {
    const term = q.trim().toLowerCase();
    return customers.filter((c) => {
      const matchQ =
        !term ||
        c.name.toLowerCase().includes(term) ||
        c.phone.toLowerCase().includes(term) ||
        c.secondaryPhone.toLowerCase().includes(term);
      if (!matchQ) return false;
      if (statusFilter === "active") return c.active;
      if (statusFilter === "inactive") return !c.active;
      if (statusFilter === "overlimit")
        return c.type === "credit" && c.balance > c.creditLimit && c.creditLimit > 0;
      return true;
    });
  }, [customers, q, statusFilter]);

  const filteredSuppliers = useMemo(() => {
    const term = q.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (!term) return true;
      return s.name.toLowerCase().includes(term) || s.phone.toLowerCase().includes(term);
    });
  }, [suppliers, q]);

  const customerSummary = useMemo(() => {
    const totalBalance = customers.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);
    const creditAccounts = customers.filter((c) => c.type === "credit");
    const overLimit = creditAccounts.filter(
      (c) => c.creditLimit > 0 && c.balance > c.creditLimit,
    ).length;
    const negative = customers.reduce((s, c) => s + (c.balance < 0 ? Math.abs(c.balance) : 0), 0);
    return {
      totalReceivable: totalBalance,
      totalCredit: negative,
      net: totalBalance - negative,
      count: customers.length,
      overLimit,
    };
  }, [customers]);

  const buildCustomerMovements = useMemo((): MovementRow[] => {
    const rows: MovementRow[] = [];
    for (const i of custInvoices) {
      rows.push({
        id: `si-${i.id}`,
        at: i.created_at,
        type: "invoice",
        docNo: i.number != null ? `SALE-${i.number}` : i.id.slice(0, 8),
        description: `فاتورة بيع ${i.status === "posted" ? "(مرحّلة)" : "(مسودة)"}`,
        debit: Number(i.total_yer ?? 0),
        credit: 0,
        currency: "YER",
        status: i.status,
      });
    }
    for (const r of custReturns) {
      rows.push({
        id: `sr-${r.id}`,
        at: r.posted_at ?? r.created_at,
        type: "return",
        docNo: r.number != null ? `SRET-${r.number}` : r.id.slice(0, 8),
        description: "مرتجع مبيعات",
        debit: 0,
        credit: Number(r.total_yer ?? 0),
        currency: r.currency_code ?? "YER",
        status: r.status,
      });
    }
    for (const v of custVouchers) {
      const amtYer = Number(v.amount ?? 0) * Number(v.exchange_rate_to_yer ?? 1);
      const isReceipt = v.kind === "receipt";
      rows.push({
        id: `v-${v.id}`,
        at: v.created_at,
        type: "voucher",
        docNo: v.number != null ? `VOU-${v.number}` : v.id.slice(0, 8),
        description:
          `${isReceipt ? "سند قبض" : "سند صرف"} - ${v.payment_method ?? ""} ${v.notes ?? ""}`.trim(),
        debit: isReceipt ? 0 : amtYer,
        credit: isReceipt ? amtYer : 0,
        currency: v.currency_code ?? "YER",
        status: v.status,
      });
    }
    let filtered = rows;
    if (typeFilter !== "all") filtered = filtered.filter((r) => r.type === typeFilter);
    if (currencyFilter !== "ALL") filtered = filtered.filter((r) => r.currency === currencyFilter);
    if (dateFrom) filtered = filtered.filter((r) => toDateOnly(r.at) >= dateFrom);
    if (dateTo) filtered = filtered.filter((r) => toDateOnly(r.at) <= dateTo);
    filtered.sort((a, b) => {
      const da = new Date(a.at).getTime();
      const db = new Date(b.at).getTime();
      return orderDir === "asc" ? da - db : db - da;
    });
    return filtered;
  }, [
    custInvoices,
    custReturns,
    custVouchers,
    typeFilter,
    currencyFilter,
    dateFrom,
    dateTo,
    orderDir,
  ]);

  const buildSupplierMovements = useMemo((): MovementRow[] => {
    const rows: MovementRow[] = [];
    for (const i of supInvoices as Array<PurchaseInvoiceRow & { total_cost_calc?: number }>) {
      rows.push({
        id: `pi-${i.id}`,
        at: i.created_at,
        type: "invoice",
        docNo: i.number != null ? `PUR-${i.number}` : i.id.slice(0, 8),
        description: "فاتورة مشتريات",
        debit: Number(i.total_cost_calc ?? i.total ?? 0),
        credit: 0,
        currency: "YER",
      });
    }
    for (const r of supReturns as Array<SupplierReturnRow & { total_cost_calc?: number }>) {
      rows.push({
        id: `srp-${r.id}`,
        at: r.created_at,
        type: "return",
        docNo: r.number != null ? `PRET-${r.number}` : r.id.slice(0, 8),
        description: "مرتجع مشتريات",
        debit: 0,
        credit: Number(r.total_cost_calc ?? r.total_cost ?? 0),
        currency: "YER",
        status: r.status,
      });
    }
    for (const v of supVouchers) {
      if (v.kind !== "payment") continue;
      const amtYer = Number(v.amount ?? 0) * Number(v.exchange_rate_to_yer ?? 1);
      rows.push({
        id: `sv-${v.id}`,
        at: v.created_at,
        type: "voucher",
        docNo: v.number != null ? `VOU-${v.number}` : v.id.slice(0, 8),
        description: `سند صرف - ${v.payment_method ?? ""} ${v.notes ?? ""}`.trim(),
        debit: 0,
        credit: amtYer,
        currency: v.currency_code ?? "YER",
        status: v.status,
      });
    }
    let filtered = rows;
    if (typeFilter !== "all") filtered = filtered.filter((r) => r.type === typeFilter);
    if (currencyFilter !== "ALL") filtered = filtered.filter((r) => r.currency === currencyFilter);
    if (dateFrom) filtered = filtered.filter((r) => toDateOnly(r.at) >= dateFrom);
    if (dateTo) filtered = filtered.filter((r) => toDateOnly(r.at) <= dateTo);
    filtered.sort((a, b) => {
      const da = new Date(a.at).getTime();
      const db = new Date(b.at).getTime();
      return orderDir === "asc" ? da - db : db - da;
    });
    return filtered;
  }, [
    supInvoices,
    supReturns,
    supVouchers,
    typeFilter,
    currencyFilter,
    dateFrom,
    dateTo,
    orderDir,
  ]);

  const customerRunning = useMemo(() => {
    let bal = 0;
    return buildCustomerMovements.map((m) => {
      bal += m.debit - m.credit;
      return { ...m, running: bal };
    });
  }, [buildCustomerMovements]);

  const supplierRunning = useMemo(() => {
    let bal = 0;
    return buildSupplierMovements.map((m) => {
      bal += m.debit - m.credit;
      return { ...m, running: bal };
    });
  }, [buildSupplierMovements]);

  const customerTotals = useMemo(() => {
    const debit = customerRunning.reduce((s, r) => s + r.debit, 0);
    const credit = customerRunning.reduce((s, r) => s + r.credit, 0);
    return { debit, credit, final: debit - credit };
  }, [customerRunning]);

  const supplierTotals = useMemo(() => {
    const debit = supplierRunning.reduce((s, r) => s + r.debit, 0);
    const credit = supplierRunning.reduce((s, r) => s + r.credit, 0);
    return { debit, credit, final: debit - credit };
  }, [supplierRunning]);

  const openCustomerVoucher = (c: CustomerAccount) => {
    setVKind("receipt");
    setVAmount("");
    setVCurr("YER");
    setVMethod("نقدي");
    setVNotes("");
    setVPayee("");
    setVAffectsDrawer(true);
    setSelectedCustomerId(c.id);
    setVoucherOpen(true);
  };

  const openSupplierVoucher = (s: SupplierAccount) => {
    setVKind("payment");
    setVAmount("");
    setVCurr("YER");
    setVMethod("نقدي");
    setVNotes("");
    setVPayee(s.name);
    setVAffectsDrawer(true);
    setSelectedSupplierId(s.id);
    setVoucherOpen(true);
  };

  const submitVoucher = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAction("cash.manage")) {
      toast.error("ليس لديك صلاحية إدارة السندات");
      return;
    }
    const amount = Number(vAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("أدخل مبلغًا صحيحًا");
      return;
    }
    const rate =
      vCurr === "YER"
        ? 1
        : Number(
            (currencies as Array<{ code: string; rate_to_yer?: number | null }>).find(
              (x) => x.code === vCurr,
            )?.rate_to_yer ?? NaN,
          );
    if (vCurr !== "YER" && (!Number.isFinite(rate) || rate <= 0)) {
      toast.error("سعر الصرف غير متوفر للعملة المختارة");
      return;
    }
    const opId = crypto.randomUUID();
    const customerId = tab === "customers" ? selectedCustomerId : null;
    const payee = tab === "suppliers" ? vPayee || selectedSupplier?.name || "" : "";
    const args = {
      _id: opId,
      _kind: vKind,
      _customer_id: customerId,
      _payee: payee,
      _category: "عام",
      _amount: amount,
      _currency_code: vCurr,
      _rate_to_yer: rate,
      _payment_method: vMethod,
      _affects_drawer: vAffectsDrawer,
      _notes: vNotes,
    };
    setVoucherBusy(true);
    try {
      if (!navigator.onLine) {
        await enqueueRpc({ id: opId, name: "save_voucher_draft_offline", args });
        const postOp = crypto.randomUUID();
        await enqueueRpc({
          id: postOp,
          name: "post_voucher_offline",
          args: { _operation_id: postOp, _id: opId },
        });
        toast.success("تم حفظ السند وترحيله محليًا وسيُزامن لاحقًا");
        setVoucherOpen(false);
        return;
      }
      const { data, error } = await supabase.rpc("save_voucher_draft_offline", args as never);
      if (error) throw error;
      const voucherId = data as string;
      const postOp = crypto.randomUUID();
      const { error: postErr } = await supabase.rpc("post_voucher_offline", {
        _operation_id: postOp,
        _id: voucherId,
      } as never);
      if (postErr) throw postErr;
      toast.success("تم حفظ وترحيل السند وتحديث الرصيد");
      setVoucherOpen(false);
      await loadBase();
      if (tab === "customers" && selectedCustomerId)
        await loadCustomerStatement(selectedCustomerId);
      if (tab === "suppliers" && selectedSupplier) await loadSupplierStatement(selectedSupplier);
    } catch (e) {
      if (isTransientNetworkError(e)) {
        try {
          await enqueueRpc({ id: opId, name: "save_voucher_draft_offline", args });
          const postOp = crypto.randomUUID();
          await enqueueRpc({
            id: postOp,
            name: "post_voucher_offline",
            args: { _operation_id: postOp, _id: opId },
          });
          toast.success("تعذر الاتصال الآن؛ حُفظ السند محليًا للمزامنة");
          setVoucherOpen(false);
          return;
        } catch (qErr) {
          toast.error(qErr instanceof Error ? qErr.message : "تعذر حفظ السند محليًا");
          return;
        }
      }
      toast.error(e instanceof Error ? e.message : "تعذر حفظ السند");
    } finally {
      setVoucherBusy(false);
    }
  };

  const saveEditedCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    if (!canAction("customers.manage")) {
      toast.error("ليس لديك صلاحية تعديل العملاء");
      return;
    }
    try {
      const { error } = await supabase.rpc("save_customer", {
        _id: editingCustomer.id,
        _name: editingCustomer.name,
        _phone: editingCustomer.phone,
        _secondary_phone: editingCustomer.secondaryPhone,
        _address: editingCustomer.address,
        _customer_type: editingCustomer.type,
        _credit_limit_yer: Number(editingCustomer.creditLimit || 0),
        _inactive_alert_enabled: true,
      });
      if (error) throw error;
      toast.success("تم تحديث بيانات العميل");
      setEditCustomerOpen(false);
      await loadBase();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث العميل");
    }
  };

  const saveEditedSupplier = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;
    if (!canAction("suppliers.manage")) {
      toast.error("ليس لديك صلاحية تعديل الموردين");
      return;
    }
    try {
      const { error } = await supabase.rpc("save_supplier", {
        _id: editingSupplier.id,
        _name: editingSupplier.name,
        _phone: editingSupplier.phone,
        _address: editingSupplier.address,
        _notes: editingSupplier.notes ?? "",
      });
      if (error) throw error;
      toast.success("تم تحديث بيانات المورد");
      setEditSupplierOpen(false);
      await loadBase();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث المورد");
    }
  };

  const exportExcel = async () => {
    const isCustomer = tab === "customers";
    const rows = isCustomer ? customerRunning : supplierRunning;
    const accountLabel = isCustomer
      ? (selectedCustomer?.name ?? "عميل")
      : (selectedSupplier?.name ?? "مورد");
    const data = rows.map((r) => ({
      التاريخ: formatDate(r.at),
      المرجع: r.docNo,
      البيان: r.description,
      مدين: r.debit,
      دائن: r.credit,
      "الرصيد التراكمي": r.running,
      العملة: r.currency,
      الحالة: r.status ?? "",
    }));
    await writeSheet(
      data,
      `كشف-حساب-${accountLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    toast.success("تم تصدير Excel");
  };

  const printStatement = () => {
    setPreviewOpen(true);
    setTimeout(() => window.print(), 80);
  };

  const buildShareText = () => {
    if (tab === "customers" && selectedCustomer) {
      const lines = [
        `كشف حساب: ${selectedCustomer.name}`,
        `الهاتف: ${selectedCustomer.phone || "-"}`,
        `الرصيد الحالي: ${formatNum(selectedCustomer.balance)} ر.ي`,
        "---",
        ...customerRunning
          .slice(0, 30)
          .map(
            (r) =>
              `${formatDate(r.at)} | ${r.docNo} | ${r.description} | مدين ${formatNum(r.debit)} | دائن ${formatNum(r.credit)} | رصيد ${formatNum(r.running)}`,
          ),
        "---",
        `إجمالي مدين: ${formatNum(customerTotals.debit)} | إجمالي دائن: ${formatNum(customerTotals.credit)} | الرصيد الختامي: ${formatNum(customerTotals.final)}`,
      ];
      return lines.join("\n");
    }
    if (tab === "suppliers" && selectedSupplier) {
      const lines = [
        `كشف حساب مورد: ${selectedSupplier.name}`,
        `الهاتف: ${selectedSupplier.phone || "-"}`,
        "---",
        ...supplierRunning
          .slice(0, 30)
          .map(
            (r) =>
              `${formatDate(r.at)} | ${r.docNo} | ${r.description} | مدين ${formatNum(r.debit)} | دائن ${formatNum(r.credit)} | رصيد ${formatNum(r.running)}`,
          ),
        "---",
        `إجمالي مدين: ${formatNum(supplierTotals.debit)} | إجمالي دائن: ${formatNum(supplierTotals.credit)} | الرصيد الختامي: ${formatNum(supplierTotals.final)}`,
      ];
      return lines.join("\n");
    }
    return "";
  };

  const shareWhatsApp = () => {
    const text = buildShareText();
    if (!text) return;
    const phoneRaw = tab === "customers" ? selectedCustomer?.phone : selectedSupplier?.phone;
    const url = buildWhatsAppUrl(text, safeStr(phoneRaw));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareNative = async () => {
    const text = buildShareText();
    if (!text) return;
    const title =
      tab === "customers"
        ? `كشف حساب - ${selectedCustomer?.name ?? ""}`
        : `كشف حساب مورد - ${selectedSupplier?.name ?? ""}`;
    const res = await shareTextOrFile({ title, text });
    if (res === "copied") toast.success("تم نسخ الكشف كنص");
    if (res === "shared") toast.success("تمت المشاركة");
  };

  return (
    <AppShell title="حسابات العملاء والموردين">
      <div className="space-y-4 print:hidden">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "customers" | "suppliers")}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="customers" className="gap-2">
              <Users className="size-4" /> حسابات العملاء
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-2">
              <Truck className="size-4" /> حسابات الموردين
            </TabsTrigger>
          </TabsList>

          <TabsContent value="customers" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">إجمالي المستحقات</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {formatNum(customerSummary.totalReceivable)} ر.ي
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">إجمالي الدائن</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {formatNum(customerSummary.totalCredit)} ر.ي
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">الصافي</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {formatNum(customerSummary.net)} ر.ي
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    متجاوزو حد الائتمان
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {customerSummary.overLimit}
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap gap-2 items-end">
              <div className="relative min-w-56 flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  className="pr-10"
                  placeholder="بحث بالاسم أو الهاتف..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الحالة</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">غير نشط</SelectItem>
                    <SelectItem value="overlimit">متجاوز الائتمان</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">قائمة العملاء</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[420px] overflow-auto">
                  {loading ? (
                    <div className="flex justify-center p-6">
                      <Loader2 className="size-6 animate-spin" />
                    </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCustomerId(c.id)}
                        className={`w-full text-right rounded-lg border p-3 transition ${selectedCustomerId === c.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{c.name}</span>
                          {c.type === "credit" && c.creditLimit > 0 && c.balance > c.creditLimit ? (
                            <Badge variant="destructive">تجاوز الحد</Badge>
                          ) : (
                            <Badge variant="secondary">{c.type}</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{c.phone || "-"}</div>
                        <div className="text-sm mt-1">الرصيد: {formatNum(c.balance)} ر.ي</div>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">بيانات الحساب</CardTitle>
                    {selectedCustomer && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedCustomer.address || "بدون عنوان"}
                      </p>
                    )}
                  </div>
                  {selectedCustomer && (
                    <div className="flex flex-wrap gap-2">
                      {canAction("customers.manage") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingCustomer(selectedCustomer);
                            setEditCustomerOpen(true);
                          }}
                        >
                          <Pencil className="size-4 ml-1" /> تعديل
                        </Button>
                      )}
                      {canAction("cash.manage") && (
                        <Button size="sm" onClick={() => openCustomerVoucher(selectedCustomer)}>
                          سند قبض/صرف
                        </Button>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {selectedCustomer ? (
                    <>
                      <div>
                        <span className="text-muted-foreground">الاسم: </span>
                        {selectedCustomer.name}
                      </div>
                      <div>
                        <span className="text-muted-foreground">الهاتف: </span>
                        {selectedCustomer.phone || "-"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">هاتف ثانوي: </span>
                        {selectedCustomer.secondaryPhone || "-"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">حد الائتمان: </span>
                        {formatNum(selectedCustomer.creditLimit)} ر.ي
                      </div>
                      <div>
                        <span className="text-muted-foreground">الرصيد الحالي: </span>
                        <strong>{formatNum(selectedCustomer.balance)} ر.ي</strong>
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">اختر عميلًا لعرض التفاصيل.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {selectedCustomer && (
              <Card>
                <CardHeader className="space-y-3">
                  <CardTitle className="text-base">كشف حساب العميل</CardTitle>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="space-y-1">
                      <Label className="text-xs">من تاريخ</Label>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">إلى تاريخ</Label>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">نوع الحركة</Label>
                      <Select
                        value={typeFilter}
                        onValueChange={(v) => setTypeFilter(v as KindFilter)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">الكل</SelectItem>
                          <SelectItem value="invoice">فواتير</SelectItem>
                          <SelectItem value="return">مرتجعات</SelectItem>
                          <SelectItem value="voucher">سندات</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">العملة</Label>
                      <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">الكل</SelectItem>
                          {currencies.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">الترتيب</Label>
                      <Select value={orderDir} onValueChange={(v) => setOrderDir(v as OrderDir)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">تصاعدي</SelectItem>
                          <SelectItem value="desc">تنازلي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="icon"
                        title="تصدير Excel"
                        onClick={() => void exportExcel()}
                      >
                        <FileSpreadsheet className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="طباعة/PDF"
                        onClick={printStatement}
                      >
                        <Printer className="size-4" />
                      </Button>
                      <Button variant="outline" size="icon" title="واتساب" onClick={shareWhatsApp}>
                        <Share2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>التاريخ</TableHead>
                          <TableHead>المرجع</TableHead>
                          <TableHead>البيان</TableHead>
                          <TableHead className="text-left">مدين</TableHead>
                          <TableHead className="text-left">دائن</TableHead>
                          <TableHead className="text-left">الرصيد التراكمي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={3}>
                            رصيد افتتاحي (قبل الفترة الحالية إن وُجدت مرشحات)
                          </TableCell>
                          <TableCell className="text-left">-</TableCell>
                          <TableCell className="text-left">-</TableCell>
                          <TableCell className="text-left font-medium">0</TableCell>
                        </TableRow>
                        {customerRunning.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap">{formatDate(r.at)}</TableCell>
                            <TableCell className="font-mono text-xs">{r.docNo}</TableCell>
                            <TableCell>{r.description}</TableCell>
                            <TableCell className="text-left">
                              {r.debit ? formatNum(r.debit) : "-"}
                            </TableCell>
                            <TableCell className="text-left">
                              {r.credit ? formatNum(r.credit) : "-"}
                            </TableCell>
                            <TableCell className="text-left font-medium">
                              {formatNum(r.running)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3 text-sm">
                    <div className="rounded-lg bg-muted p-3">
                      إجمالي المدين: <strong>{formatNum(customerTotals.debit)}</strong>
                    </div>
                    <div className="rounded-lg bg-muted p-3">
                      إجمالي الدائن: <strong>{formatNum(customerTotals.credit)}</strong>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-3">
                      الرصيد الختامي: <strong>{formatNum(customerTotals.final)}</strong>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">إجمالي الموردين</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{suppliers.length}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    إجمالي مدين (مشتريات)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {formatNum(supplierTotals.debit)} ر.ي
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    إجمالي دائن (مرتجعات/سندات)
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-bold">
                  {formatNum(supplierTotals.credit)} ر.ي
                </CardContent>
              </Card>
            </div>

            <div className="relative max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                className="pr-10"
                placeholder="بحث باسم المورد أو الهاتف..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">قائمة الموردين</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-[420px] overflow-auto">
                  {loading ? (
                    <div className="flex justify-center p-6">
                      <Loader2 className="size-6 animate-spin" />
                    </div>
                  ) : (
                    filteredSuppliers.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSupplierId(s.id)}
                        className={`w-full text-right rounded-lg border p-3 transition ${selectedSupplierId === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                      >
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">{s.phone || "-"}</div>
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">بيانات المورد</CardTitle>
                    {selectedSupplier && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedSupplier.address || "بدون عنوان"}
                      </p>
                    )}
                  </div>
                  {selectedSupplier && (
                    <div className="flex flex-wrap gap-2">
                      {canAction("suppliers.manage") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingSupplier(selectedSupplier);
                            setEditSupplierOpen(true);
                          }}
                        >
                          <Pencil className="size-4 ml-1" /> تعديل
                        </Button>
                      )}
                      {canAction("cash.manage") && (
                        <Button size="sm" onClick={() => openSupplierVoucher(selectedSupplier)}>
                          سند صرف
                        </Button>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {selectedSupplier ? (
                    <>
                      <div>
                        <span className="text-muted-foreground">الاسم: </span>
                        {selectedSupplier.name}
                      </div>
                      <div>
                        <span className="text-muted-foreground">الهاتف: </span>
                        {selectedSupplier.phone || "-"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">العنوان: </span>
                        {selectedSupplier.address || "-"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">ملاحظات: </span>
                        {selectedSupplier.notes || "-"}
                      </div>
                    </>
                  ) : (
                    <p className="text-muted-foreground">اختر موردًا لعرض التفاصيل.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {selectedSupplier && (
              <Card>
                <CardHeader className="space-y-3">
                  <CardTitle className="text-base">كشف حساب المورد</CardTitle>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="space-y-1">
                      <Label className="text-xs">من تاريخ</Label>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">إلى تاريخ</Label>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">نوع الحركة</Label>
                      <Select
                        value={typeFilter}
                        onValueChange={(v) => setTypeFilter(v as KindFilter)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">الكل</SelectItem>
                          <SelectItem value="invoice">فواتير</SelectItem>
                          <SelectItem value="return">مرتجعات</SelectItem>
                          <SelectItem value="voucher">سندات صرف</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">العملة</Label>
                      <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">الكل</SelectItem>
                          {currencies.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">الترتيب</Label>
                      <Select value={orderDir} onValueChange={(v) => setOrderDir(v as OrderDir)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">تصاعدي</SelectItem>
                          <SelectItem value="desc">تنازلي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="icon"
                        title="تصدير Excel"
                        onClick={() => void exportExcel()}
                      >
                        <FileSpreadsheet className="size-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="طباعة/PDF"
                        onClick={printStatement}
                      >
                        <Printer className="size-4" />
                      </Button>
                      <Button variant="outline" size="icon" title="واتساب" onClick={shareWhatsApp}>
                        <Share2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>التاريخ</TableHead>
                          <TableHead>المرجع</TableHead>
                          <TableHead>البيان</TableHead>
                          <TableHead className="text-left">مدين</TableHead>
                          <TableHead className="text-left">دائن</TableHead>
                          <TableHead className="text-left">الرصيد التراكمي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={3}>
                            رصيد افتتاحي (قبل الفترة الحالية إن وُجدت مرشحات)
                          </TableCell>
                          <TableCell className="text-left">-</TableCell>
                          <TableCell className="text-left">-</TableCell>
                          <TableCell className="text-left font-medium">0</TableCell>
                        </TableRow>
                        {supplierRunning.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap">{formatDate(r.at)}</TableCell>
                            <TableCell className="font-mono text-xs">{r.docNo}</TableCell>
                            <TableCell>{r.description}</TableCell>
                            <TableCell className="text-left">
                              {r.debit ? formatNum(r.debit) : "-"}
                            </TableCell>
                            <TableCell className="text-left">
                              {r.credit ? formatNum(r.credit) : "-"}
                            </TableCell>
                            <TableCell className="text-left font-medium">
                              {formatNum(r.running)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3 text-sm">
                    <div className="rounded-lg bg-muted p-3">
                      إجمالي المدين: <strong>{formatNum(supplierTotals.debit)}</strong>
                    </div>
                    <div className="rounded-lg bg-muted p-3">
                      إجمالي الدائن: <strong>{formatNum(supplierTotals.credit)}</strong>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-3">
                      الرصيد الختامي: <strong>{formatNum(supplierTotals.final)}</strong>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Quick Voucher Dialog */}
      <Dialog open={voucherOpen} onOpenChange={setVoucherOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>سند {vKind === "receipt" ? "قبض" : "صرف"} سريع</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitVoucher} className="space-y-3">
            <div className="space-y-1">
              <Label>النوع</Label>
              <Select value={vKind} onValueChange={(v) => setVKind(v as "receipt" | "payment")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receipt">قبض</SelectItem>
                  <SelectItem value="payment">صرف</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tab === "suppliers" && (
              <div className="space-y-1">
                <Label>اسم المستفيد/المورد</Label>
                <Input value={vPayee} onChange={(e) => setVPayee(e.target.value)} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>المبلغ</Label>
                <Input
                  type="number"
                  step="any"
                  value={vAmount}
                  onChange={(e) => setVAmount(e.target.value)}
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
                    {currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>طريقة الدفع</Label>
              <Input value={vMethod} onChange={(e) => setVMethod(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>ملاحظات</Label>
              <Input value={vNotes} onChange={(e) => setVNotes(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={vAffectsDrawer}
                onChange={(e) => setVAffectsDrawer(e.target.checked)}
              />
              يؤثر على الصندوق
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVoucherOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={voucherBusy}>
                {voucherBusy && <Loader2 className="size-4 animate-spin ml-2" />}
                حفظ وترحيل
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Customer */}
      <Dialog open={editCustomerOpen} onOpenChange={setEditCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل بيانات العميل</DialogTitle>
          </DialogHeader>
          {editingCustomer && (
            <form onSubmit={saveEditedCustomer} className="space-y-3">
              <div className="space-y-1">
                <Label>الاسم</Label>
                <Input
                  value={editingCustomer.name}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>الهاتف</Label>
                <Input
                  value={editingCustomer.phone}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, phone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>هاتف ثانوي</Label>
                <Input
                  value={editingCustomer.secondaryPhone}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, secondaryPhone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>العنوان</Label>
                <Input
                  value={editingCustomer.address}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, address: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>النوع</Label>
                <Select
                  value={editingCustomer.type}
                  onValueChange={(v) =>
                    setEditingCustomer({ ...editingCustomer, type: v as CustomerAccount["type"] })
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
              <div className="space-y-1">
                <Label>حد الائتمان</Label>
                <Input
                  type="number"
                  value={editingCustomer.creditLimit}
                  onChange={(e) =>
                    setEditingCustomer({ ...editingCustomer, creditLimit: Number(e.target.value) })
                  }
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditCustomerOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit">حفظ</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Supplier */}
      <Dialog open={editSupplierOpen} onOpenChange={setEditSupplierOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل بيانات المورد</DialogTitle>
          </DialogHeader>
          {editingSupplier && (
            <form onSubmit={saveEditedSupplier} className="space-y-3">
              <div className="space-y-1">
                <Label>الاسم</Label>
                <Input
                  value={editingSupplier.name}
                  onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>الهاتف</Label>
                <Input
                  value={editingSupplier.phone}
                  onChange={(e) =>
                    setEditingSupplier({ ...editingSupplier, phone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>العنوان</Label>
                <Input
                  value={editingSupplier.address}
                  onChange={(e) =>
                    setEditingSupplier({ ...editingSupplier, address: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>ملاحظات</Label>
                <Input
                  value={editingSupplier.notes ?? ""}
                  onChange={(e) =>
                    setEditingSupplier({ ...editingSupplier, notes: e.target.value })
                  }
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditSupplierOpen(false)}>
                  إلغاء
                </Button>
                <Button type="submit">حفظ</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Print preview modal (simple) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>معاينة الطباعة</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            استخدم زر الطباعة في المتصفح للطباعة أو حفظ PDF.
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <div className="font-bold text-lg">{settings?.shop_name ?? "متجري"}</div>
            <Separator className="my-2" />
            <div className="text-sm">
              {tab === "customers"
                ? `كشف حساب عميل: ${selectedCustomer?.name ?? "-"}`
                : `كشف حساب مورد: ${selectedSupplier?.name ?? "-"}`}
            </div>
            <div className="text-xs text-muted-foreground">
              تاريخ الطباعة: {new Date().toLocaleString("ar-YE")}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              إغلاق
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="size-4 ml-2" /> طباعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
