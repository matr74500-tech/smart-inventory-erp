import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Moon, PackageX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useInventory } from "@/hooks/use-inventory";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "تنبيهات المخزون | سهيل سوفت" },
      { name: "description", content: "الأصناف النافدة والتي اقتربت على النفاد والأصناف الراكدة." },
      { property: "og:title", content: "تنبيهات المخزون | سهيل سوفت" },
      { property: "og:description", content: "لوحة تنبيهات النفاد والركود." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const { products, qty, stock } = useInventory();
  const [days, setDays] = useState("60");
  const [moved, setMoved] = useState<Set<string> | null>(null);

  useEffect(() => {
    const since = new Date(Date.now() - Number(days) * 864e5).toISOString();
    supabase.from("stock_movements").select("product_id").gte("created_at", since).neq("kind", "count").limit(10000)
      .then(({ data }) => setMoved(new Set((data ?? []).map((r) => r.product_id))));
  }, [days, stock]);

  const out = useMemo(() => products.filter((p) => qty(p.id) <= 0), [products, qty]);
  const low = useMemo(() => products.filter((p) => { const t = qty(p.id); return t > 0 && Number(p.reorder_level) > 0 && t <= Number(p.reorder_level); }), [products, qty]);
  const stale = useMemo(() => (moved ? products.filter((p) => qty(p.id) > 0 && !moved.has(p.id) && Date.now() - new Date(p.created_at).getTime() > Number(days) * 864e5) : []), [products, qty, moved, days]);

  const Section = ({ title, icon: Icon, tone, items, sub }: { title: string; icon: typeof Moon; tone: string; items: typeof products; sub: (p: (typeof products)[number]) => string }) => (
    <div className="rounded-xl bg-card shadow-card">
      <div className={`flex items-center gap-2 p-4 border-b font-bold ${tone}`}><Icon className="size-5" /> {title} <span className="mr-auto rounded-full bg-muted px-2 text-sm">{items.length}</span></div>
      <div className="divide-y max-h-[60vh] overflow-y-auto">
        {items.map((p) => <div key={p.id} className="flex justify-between gap-2 p-3 text-sm"><span>{p.name}</span><span className="text-muted-foreground">{sub(p)}</span></div>)}
        {!items.length && <div className="p-6 text-center text-sm text-muted-foreground">لا شيء</div>}
      </div>
    </div>
  );

  return (
    <AppShell title="تنبيهات المخزون">
      <div className="flex items-center gap-2 mb-4 text-sm">
        الراكد: بلا حركة بيع أو شراء أو تحويل منذ
        <Select value={days} onValueChange={setDays}><SelectTrigger className="w-28 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>{["30", "60", "90", "180"].map((d) => <SelectItem key={d} value={d}>{d} يوم</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Section title="نفد من المخزون" icon={PackageX} tone="text-destructive" items={out} sub={() => "0"} />
        <Section title="اقترب على النفاد" icon={AlertTriangle} tone="text-warning" items={low} sub={(p) => `${qty(p.id)} / حد ${Number(p.reorder_level)}`} />
        <Section title="أصناف راكدة" icon={Moon} tone="text-muted-foreground" items={stale} sub={(p) => `${qty(p.id)} ${p.unit}`} />
      </div>
    </AppShell>
  );
}
