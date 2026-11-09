import { createFileRoute, Link } from "@tanstack/react-router";
import { Boxes, ClipboardCheck, ArrowLeftRight, Truck, Search, AlertTriangle, Warehouse, Package } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useInventory } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { pageForPath } from "@/lib/permissions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم | سهيل سوفت" },
      { name: "description", content: "نظرة سريعة على المخزون والجرد والتوريد في سهيل سوفت." },
      { property: "og:title", content: "لوحة التحكم | سهيل سوفت" },
      { property: "og:description", content: "نظام نقاط البيع وإدارة المخزون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const TILES = [
  { to: "/inventory", label: "المخزون", desc: "الأصناف والكميات", icon: Boxes, tone: "bg-primary text-primary-foreground" },
  { to: "/inventory", label: "البحث", desc: "نص أو باركود", icon: Search, tone: "bg-secondary text-secondary-foreground" },
  { to: "/stocktake", label: "الجرد", desc: "إدخال أولي وتحديث", icon: ClipboardCheck, tone: "bg-accent text-accent-foreground", roles: ["storekeeper"] as const },
  { to: "/reorders", label: "التوريد", desc: "طلبات إعادة التوريد", icon: Truck, tone: "bg-success text-success-foreground", roles: ["storekeeper"] as const },
  { to: "/transfers", label: "التحويلات", desc: "بين المستودعات", icon: ArrowLeftRight, tone: "bg-sidebar text-sidebar-foreground", roles: ["storekeeper"] as const },
];

function Dashboard() {
  const { products, warehouses, reorders, qty } = useInventory();
  const { canPage, canField } = useAuth();
  const low = products.filter((p) => Number(p.reorder_level) > 0 && qty(p.id) <= Number(p.reorder_level));
  const pending = reorders.filter((r) => r.status === "pending").length;

  const stats = [
    { label: "الأصناف", value: products.length, icon: Package },
    { label: "المستودعات", value: warehouses.length, icon: Warehouse },
    { label: "تحت حد الطلب", value: low.length, icon: AlertTriangle },
    { label: "طلبات توريد معلقة", value: pending, icon: Truck },
  ];

  return (
    <AppShell title="لوحة التحكم">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {stats.filter(s => canField("quantity") || ["الأصناف", "المستودعات"].includes(s.label)).map((s) => (
          <div key={s.label} className="rounded-xl bg-card shadow-card p-4">
            <s.icon className="size-5 text-muted-foreground" />
            <div className="text-3xl font-bold mt-2 font-display">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {TILES.filter((t) => canPage(pageForPath(t.to))).map((t) => (
          <Link key={t.label} to={t.to} className={`rounded-2xl p-5 shadow-card transition-transform hover:-translate-y-1 ${t.tone}`}>
            <t.icon className="size-9" />
            <div className="mt-4 text-lg font-bold">{t.label}</div>
            <div className="text-sm opacity-80">{t.desc}</div>
          </Link>
        ))}
      </div>
      {canField("quantity") && canField("reorder_level") && low.length > 0 && (
        <div className="mt-8 rounded-xl bg-card shadow-card p-5">
          <h2 className="font-bold mb-3 flex items-center gap-2"><AlertTriangle className="size-5 text-warning" /> أصناف وصلت لحد الطلب</h2>
          <ul className="divide-y">
            {low.slice(0, 8).map((p) => (
              <li key={p.id} className="py-2 flex justify-between text-sm">
                <span>{p.name}</span>
                <span className="text-destructive font-semibold">{qty(p.id)} / {Number(p.reorder_level)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
