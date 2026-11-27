import { createFileRoute } from "@tanstack/react-router";
import { Save, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/hooks/use-inventory";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/settings_sales")({
  head: () => ({
    meta: [
      { title: "إعدادات البيع الافتراضية | نظام المخزون الذكي" },
      { name: "description", content: "إعدادات العميل والمستودع الافتراضيين وسلوك البيع" },
    ],
  }),
  component: SettingsSalesPage,
});

type SalesSettingsRow = {
  id: string;
  default_customer_id: string | null;
  default_warehouse_id: string | null;
  is_customer_required: boolean;
  is_warehouse_required: boolean;
  apply_to_quick_sales: boolean;
  apply_to_new_invoice: boolean;
};
type Customer = Tables<"customers">;

function SettingsSalesPage() {
  const { canAction } = useAuth();
  const { warehouses } = useInventory();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [row, setRow] = useState<SalesSettingsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [defaultCustomerId, setDefaultCustomerId] = useState<string>("");
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<string>("");
  const [isCustomerRequired, setIsCustomerRequired] = useState(false);
  const [isWarehouseRequired, setIsWarehouseRequired] = useState(false);
  const [applyToQuickSales, setApplyToQuickSales] = useState(true);
  const [applyToNewInvoice, setApplyToNewInvoice] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsRes, customersRes] = await Promise.all([
      (
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
        .maybeSingle(),
      supabase.from("customers").select("*").eq("active", true).order("name"),
    ]);
    const { data, error } = settingsRes as {
      data: SalesSettingsRow | null;
      error: { message: string } | null;
    };
    if (error) {
      toast.error(`تعذر تحميل إعدادات البيع: ${error.message}`);
      setRow(null);
    } else if (data) {
      setRow(data);
      setDefaultCustomerId(data.default_customer_id ?? "");
      setDefaultWarehouseId(data.default_warehouse_id ?? "");
      setIsCustomerRequired(data.is_customer_required);
      setIsWarehouseRequired(data.is_warehouse_required);
      setApplyToQuickSales(data.apply_to_quick_sales);
      setApplyToNewInvoice(data.apply_to_new_invoice);
    } else {
      setRow(null);
      setDefaultCustomerId("");
      setDefaultWarehouseId("");
      setIsCustomerRequired(false);
      setIsWarehouseRequired(false);
      setApplyToQuickSales(true);
      setApplyToNewInvoice(true);
    }
    if (customersRes.error) toast.error(`تعذر تحميل العملاء: ${customersRes.error.message}`);
    else setCustomers((customersRes.data as Customer[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel("sales-settings-ui")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_settings" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canAction("settings.manage")) {
      toast.error("ليس لديك صلاحية إدارة الإعدادات");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        default_customer_id: defaultCustomerId || null,
        default_warehouse_id: defaultWarehouseId || null,
        is_customer_required: isCustomerRequired,
        is_warehouse_required: isWarehouseRequired,
        apply_to_quick_sales: applyToQuickSales,
        apply_to_new_invoice: applyToNewInvoice,
        updated_at: new Date().toISOString(),
      };
      const q = supabase.from("sales_settings" as never) as never as {
        update: (p: Record<string, unknown>) => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
        insert: (p: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      };
      if (row?.id) {
        const { error } = await q.update(payload).eq("id", row.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await q.insert(payload);
        if (error) throw new Error(error.message);
      }
      toast.success("تم حفظ إعدادات البيع الافتراضية");
      void load();
    } catch (err) {
      toast.error(`تعذر حفظ الإعدادات: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="إعدادات البيع الافتراضية" roles={["storekeeper"]}>
      <div className="space-y-5">
        <div className="rounded-xl bg-card p-5 shadow-card">
          <h2 className="font-bold text-lg mb-1">إعدادات البيع الافتراضية</h2>
          <p className="text-sm text-muted-foreground mb-4">
            تحكم في العميل والمستودع الافتراضيين وما إذا كان الاختيار اليدوي إلزاميًا.
          </p>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="size-4 animate-spin" /> جارٍ التحميل...
            </div>
          ) : (
            <form onSubmit={save} className="space-y-6 max-w-2xl">
              <div className="space-y-2">
                <Label>العميل الافتراضي</Label>
                <Select
                  value={defaultCustomerId || "none"}
                  onValueChange={(v) => setDefaultCustomerId(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="بدون عميل افتراضي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون عميل افتراضي</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المستودع الافتراضي</Label>
                <Select
                  value={defaultWarehouseId || "none"}
                  onValueChange={(v) => setDefaultWarehouseId(v === "none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="بدون مستودع افتراضي" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مستودع افتراضي</SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <div className="font-medium">إلزام اختيار العميل يدوياً</div>
                  <div className="text-xs text-muted-foreground">
                    إذا كان مفعّلاً لا يُستخدم العميل الافتراضي تلقائياً كبديل إجباري.
                  </div>
                </div>
                <Switch
                  checked={isCustomerRequired}
                  onCheckedChange={setIsCustomerRequired}
                  disabled={busy || !canAction("settings.manage")}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <div className="font-medium">إلزام اختيار المستودع يدوياً</div>
                  <div className="text-xs text-muted-foreground">
                    إذا كان مفعّلاً يجب اختيار مستودع من المستخدم.
                  </div>
                </div>
                <Switch
                  checked={isWarehouseRequired}
                  onCheckedChange={setIsWarehouseRequired}
                  disabled={busy || !canAction("settings.manage")}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <div className="font-medium">تطبيق على البيع السريع</div>
                </div>
                <Switch
                  checked={applyToQuickSales}
                  onCheckedChange={setApplyToQuickSales}
                  disabled={busy || !canAction("settings.manage")}
                />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                  <div className="font-medium">تطبيق على إنشاء فاتورة جديدة</div>
                </div>
                <Switch
                  checked={applyToNewInvoice}
                  onCheckedChange={setApplyToNewInvoice}
                  disabled={busy || !canAction("settings.manage")}
                />
              </div>
              <Button type="submit" disabled={busy || !canAction("settings.manage")}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                حفظ الإعدادات
              </Button>
            </form>
          )}
        </div>
      </div>
    </AppShell>
  );
}
