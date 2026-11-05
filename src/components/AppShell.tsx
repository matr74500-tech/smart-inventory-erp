import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
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
} from "lucide-react";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useState } from "react";
import { useAuth, ROLE_LABELS, type Role } from "@/lib/auth";

export const NAV: { to: string; label: string; icon: typeof Boxes; roles?: Role[] }[] = [
  { to: "/", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/inventory", label: "الأصناف والمخزون", icon: Boxes },
  { to: "/purchases", label: "فاتورة مشتريات", icon: ShoppingCart, roles: ["storekeeper"] },
  { to: "/prices", label: "تحديث الأسعار", icon: BadgeDollarSign, roles: ["storekeeper"] },
  { to: "/alerts", label: "تنبيهات المخزون", icon: Bell },
  { to: "/labels", label: "ملصقات الباركود", icon: Tags },
  { to: "/catalog", label: "كتالوج PDF", icon: FileText },
  { to: "/stocktake", label: "الجرد والإدخال", icon: ClipboardCheck, roles: ["storekeeper"] },
  { to: "/transfers", label: "التحويلات", icon: ArrowLeftRight, roles: ["storekeeper"] },
  { to: "/reorders", label: "التوريد", icon: Truck, roles: ["storekeeper"] },
  { to: "/settings", label: "الإعدادات", icon: Settings, roles: ["storekeeper"] },
  { to: "/users", label: "المستخدمون", icon: Users, roles: ["admin"] },
];

export function AppShell({ title, roles, children }: { title: string; roles?: Role[]; children: ReactNode }) {
  const { session, loading, username, roles: myRoles, can, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/login" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const allowed = !roles || can(...roles);

  return (
    <div dir="rtl" className="min-h-screen md:flex print:block">
      <aside className="no-print bg-sidebar text-sidebar-foreground md:w-64 md:min-h-screen md:sticky md:top-0 flex md:flex-col">
        <div className="hidden md:block p-5 border-b border-sidebar-border">
          <div className="font-display text-xl font-bold">سهيل سوفت</div>
          <div className="text-xs opacity-70">نقاط البيع وإدارة المخزون</div>
        </div>
        <nav className="flex md:flex-col gap-1 p-2 overflow-x-auto flex-1">
          {NAV.filter((n) => !n.roles || can(...n.roles)).map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm whitespace-nowrap hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary" }}
            >
              <n.icon className="size-5" />
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-3 md:border-t border-sidebar-border flex items-center gap-2">
          <div className="hidden md:block flex-1 text-sm">
            <div className="font-semibold">{username}</div>
            <div className="text-xs opacity-70">{myRoles.map((r) => ROLE_LABELS[r]).join("، ")}</div>
          </div>
          <button
            onClick={() => signOut()}
            className="rounded-lg p-2 hover:bg-sidebar-accent"
            aria-label="تسجيل الخروج"
          >
            <LogOut className="size-5" />
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-8 max-w-7xl print:p-0 print:max-w-none">
        <div className="no-print flex items-center gap-3 mb-6">
          <h1 className="flex-1 text-2xl md:text-3xl font-bold">{title}</h1>
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            <Search className="size-4" /> <span className="hidden sm:inline">بحث سريع عن صنف</span>
          </button>
        </div>
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
    </div>
  );
}
