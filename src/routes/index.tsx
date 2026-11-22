import { useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Boxes,
  ClipboardCheck,
  ArrowLeftRight,
  Truck,
  Search,
  AlertTriangle,
  Warehouse,
  Package,
  ShoppingCart,
  FileText,
  Receipt,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useInventory } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { pageForPath } from "@/lib/permissions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم | نظام المخزون الذكي" },
      {
        name: "description",
        content: "نظرة سريعة على المخزون والجرد والتوريد في نظام المخزون الذكي.",
      },
      { property: "og:title", content: "لوحة التحكم | نظام المخزون الذكي" },
      { property: "og:description", content: "نظام نقاط البيع وإدارة المخزون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const TILES = [
  {
    to: "/inventory",
    label: "المخزون",
    desc: "الأصناف والكميات",
    icon: Boxes,
    tone: "bg-primary text-primary-foreground",
  },
  {
    to: "/inventory",
    label: "البحث",
    desc: "نص أو باركود",
    icon: Search,
    tone: "bg-secondary text-secondary-foreground",
  },
  {
    to: "/stocktake",
    label: "الجرد",
    desc: "إدخال أولي وتحديث",
    icon: ClipboardCheck,
    tone: "bg-accent text-accent-foreground",
    roles: ["storekeeper"] as const,
  },
  {
    to: "/reorders",
    label: "التوريد",
    desc: "طلبات إعادة التوريد",
    icon: Truck,
    tone: "bg-success text-success-foreground",
    roles: ["storekeeper"] as const,
  },
  {
    to: "/transfers",
    label: "التحويلات",
    desc: "بين المستودعات",
    icon: ArrowLeftRight,
    tone: "bg-sidebar text-sidebar-foreground",
    roles: ["storekeeper"] as const,
  },
];

// Quick operation shortcuts: number keys trigger them from the home page.
const SHORTCUTS = [
  {
    key: "1",
    label: "سند قبض",
    desc: "تحصيل من عميل",
    to: "/customers",
    search: { voucher: "receipt" },
    page: "customers",
    icon: Receipt,
    tone: "text-success",
  },
  {
    key: "2",
    label: "فاتورة جديدة",
    desc: "فاتورة بيع",
    to: "/sales",
    search: { view: "invoice" },
    page: "sales",
    icon: FileText,
    tone: "text-primary",
  },
  {
    key: "3",
    label: "سند صرف",
    desc: "صرف إلى جهة",
    to: "/customers",
    search: { voucher: "payment" },
    page: "customers",
    icon: Receipt,
    tone: "text-destructive",
  },
  {
    key: "4",
    label: "أمر شراء",
    desc: "إنشاء أمر شراء",
    to: "/purchase_orders",
    search: {},
    page: "purchase_orders",
    icon: ShoppingCart,
    tone: "text-primary",
  },
  {
    key: "5",
    label: "البيع السريع",
    desc: "نقطة البيع",
    to: "/sales",
    search: { view: "pos" },
    page: "sales",
    icon: ShoppingCart,
    tone: "text-success",
  },
] as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function Dashboard() {
  const { products, warehouses, reorders, qty } = useInventory();
  const { canPage, canField } = useAuth();
  const navigate = useNavigate();
  const low = products.filter(
    (p) => Number(p.reorder_level) > 0 && qty(p.id) <= Number(p.reorder_level),
  );
  const pending = reorders.filter((r) => r.status === "pending").length;

  const stats = [
    { label: "الأصناف", value: products.length, icon: Package },
    { label: "المستودعات", value: warehouses.length, icon: Warehouse },
    { label: "تحت حد الطلب", value: low.length, icon: AlertTriangle },
    { label: "طلبات توريد معلقة", value: pending, icon: Truck },
  ];

  const visibleShortcuts = useMemo(() => SHORTCUTS.filter((s) => canPage(s.page)), [canPage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const shortcut = visibleShortcuts.find((s) => s.key === event.key);
      if (!shortcut) return;
      event.preventDefault();
      void navigate({ to: shortcut.to as never, search: shortcut.search as never });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, visibleShortcuts]);

  return (
    <AppShell title="لوحة التحكم">
      {visibleShortcuts.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">اختصارات العمليات</h2>
            <span className="text-xs text-muted-foreground">
              اضغط الرقم المقابل أثناء تواجدك في الصفحة الرئيسية
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {visibleShortcuts.map((s) => (
              <Link
                key={s.label}
                to={s.to as never}
                search={s.search as never}
                className="group relative rounded-xl bg-card p-4 shadow-card hover:bg-accent"
              >
                <span className="absolute top-2 left-2 grid size-6 place-items-center rounded-md bg-muted text-xs font-bold text-muted-foreground group-hover:bg-background">
                  {s.key}
                </span>
                <s.icon className={`size-5 ${s.tone}`} />
                <div className="mt-2 font-semibold">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.desc}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {stats
          .filter((s) => canField("quantity") || ["الأصناف", "المستودعات"].includes(s.label))
          .map((s) => (
            <div key={s.label} className="rounded-xl bg-card shadow-card p-4">
              <s.icon className="size-5 text-muted-foreground" />
              <div className="text-3xl font-bold mt-2 font-display">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {TILES.filter((t) => canPage(pageForPath(t.to))).map((t) => (
          <Link
            key={t.label}
            to={t.to as never}
            className={`rounded-2xl p-5 shadow-card transition-transform hover:-translate-y-1 ${t.tone}`}
          >
            <t.icon className="size-9" />
            <div className="mt-4 text-lg font-bold">{t.label}</div>
            <div className="text-sm opacity-80">{t.desc}</div>
          </Link>
        ))}
      </div>
      {canField("quantity") && canField("reorder_level") && low.length > 0 && (
        <div className="mt-8 rounded-xl bg-card shadow-card p-5">
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <AlertTriangle className="size-5 text-warning" /> أصناف وصلت لحد الطلب
          </h2>
          <ul className="divide-y">
            {low.slice(0, 8).map((p) => (
              <li key={p.id} className="py-2 flex justify-between text-sm">
                <span>{p.name}</span>
                <span className="text-destructive font-semibold">
                  {qty(p.id)} / {Number(p.reorder_level)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AppShell>
  );
}
