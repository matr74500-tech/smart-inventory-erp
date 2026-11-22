import { useEffect, useState, type ReactNode } from "react";
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
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  // Auto-close the side panel whenever a dialog opens to maximize the workspace.
  useEffect(() => {
    if (searchOpen || logoutOpen) setNavOpen(false);
  }, [searchOpen, logoutOpen]);

  // Close the panel after navigating to another page.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

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
    <div dir="rtl" className="min-h-screen print:block">
      <OfflineBanner />
      {navOpen && (
        <div
          className="no-print fixed inset-0 z-30 bg-black/40 print:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`no-print fixed top-0 right-0 z-40 flex h-screen w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-200 print:hidden ${
          navOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 p-5 border-b border-sidebar-border">
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
        <div className="p-3 md:border-t border-sidebar-border flex items-center gap-2">
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
      </aside>
      <main className="min-w-0 p-4 md:p-8 max-w-7xl mx-auto print:p-0 print:max-w-none">
        <div className="no-print flex items-center gap-3 mb-6">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setNavOpen(true)}
            className="shrink-0 rounded-lg"
            aria-label="فتح القائمة"
          >
            <Menu className="size-5" />
          </Button>
          <h1 className="flex-1 text-2xl md:text-3xl font-bold">{title}</h1>
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
        </div>
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
