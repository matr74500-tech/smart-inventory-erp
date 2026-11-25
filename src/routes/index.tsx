import { useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  FileText,
  Package,
  Receipt,
  Search,
  ShoppingCart,
  Sparkles,
  Truck,
  Warehouse,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useInventory } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { pageForPath } from "@/lib/permissions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الرئيسية ولوحة التحكم | الإخوة" },
      {
        name: "description",
        content:
          "لوحة تحكم عصرية لمتابعة المبيعات والمخزون والتوريد وإنجاز العمليات اليومية بسرعة.",
      },
      { property: "og:title", content: "الرئيسية ولوحة التحكم | الإخوة" },
      { property: "og:description", content: "كل ما يهمك في المخزون والمبيعات، في نظرة واحدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const TILES = [
  { to: "/inventory", label: "المخزون", desc: "الأصناف والكميات", icon: Boxes },
  { to: "/inventory", label: "البحث الذكي", desc: "بالاسم أو الباركود", icon: Search },
  { to: "/stocktake", label: "الجرد", desc: "مراجعة وتحديث الأرصدة", icon: ClipboardCheck },
  { to: "/reorders", label: "التوريد", desc: "طلبات إعادة التوريد", icon: Truck },
  { to: "/transfers", label: "التحويلات", desc: "بين المستودعات", icon: ArrowLeftRight },
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
    tone: "bg-success-soft text-success",
  },
  {
    key: "2",
    label: "فاتورة جديدة",
    desc: "فاتورة بيع تفصيلية",
    to: "/sales",
    search: { view: "invoice" },
    page: "sales",
    icon: FileText,
    tone: "bg-secondary text-primary",
  },
  {
    key: "3",
    label: "سند صرف",
    desc: "تسجيل عملية صرف",
    to: "/customers",
    search: { voucher: "payment" },
    page: "customers",
    icon: Receipt,
    tone: "bg-danger-soft text-destructive",
  },
  {
    key: "4",
    label: "أمر شراء",
    desc: "طلب توريد جديد",
    to: "/purchase_orders",
    search: {},
    page: "purchase_orders",
    icon: ShoppingCart,
    tone: "bg-gold-soft text-gold-foreground",
  },
  {
    key: "5",
    label: "البيع السريع",
    desc: "فتح نقطة البيع",
    to: "/sales",
    search: { view: "pos" },
    page: "sales",
    icon: Zap,
    tone: "bg-success-soft text-success",
  },
  {
    key: "6",
    label: "الأصناف",
    desc: "إدارة المخزون",
    to: "/inventory",
    search: {},
    page: "inventory",
    icon: Boxes,
    tone: "bg-secondary text-primary",
  },
  {
    key: "7",
    label: "التوريد",
    desc: "متابعة الطلبات",
    to: "/reorders",
    search: {},
    page: "reorders",
    icon: Truck,
    tone: "bg-warning-soft text-warning-foreground",
  },
] as const;

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function Dashboard() {
  const { products, warehouses, stock, reorders, qty } = useInventory();
  const { canPage, canField, username } = useAuth();
  const navigate = useNavigate();
  const low = products.filter(
    (product) =>
      Number(product.reorder_level) > 0 && qty(product.id) <= Number(product.reorder_level),
  );
  const pending = reorders.filter((reorder) => reorder.status === "pending").length;
  const totalStock = stock.reduce((sum, row) => sum + Number(row.quantity), 0);
  const stockHealth = products.length
    ? Math.max(0, Math.round(((products.length - low.length) / products.length) * 100))
    : 100;
  const today = new Intl.DateTimeFormat("ar-YE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Aden",
  }).format(new Date());

  const stats = [
    {
      label: "الأصناف المسجلة",
      value: products.length,
      note: "ضمن دليل المنتجات",
      icon: Package,
      tone: "bg-secondary text-primary",
      needsQuantity: false,
    },
    {
      label: "إجمالي الوحدات",
      value: totalStock,
      note: `في ${warehouses.length} مستودعات`,
      icon: Boxes,
      tone: "bg-gold-soft text-gold-foreground",
      needsQuantity: true,
    },
    {
      label: "تحت حد الطلب",
      value: low.length,
      note: low.length ? "أصناف تحتاج إلى إجراء" : "المخزون بحالة جيدة",
      icon: AlertTriangle,
      tone: low.length ? "bg-warning-soft text-warning-foreground" : "bg-success-soft text-success",
      needsQuantity: true,
    },
    {
      label: "توريد معلق",
      value: pending,
      note: "طلبات بانتظار المتابعة",
      icon: Truck,
      tone: "bg-secondary text-primary",
      needsQuantity: true,
    },
  ];

  const visibleShortcuts = useMemo(() => SHORTCUTS.filter((s) => canPage(s.page)), [canPage]);
  const visibleTiles = TILES.filter((tile) => canPage(pageForPath(tile.to)));
  const warehouseTotals = warehouses.map((warehouse) => ({
    ...warehouse,
    total: stock
      .filter((row) => row.warehouse_id === warehouse.id)
      .reduce((sum, row) => sum + Number(row.quantity), 0),
  }));
  const maxWarehouseTotal = Math.max(...warehouseTotals.map((warehouse) => warehouse.total), 1);

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
      <div className="space-y-6 lg:space-y-8">
        <section className="luxury-hero relative isolate overflow-hidden rounded-[2rem] bg-hero text-hero-foreground shadow-hero">
          <div className="hero-orb hero-orb-one" aria-hidden="true" />
          <div className="hero-orb hero-orb-two" aria-hidden="true" />
          <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.45fr_.75fr] lg:items-center lg:p-10">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-hero-foreground/15 bg-hero-foreground/8 px-3 py-1.5 text-xs font-semibold text-hero-muted">
                <Sparkles className="size-3.5 text-gold" />
                مساحة عملك، مرتبة ليوم أكثر إنجازًا
              </div>
              <h2 className="max-w-2xl text-3xl font-extrabold leading-[1.35] sm:text-4xl">
                أهلًا {username || "بك"}،
                <span className="mt-1 block text-gold">كل أعمالك أمامك بوضوح.</span>
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-hero-muted sm:text-base">
                تابع المخزون، ابدأ عملية بيع، وراجع الأولويات اليومية من مكان واحد دون تشتيت.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {canPage("sales") && (
                  <Link
                    to="/sales"
                    search={{ view: "pos" }}
                    className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gold px-5 text-sm font-bold text-gold-foreground shadow-gold transition-transform hover:-translate-y-0.5"
                  >
                    <ShoppingCart className="size-5" />
                    بدء عملية بيع
                    <ArrowLeft className="size-4" />
                  </Link>
                )}
                <span className="inline-flex items-center gap-2 text-xs text-hero-muted">
                  <CalendarDays className="size-4 text-gold" />
                  {today}
                </span>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-hero-foreground/12 bg-hero-foreground/8 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-5">
                <div>
                  <p className="text-sm font-semibold text-hero-muted">جاهزية المخزون</p>
                  <p className="mt-2 font-display text-4xl font-extrabold text-gold" dir="ltr">
                    {stockHealth}%
                  </p>
                  <p className="mt-2 text-xs leading-5 text-hero-muted">
                    {low.length
                      ? `${low.length} أصناف تحتاج إلى مراجعة`
                      : "جميع الأصناف ضمن الحدود المطلوبة"}
                  </p>
                </div>
                <div className="relative grid size-24 shrink-0 place-items-center">
                  <svg
                    className="absolute inset-0 size-full -rotate-90"
                    viewBox="0 0 100 100"
                    aria-hidden="true"
                  >
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="var(--hero-foreground)"
                      strokeOpacity=".12"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="var(--gold)"
                      strokeLinecap="round"
                      strokeWidth="8"
                      pathLength="100"
                      strokeDasharray={`${stockHealth} 100`}
                    />
                  </svg>
                  <Package className="size-8 text-gold" strokeWidth={1.5} />
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2 border-t border-hero-foreground/10 pt-4 text-xs text-hero-muted">
                <CheckCircle2 className="size-4 text-gold" />
                البيانات تتحدث تلقائيًا مع كل عملية جديدة
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="مؤشرات المخزون"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
        >
          {stats
            .filter((stat) => !stat.needsQuantity || canField("quantity"))
            .map((stat) => (
              <article key={stat.label} className="luxury-card group p-4 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className={`grid size-10 place-items-center rounded-2xl ${stat.tone}`}>
                    <stat.icon className="size-5" strokeWidth={1.8} />
                  </span>
                  <span className="mt-1 size-1.5 rounded-full bg-gold opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p
                  className="mt-5 font-display text-2xl font-extrabold tracking-tight sm:text-3xl"
                  dir="ltr"
                >
                  {numberFormat.format(stat.value)}
                </p>
                <h3 className="mt-1 text-sm font-bold">{stat.label}</h3>
                <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">{stat.note}</p>
              </article>
            ))}
        </section>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.8fr)]">
          <div className="space-y-6">
            {visibleShortcuts.length > 0 && (
              <section className="luxury-card p-5 sm:p-6">
                <div className="mb-5 flex items-end justify-between gap-3">
                  <div>
                    <span className="section-eyebrow">إنجاز أسرع</span>
                    <h2 className="mt-1 text-xl font-extrabold">العمليات اليومية</h2>
                  </div>
                  <span className="hidden items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1.5 text-[11px] text-muted-foreground sm:inline-flex">
                    <Zap className="size-3.5 text-gold-foreground" />
                    استخدم أرقام 1–7 من لوحة المفاتيح
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {visibleShortcuts.map((shortcut) => (
                    <Link
                      key={shortcut.label}
                      to={shortcut.to as never}
                      search={shortcut.search as never}
                      className="group relative rounded-2xl border border-transparent bg-surface-soft p-4 transition-all hover:-translate-y-1 hover:border-gold/40 hover:bg-card hover:shadow-card"
                    >
                      <span className="absolute left-3 top-3 grid size-6 place-items-center rounded-lg border bg-card text-[11px] font-bold text-muted-foreground shadow-sm">
                        {shortcut.key}
                      </span>
                      <span
                        className={`grid size-10 place-items-center rounded-xl ${shortcut.tone}`}
                      >
                        <shortcut.icon className="size-5" strokeWidth={1.8} />
                      </span>
                      <span className="mt-4 block text-sm font-bold">{shortcut.label}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {shortcut.desc}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {visibleTiles.length > 0 && (
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <span className="section-eyebrow">وصول مباشر</span>
                    <h2 className="mt-1 text-xl font-extrabold">مراكز العمل</h2>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {visibleTiles.map((tile) => (
                    <Link
                      key={tile.label}
                      to={tile.to as never}
                      className="group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card transition-all hover:border-primary/25 hover:bg-secondary/45"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                        <tile.icon className="size-5" strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{tile.label}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {tile.desc}
                        </span>
                      </span>
                      <ChevronLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            {canField("quantity") && canField("reorder_level") && (
              <section className="luxury-card overflow-hidden">
                <div className="flex items-center justify-between border-b p-5">
                  <div>
                    <span className="section-eyebrow">أولوية المتابعة</span>
                    <h2 className="mt-1 text-lg font-extrabold">قرب نفاد المخزون</h2>
                  </div>
                  <span className="grid size-10 place-items-center rounded-2xl bg-warning-soft text-warning-foreground">
                    <AlertTriangle className="size-5" />
                  </span>
                </div>
                {low.length ? (
                  <div className="divide-y px-5">
                    {low.slice(0, 6).map((product) => (
                      <div key={product.id} className="flex items-center gap-3 py-3.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-soft text-muted-foreground">
                          <Package className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{product.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            المتبقي {numberFormat.format(qty(product.id))} · حد الطلب{" "}
                            {numberFormat.format(Number(product.reorder_level))}
                          </p>
                        </div>
                        <span className="size-2 shrink-0 rounded-full bg-warning" />
                      </div>
                    ))}
                    {canPage("alerts") && (
                      <Link
                        to="/alerts"
                        className="my-4 flex h-10 items-center justify-center gap-2 rounded-xl bg-surface-soft text-xs font-bold text-primary hover:bg-secondary"
                      >
                        عرض كل التنبيهات
                        <ArrowLeft className="size-3.5" />
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="p-7 text-center">
                    <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-success-soft text-success">
                      <CheckCircle2 className="size-6" />
                    </span>
                    <p className="mt-3 text-sm font-bold">المخزون مطمئن</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      لا توجد أصناف تجاوزت حد إعادة الطلب.
                    </p>
                  </div>
                )}
              </section>
            )}

            {canField("quantity") && (
              <section className="luxury-card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="section-eyebrow">توزيع الأرصدة</span>
                    <h2 className="mt-1 text-lg font-extrabold">المستودعات</h2>
                  </div>
                  <Warehouse className="size-5 text-primary" />
                </div>
                <div className="mt-5 space-y-5">
                  {warehouseTotals.map((warehouse) => (
                    <div key={warehouse.id}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-semibold">{warehouse.name}</span>
                        <span className="shrink-0 font-display font-bold text-primary" dir="ltr">
                          {numberFormat.format(warehouse.total)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-primary to-gold transition-all"
                          style={{
                            width: `${Math.max(warehouse.total ? 6 : 0, (warehouse.total / maxWarehouseTotal) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {!warehouseTotals.length && (
                    <p className="rounded-xl bg-surface-soft p-4 text-center text-xs text-muted-foreground">
                      ستظهر أرصدة المستودعات هنا بعد إضافتها.
                    </p>
                  )}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
