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
} from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { LowStockWatcher } from "@/components/LowStockWatcher";
import { useAuth, ROLE_LABELS, type Role } from "@/lib/auth";
import { OfflineBanner } from "@/components/OfflineBanner";

export const NAV: { to: string; label: string; icon: typeof Boxes; roles?: Role[] }[] = [
  { to: "/", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/inventory", label: "الأصناف والمخزون", icon: Boxes },
  { to: "/purchases", label: "فاتورة مشتريات", icon: ShoppingCart, roles: ["storekeeper"] },
  { to: "/sales", label: "المبيعات", icon: ShoppingCart, roles: ["storekeeper", "cashier"] },
  { to: "/customers", label: "العملاء", icon: Users, roles: ["storekeeper", "cashier"] },
  { to: "/cash", label: "الصندوق والإقفال", icon: Wallet, roles: ["storekeeper", "cashier"] },
  { to: "/reports", label: "التقارير", icon: FileText, roles: ["storekeeper"] },
  { to: "/prices", label: "تحديث الأسعار", icon: BadgeDollarSign, roles: ["storekeeper"] },
  { to: "/alerts", label: "تنبيهات المخزون", icon: Bell },
  { to: "/labels", label: "ملصقات الباركود", icon: Tags },
  { to: "/catalog", label: "كتالوج PDF", icon: FileText },
  { to: "/stocktake", label: "الجرد والإدخال", icon: ClipboardCheck, roles: ["storekeeper"] },
  { to: "/transfers", label: "التحويلات", icon: ArrowLeftRight, roles: ["storekeeper"] },
  { to: "/reorders", label: "التوريد", icon: Truck, roles: ["storekeeper"] },
  { to: "/suppliers", label: "الموردون", icon: Truck, roles: ["storekeeper"] },
  { to: "/purchase_orders", label: "أوامر الشراء", icon: ShoppingCart, roles: ["storekeeper"] },
  { to: "/returns", label: "المرتجعات والمردودات", icon: RotateCcw },
  { to: "/expenses", label: "المصروفات العامة", icon: CreditCard, roles: ["storekeeper"] },
  { to: "/sales_reps", label: "المناديب والعمولات", icon: Users, roles: ["storekeeper"] },
  { to: "/activity_log", label: "سجل تحركات النظام", icon: Activity, roles: ["storekeeper"] },
  { to: "/settings", label: "الإعدادات", icon: Settings, roles: ["storekeeper"] },
  { to: "/backup", label: "النسخ الاحتياطي", icon: DatabaseBackup, roles: ["admin"] },
  { to: "/users", label: "المستخدمون", icon: Users, roles: ["admin"] },
  { to: "/cleanup", label: "حذف وتنظيف البيانات", icon: Trash2, roles: ["admin"] },
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
  // The control panel is a right-side overlay drawer on every screen size. It
  // starts closed, slides in over the content (so opening it never squishes the
  // page), auto-closes when a dialog opens or the page changes to free up the
  // display, and reopens from the top-right toggle in the app bar.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  // Auto-close the drawer when a dialog opens so the workspace gets full width.
  useEffect(() => {
    if (searchOpen || logoutOpen) setNavOpen(false);
  }, [searchOpen, logoutOpen]);

  // Auto-close the drawer when navigating to another page (not on first mount).
  const prevPath = useRef(location.pathname);
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname;
      setNavOpen(false);
    }
  }, [location.pathname]);

  // Close the drawer with Escape for keyboard users.
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

  return (
    <div dir="rtl" className="min-h-screen bg-background print:block">
      {/* Backdrop: click to close. Present on all sizes while the drawer is open. */}
      <div
        className={`no-print fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-200 print:hidden ${
          navOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setNavOpen(false)}
        aria-hidden
      />

      {/* Control panel: fixed right-side drawer, vertical, overlay on all sizes. */}
      <aside
        className={`no-print fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-300 ease-out print:hidden ${
          navOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!navOpen}
      >
        <div className="flex h-full w-full flex-col">
          <div className="flex items-center gap-2 border-b border-sidebar-border p-5">
            <div className="flex-1">
              <div className="font-display text-xl font-bold">نظام المخزون الذكي</div>
              <div className="text-xs opacity-70">نقاط البيع وإدارة المخزون</div>
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
          <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {NAV.filter(
              (n) => canPage(pageForPath(n.to)) && (!ADMIN_ONLY.includes(n.to) || can("admin")),
            ).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap hover:bg-sidebar-accent"
                activeProps={{
                  className:
                    "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary",
                }}
              >
                <n.icon className="size-5" />
                <span>{n.label}</span>
              </Link>
            ))}
          </nav>
          <div className="p-3 border-t border-sidebar-border flex items-center gap-2">
            <div className="flex-1 text-sm">
              <div className="font-semibold">{username}</div>
              <div className="text-xs opacity-70">
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

      {/* Sticky top bar: offline banner + app bar with the top-right drawer toggle. */}
      <div className="no-print sticky top-0 z-30 print:hidden">
        <OfflineBanner />
        <header className="flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:px-8">
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
          <h1 className="flex-1 truncate text-xl md:text-2xl font-bold">{title}</h1>
          {canPage("inventory") && (
            <Button
              variant="outline"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              <Search className="size-4" />{" "}
              <span className="hidden sm:inline">بحث سريع عن صنف</span>
            </Button>
          )}
        </header>
      </div>

      <main className="mx-auto w-full max-w-7xl p-4 md:p-8 print:p-0 print:max-w-none">
        {canPage("alerts") && <LowStockWatcher />}
        {searchOpen && <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />}
        {allowed ? (
          children
        ) : (
          <div className="rounded-xl bg-card shadow-card p-8 text-center">
            <ShieldAlert className="mx-auto size-10 text-destructive" />
            <p className="mt-3">ليس لديك صلاحية للوصول إلى هذه الشاشة.</p>
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
