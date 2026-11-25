import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/cleanup")({
  component: CleanupPage,
});

const scopes = [
  {
    value: "stock",
    label: "أرصدة المخزون",
    description: "حذف الأرصدة وحركات المخزون وطلبات التوريد.",
  },
  { value: "movements", label: "سجل الحركات", description: "حذف سجل حركات المخزون فقط." },
  { value: "purchases", label: "فواتير المشتريات", description: "حذف فواتير المشتريات وتفاصيلها." },
  { value: "reorders", label: "طلبات التوريد", description: "حذف طلبات التوريد." },
  { value: "backups", label: "النسخ الاحتياطية", description: "حذف النسخ الاحتياطية المحفوظة." },
  {
    value: "products",
    label: "الأصناف",
    description: "حذف الأصناف والأرصدة والحركات وفواتير المشتريات.",
  },
  {
    value: "all",
    label: "كل البيانات",
    description: "حذف الأصناف والبيانات التشغيلية والإعدادات الأساسية.",
  },
  {
    value: "warehouse",
    label: "بيانات مستودع",
    description: "حذف أرصدة وحركات وفواتير المستودع المحدد مع الإبقاء عليه.",
  },
  {
    value: "warehouse_remove",
    label: "حذف مستودع",
    description: "حذف بيانات المستودع المحدد ثم حذف المستودع نهائيًا.",
  },
] as const;

function CleanupPage() {
  const [scope, setScope] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [busy, setBusy] = useState(false);
  const selectedScope = scopes.find((item) => item.value === scope);
  const needsWarehouse = scope === "warehouse" || scope === "warehouse_remove";

  useEffect(() => {
    let active = true;
    async function loadWarehouses() {
      const { data, error } = await supabase.from("warehouses").select("id, name").order("name");
      if (!active) return;
      if (error) {
        toast.error(`تعذر تحميل المستودعات: ${error.message}`);
      } else {
        setWarehouses(data ?? []);
      }
      setLoadingWarehouses(false);
    }

    void loadWarehouses();
    return () => {
      active = false;
    };
  }, []);

  async function cleanup() {
    if (!selectedScope) return;
    if (needsWarehouse && !warehouseId) {
      toast.error("اختر المستودع أولاً");
      return;
    }
    const target = needsWarehouse
      ? warehouses.find((warehouse) => warehouse.id === warehouseId)?.name
      : selectedScope.label;
    if (
      !window.confirm(
        `سيتم تنفيذ العملية التالية نهائيًا: ${selectedScope.label}${target ? ` — ${target}` : ""}.\nلا يمكن التراجع عن هذا الإجراء. هل تريد المتابعة؟`,
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.rpc("admin_purge", {
        _scope: scope,
        ...(needsWarehouse ? { _warehouse: warehouseId } : {}),
      });
      if (error) throw error;
      toast.success("تم تنظيف البيانات بنجاح");
      if (scope === "warehouse_remove") {
        setWarehouses((items) => items.filter((warehouse) => warehouse.id !== warehouseId));
        setWarehouseId("");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تنظيف البيانات");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="حذف وتنظيف البيانات">
      <section className="mx-auto max-w-2xl space-y-5 rounded-xl bg-card p-5 shadow-card">
        <p className="text-sm text-muted-foreground">
          هذه العمليات نهائية ومخصصة للمدير. اختر نوع البيانات المطلوب تنظيفها، وستظهر رسالة تأكيد
          قبل التنفيذ.
        </p>
        <div className="space-y-2">
          <label className="text-sm font-medium">نوع التنظيف</label>
          <Select
            value={scope}
            onValueChange={(value) => {
              setScope(value);
              setWarehouseId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="اختر نوع البيانات" />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedScope && (
            <p className="text-sm text-muted-foreground">{selectedScope.description}</p>
          )}
        </div>
        {needsWarehouse && (
          <div className="space-y-2">
            <label className="text-sm font-medium">المستودع</label>
            <Select
              value={warehouseId}
              onValueChange={setWarehouseId}
              disabled={loadingWarehouses || !warehouses.length}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={loadingWarehouses ? "جارٍ تحميل المستودعات…" : "اختر المستودع"}
                />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button
          variant="destructive"
          onClick={cleanup}
          disabled={busy || !selectedScope || (needsWarehouse && !warehouseId)}
        >
          {busy ? "جارٍ التنفيذ…" : "تنفيذ التنظيف"}
        </Button>
      </section>
    </AppShell>
  );
}
