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
  TrendingUp,
  DollarSign,
  Users,
  CreditCard,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useInventory } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { pageForPath } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  {
    key: "6",
    label: "الأصناف",
    desc: "إدارة المخزون",
    to: "/inventory",
    search: {},
    page: "inventory",
    icon: Boxes,
    tone: "text-primary",
  },
  {
    key: "7",
    label: "التوريد",
    desc: "طلبات إعادة التوريد",
    to: "/reorders",
    search: {},
    page: "reorders",
    icon: Truck,
    tone: "text-success",
  },
  {
    key: "8",
    label: "مصروف جديد",
    desc: "تسجيل مصروف جديد",
    to: "/expenses",
    search: {},
    page: "expenses",
    icon: CreditCard,
    tone: "text-destructive",
  },
] as const;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

const STAT_TONES: Record<string, string> = {
  الأصناف: "bg-blue-50 text-blue-600 border-blue-100",
  المستودعات: "bg-indigo-50 text-indigo-600 border-indigo-100",
  "تحت حد الطلب": "bg-amber-50 text-amber-600 border-amber-100",
  "طلبات توريد معلقة": "bg-emerald-50 text-emerald-600 border-emerald-100",
};

function Dashboard() {
  const { products, warehouses, reorders, qty } = useInventory();
  const { canPage, canField } = useAuth();
  const navigate = useNavigate();
  const low = products.filter(
    (p) => Number(p.reorder_level) > 0 && qty(p.id) <= Number(p.reorder_level),
  );
  const pending = reorders.filter((r) => r.status === "pending").length;

  const totalStock = products.reduce((sum, p) => sum + qty(p.id), 0);

  const stats = [
    {
      label: "الأصناف",
      value: products.length,
      icon: Package,
      tone: STAT_TONES["الأصناف"],
      sub: "في سجل الأصناف",
    },
    {
      label: "المستودعات",
      value: warehouses.length,
      icon: Warehouse,
      tone: STAT_TONES["المستودعات"],
      sub: "مستودع نشط",
    },
    {
      label: "الرصيد الكلي",
      value: totalStock,
      icon: Boxes,
      tone: STAT_TONES["المستودعات"],
      sub: "وحدة مخزنية",
    },
    {
      label: "تحت حد الطلب",
      value: low.length,
      icon: AlertTriangle,
      tone: STAT_TONES["تحت حد الطلب"],
      sub: "بحاجة لإعادة التوريد",
    },
    {
      label: "طلبات توريد معلقة",
      value: pending,
      icon: Truck,
      tone: STAT_TONES["طلبات توريد معلقة"],
      sub: "معلقة للموافقة",
    },
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
      <div className="space-y-6">
        {/* Welcome header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">لوحة التحكم</h1>
            <p className="text-muted-foreground mt-1">
              نظرة سريعة على حالة المخزون والعمليات الجارية اليوم.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1.5">
              النظام يعمل بشكل طبيعي
            </Badge>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats
            .filter((s) => canField("quantity") || ["الأصناف", "المستودعات"].includes(s.label))
            .map((s) => (
              <Card key={s.label} className="rounded-2xl shadow-sm border">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {s.label}
                  </CardTitle>
                  <div className={cn("rounded-xl p-2", s.tone)}>
                    <s.icon className="size-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display">{s.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                </CardContent>
              </Card>
            ))}
        </div>

        <Separator />

        {/* Shortcuts */}
        {visibleShortcuts.length > 0 && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold">اختصارات العمليات</h2>
                <p className="text-xs text-muted-foreground">
                  اضغط الرقم المقابل أثناء تواجدك في الصفحة الرئيسية
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {visibleShortcuts.map((s) => (
                <Link
                  key={s.label}
                  to={s.to as never}
                  search={s.search as never}
                  className="group relative rounded-2xl bg-card p-4 shadow-sm border hover:shadow-md transition-all hover:-translate-y-1"
                >
                  <div className="absolute top-2 left-2 grid size-7 place-items-center rounded-xl bg-muted/50 text-xs font-bold text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground">
                    {s.key}
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <s.icon className={`size-5 ${s.tone}`} />
                  </div>
                  <div className="font-semibold text-sm">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Quick actions tiles */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold">الإجراءات السريعة</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {TILES.filter((t) => canPage(pageForPath(t.to))).map((t) => (
              <Link
                key={t.label}
                to={t.to as never}
                className={`rounded-2xl p-5 shadow-sm border transition-all hover:shadow-md hover:-translate-y-1 group ${t.tone}`}
              >
                <div className="w-10 h-10 rounded-xl bg-white/60 backdrop-blur flex items-center justify-center group-hover:scale-110 transition-transform">
                  <t.icon className="size-6" />
                </div>
                <div className="mt-4 text-lg font-bold">{t.label}</div>
                <div className="text-sm opacity-80 mt-1">{t.desc}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* Low stock */}
        {canField("quantity") && canField("reorder_level") && low.length > 0 && (
          <section className="mt-6">
            <Tabs defaultValue="low" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="low" className="flex-1">
                  <AlertTriangle className="mr-2 size-4 text-warning" />
                  أصناف وصلت لحد الطلب ({low.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="low" className="mt-4">
                <div className="rounded-xl border shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-3 px-4 text-muted-foreground font-medium">
                          الصنف
                        </th>
                        <th className="text-right py-3 px-4 text-muted-foreground font-medium w-20">
                          المخزون
                        </th>
                        <th className="text-right py-3 px-4 text-muted-foreground font-medium w-24">
                          الحد الأدنى
                        </th>
                        <th className="text-right py-3 px-4 text-muted-foreground font-medium w-20">
                          الحالة
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {low.slice(0, 8).map((p) => (
                        <tr key={p.id} className="border-b border-b">
                          <td className="py-3 px-4 font-medium">{p.name}</td>
                          <td className="py-3 px-4 text-right font-mono">{qty(p.id)}</td>
                          <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                            {Number(p.reorder_level)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Badge variant="destructive" className="text-xs px-2 py-1">
                              ناقص
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>
          </section>
        )}
      </div>
    </AppShell>
  );
}
