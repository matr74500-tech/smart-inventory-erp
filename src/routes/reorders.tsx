import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PackageCheck, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useInventory } from "@/hooks/use-inventory";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reorders")({
  head: () => ({
    meta: [
      { title: "طلبات التوريد | سهيل سوفت" },
      { name: "description", content: "طلبات إعادة التوريد التلقائية عند وصول الصنف لحد الطلب." },
      { property: "og:title", content: "طلبات التوريد | سهيل سوفت" },
      { property: "og:description", content: "إدارة إعادة التوريد واستلام البضاعة." },
    ],
  }),
  component: ReordersPage,
});

function ReordersPage() {
  const { reorders, products, warehouses } = useInventory();
  const [busy, setBusy] = useState<string | null>(null);
  const pName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const wName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "—";

  async function receive(id: string) {
    setBusy(id);
    const { error } = await supabase.rpc("receive_reorder", { _id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("تم استلام التوريد وإضافته للمخزون");
  }

  return (
    <AppShell title="طلبات التوريد" roles={["storekeeper"]}>
      <p className="text-sm text-muted-foreground mb-4">تُنشأ الطلبات تلقائياً عندما تنخفض كمية صنف إلى حد الطلب في أي مستودع.</p>
      <div className="rounded-xl bg-card shadow-card divide-y">
        {reorders.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-4">
            <Truck className={`size-5 ${r.status === "pending" ? "text-warning" : "text-success"}`} />
            <div className="flex-1">
              <div className="font-medium">{pName(r.product_id)}</div>
              <div className="text-xs text-muted-foreground">{wName(r.warehouse_id)} · الكمية المطلوبة: {Number(r.quantity)}</div>
            </div>
            {r.status === "pending" ? (
              <Button size="sm" onClick={() => receive(r.id)} disabled={busy === r.id}>
                {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />} استلام
              </Button>
            ) : (
              <span className="text-xs rounded-full bg-success/15 text-success px-3 py-1">مُستلم</span>
            )}
          </div>
        ))}
        {reorders.length === 0 && <p className="p-8 text-center text-muted-foreground">لا توجد طلبات توريد</p>}
      </div>
    </AppShell>
  );
}
