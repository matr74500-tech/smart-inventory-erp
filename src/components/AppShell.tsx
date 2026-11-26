import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { pageForPath } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Boxes,
  ClipboardCheck,
  ArrowLeftRight,
  Truck,
  Users,
  LogOut,
  Loader2,
  ShieldAlert,
  ShoppingCart,
  BadgeDollarSign,
  Tags,
  FileText,
  Bell,
  Settings,
  Search,
  DatabaseBackup,
  Trash2,
  Wallet,
  Menu,
  X,
  RotateCcw,
  Activity,
  CreditCard,
  Barcode,
  Palette,
  Move,
  Share2,
  Clock,
  ChevronRight,
  User,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/GlobalSearch";
import { LowStockWatcher } from "@/components/LowStockWatcher";
import { useAuth, ROLE_LABELS, type Role } from "@/lib/auth";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OfflineQueue } from "@/components/OfflineQueue";

export const NAV: {
  to: string;
  label: string;
  icon: typeof Boxes;
  roles?: Role[];
  group?: string;
}[] = [
  { to: "/", label: "الرئيسية", icon: LayoutDashboard, group: "الرئيسية" },
  {
    to: "/inventory",
    label: "الأصناف والمخزون",
    icon: Boxes,
    group: "المخزون",
  },
  {
    to: "/purchases",
    label: "فاتورة مشتريات",
    icon: ShoppingCart,
    roles: ["storekeeper"],
    group: "المشتريات",
  },
  {
    to: "/suppliers",
    label: "الموردون",
    icon: Truck,
    roles: ["storekeeper"],
    group: "المشتريات",
  },
  {
    to: "/purchase_orders",
    label: "أوامر الشراء",
    icon: ShoppingCart,
    roles: ["storekeeper"],
    group: "المشتريات",
  },
  {
    to: "/sales",
    label: "المبيعات",
    icon: ShoppingCart,
    roles: ["storekeeper", "cashier"],
    group: "المبيعات",
  },
  {
    to: "/customers",
    label: "العملاء",
    icon: Users,
    roles: ["storekeeper", "cashier"],
    group: "المبيعات",
  },
  {
    to: "/account_statements",
    label: "كشوفات الحسابات",
    icon: BookOpen,
    roles: ["storekeeper", "cashier"],
    group: "المبيعات",
  },
  {
    to: "/cash",
    label: "الصندوق والإقفال",
    icon: Wallet,
    roles: ["storekeeper", "cashier"],
    group: "المبيعات",
  },
  {
    to: "/reports",
    label: "التقارير",
    icon: FileText,
    roles: ["storekeeper"],
    group: "التقارير",
  },
  { to: "/alerts", label: "تنبيهات المخزون", icon: Bell, group: "التقارير" },
  {
    to: "/stocktake",
    label: "الجرد والإدخال",
    icon: ClipboardCheck,
    roles: ["storekeeper"],
    group: "المخزون",
  },
  {
    to: "/transfers",
    label: "التحويلات",
    icon: ArrowLeftRight,
    roles: ["storekeeper"],
    group: "المخزون",
  },
  {
    to: "/reorders",
    label: "التوريد",
    icon: Truck,
    roles: ["storekeeper"],
    group: "المخزون",
  },
  {
    to: "/labels",
    label: "ملصقات الباركود",
    icon: Tags,
    group: "الأدوات",
  },
  { to: "/catalog", label: "كتالوج PDF", icon: FileText, group: "الأدوات" },
  {
    to: "/returns",
    label: "المرتجعات والمردودات",
    icon: RotateCcw,
    group: "الأدوات",
  },
  {
    to: "/expenses",
    label: "المصروفات العامة",
    icon: CreditCard,
    roles: ["storekeeper"],
    group: "الأدوات",
  },
  {
    to: "/sales_reps",
    label: "المناديب والعمولات",
    icon: Users,
    roles: ["storekeeper"],
    group: "الإعدادات",
  },
  {
    to: "/activity_log",
    label: "سجل تحركات النظام",
    icon: Activity,
    roles: ["storekeeper"],
    group: "الإعدادات",
  },
  {
    to: "/scanner_settings",
    label: "إعدادات ماسح الباركود",
    icon: Barcode,
    roles: ["storekeeper"],
    group: "الإعدادات",
  },
  {
    to: "/barcode_labels",
    label: "إعدادات ملصقات الباركود",
    icon: Tags,
    roles: ["storekeeper"],
    group: "الإعدادات",
  },
  {
    to: "/ui_theme",
    label: "التخصيص والشكل",
    icon: Palette,
    roles: ["storekeeper"],
    group: "الإعدادات",
  },
  {
    to: "/home_shortcuts",
    label: "اختصارات الصفحة الرئيسية",
    icon: Move,
    roles: ["storekeeper"],
    group: "الإعدادات",
  },
  {
    to: "/share_settings",
    label: "إعدادات المشاركة",
    icon: Share2,
    roles: ["storekeeper"],
    group: "الإعدادات",
  },
  {
    to: "/system_timezone",
    label: "التوقيت الزمني",
    icon: Clock,
    roles: ["storekeeper"],
    group: "الإعدادات",
  },
  {
    to: "/settings",
    label: "الإعدادات",
    icon: Settings,
    roles: ["storekeeper"],
    group: "الإعدادات",
  },
  { to: "/profile", label: "ملفي الشخصي", icon: User },
  {
    to: "/backup",
    label: "النسخ الاحتياطي",
    icon: DatabaseBackup,
    roles: ["admin"],
    group: "إدارة النظام",
  },
  { to: "/users", label: "المستخدمون", icon: Users, roles: ["admin"], group: "إدارة النظام" },
  {
    to: "/cleanup",
    label: "حذف وتنظيف البيانات",
    icon: Trash2,
    roles: ["admin"],
    group: "إدارة النظام",
  },
];
const ADMIN_ONLY = ["/users", "/backup", "/cleanup"];

export function AppShell({
  title,
  roles,
  children,
}: {
  title: string;
  roles?: Role[];
  children: ReactNode;
}) {
  const { session, loading, username, roles: myRoles, canPage, can, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [wipeLocal, setWipeLocal] = useState(true);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (searchOpen || logoutOpen) setNavOpen(false);
  }, [searchOpen, logoutOpen]);

  const prevPath = useRef(location.pathname);
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname;
      setNavOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const allowed =
    canPage(pageForPath(location.pathname)) &&
    (!ADMIN_ONLY.includes(location.pathname) || can("admin"));

  // Group nav items by group
  const groups = NAV.reduce<Record<string, typeof NAV>>((acc, n) => {
    if (!canPage(pageForPath(n.to))) return acc;
    if (ADMIN_ONLY.includes(n.to) && !can("admin")) return acc;
    const g = n.group || "الأدوات";
    if (!acc[g]) acc[g] = [];
    acc[g].push(n);
    return acc;
  }, {});
  const groupOrder = [
    "الرئيسية",
    "المخزون",
    "المشتريات",
    "المبيعات",
    "التقارير",
    "الأدوات",
    "الإعدادات",
    "إدارة النظام",
  ];
  const sortedGroups = groupOrder.filter((g) => groups[g]);

  return (
    <div dir="rtl" className="min-h-screen bg-background print:block">
      <div
        className={`no-print fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 print:hidden ${
          navOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setNavOpen(false)}
        aria-hidden
      />

      <aside
        className={`no-print fixed inset-y-0 right-0 z-50 flex w-72 max-w-[90vw] flex-col bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-300 ease-out print:hidden ${
          navOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!navOpen}
      >
        <div className="flex h-full w-full flex-col">
          <div className="flex items-center gap-2 border-b border-sidebar-border p-5 bg-sidebar/95 backdrop-blur">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
                <span className="text-primary">مخزوني</span>
                <span className="opacity-50">ERP</span>
              </div>
              <div className="text-xs opacity-60 font-medium">نقاط البيع وإدارة المخزون</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNavOpen(false)}
              className="rounded-lg p-2 hover:bg-sidebar-accent"
              aria-label="إغلاق القائمة"
            >
              <X className="size-5" />
            </Button>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
            {sortedGroups.map((g) => (
              <div key={g} className="mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60 px-3 mb-2">
                  {g}
                </h3>
                {groups[g].map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    activeOptions={{ exact: n.to === "/" }}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                      location.pathname === n.to
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "hover:bg-sidebar-accent text-sidebar-foreground",
                    )}
                  >
                    <n.icon className="size-5 shrink-0" />
                    <span>{n.label}</span>
                    <ChevronRight className="size-4 opacity-0 group-hover:opacity-100 ml-auto transition-opacity" />
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="p-4 border-t border-sidebar-border bg-sidebar/80 backdrop-blur">
            <div className="flex-1">
              <div className="font-semibold text-sm">{username}</div>
              <div className="text-xs opacity-60 font-medium">
                {myRoles.map((r) => ROLE_LABELS[r]).join("، ")}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLogoutOpen(true)}
              className="rounded-lg p-2 hover:bg-sidebar-accent"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="size-5" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="no-print sticky top-0 z-30 print:hidden">
        <OfflineBanner />
        <header className="flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md md:px-8 z-20">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setNavOpen((open) => !open)}
            className="shrink-0 rounded-lg"
            aria-label="فتح القائمة"
            title="فتح القائمة"
          >
            <Menu className="size-5" />
          </Button>
          <h1 className="flex-1 truncate text-xl md:text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {canPage("inventory") && (
            <Button
              variant="outline"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              <Search className="size-4" />
              <span className="hidden sm:inline">بحث سريع عن صنف</span>
            </Button>
          )}
        </header>
      </div>

      <main className="mx-auto w-full max-w-7xl p-4 md:p-6 print:p-0 print:max-w-none min-h-[calc(100vh-4rem)]">
        <OfflineQueue />
        {canPage("alerts") && <LowStockWatcher />}
        {searchOpen && <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />}
        {allowed ? (
          children
        ) : (
          <div className="rounded-xl bg-card shadow-card p-12 text-center">
            <ShieldAlert className="mx-auto size-12 text-destructive mb-3" />
            <h3 className="font-semibold mb-1">ليس لديك صلاحية للوصول إلى هذه الشاشة.</h3>
            <p className="text-sm text-muted-foreground">
              يرجى التواصل مع المسؤول للحصول على صلاحية عرض هذه الصفحة.
            </p>
          </div>
        )}
      </main>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>تسجيل الخروج</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 py-2">
            <Checkbox
              id="wipe-local-data"
              checked={wipeLocal}
              onCheckedChange={(v) => setWipeLocal(v === true)}
            />
            <label htmlFor="wipe-local-data" className="text-sm cursor-pointer">
              مسح البيانات المحلية المخزنة على هذا الجهاز
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLogoutOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                setLogoutOpen(false);
                void signOut(wipeLocal);
              }}
            >
              خروج
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
