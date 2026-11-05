import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, Trash2, UserCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, useAuth, type Role } from "@/lib/auth";
import { createUser, deleteUser, resetUserPassword } from "@/lib/users.functions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "المستخدمون والصلاحيات | سهيل سوفت" },
      { name: "description", content: "إنشاء مستخدمين بكلمات مرور خاصة وتحديد صلاحياتهم: مدير، أمين مخزن، بائع." },
      { property: "og:title", content: "المستخدمون والصلاحيات | سهيل سوفت" },
      { property: "og:description", content: "إدارة المستخدمين والصلاحيات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsersPage,
});

type Row = { id: string; username: string; full_name: string | null; roles: Role[] };
const ROLE_HINTS: Record<Role, string> = {
  admin: "كل الصلاحيات وإدارة المستخدمين",
  storekeeper: "الأصناف، الجرد، المشتريات، الأسعار، التحويلات",
  cashier: "البحث وعرض الأصناف والأسعار",
};

function UsersPage() {
  const { session, can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [pwFor, setPwFor] = useState<Row | null>(null);
  const create = useServerFn(createUser);
  const resetPw = useServerFn(resetUserPassword);
  const remove = useServerFn(deleteUser);

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("id, username, full_name").order("created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setRows((p.data ?? []).map((u) => ({ ...u, roles: (r.data ?? []).filter((x) => x.user_id === u.id).map((x) => x.role as Role) })));
  }, []);
  const isAdmin = can("admin");
  useEffect(() => { if (isAdmin) load(); }, [load, isAdmin]);

  async function toggle(userId: string, role: Role, on: boolean) {
    const { error } = on
      ? await supabase.from("user_roles").insert({ user_id: userId, role })
      : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    if (error) { toast.error(error.message); return; }
    load();
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const roles = (Object.keys(ROLE_LABELS) as Role[]).filter((r) => f.get(`role_${r}`));
    if (!roles.length) return toast.error("اختر صلاحية واحدة على الأقل");
    try {
      await create({ data: { username: String(f.get("username")), password: String(f.get("password")), fullName: String(f.get("full_name") || ""), roles } });
      toast.success("تم إنشاء المستخدم");
      setAddOpen(false);
      load();
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذر الإنشاء"); }
  }

  async function onReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pwFor) return;
    try {
      await resetPw({ data: { userId: pwFor.id, password: String(new FormData(e.currentTarget).get("password")) } });
      toast.success("تم تغيير كلمة المرور");
      setPwFor(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : "تعذر التغيير"); }
  }

  async function onDelete(u: Row) {
    if (!confirm(`حذف المستخدم ${u.username}؟`)) return;
    try { await remove({ data: { userId: u.id } }); toast.success("تم الحذف"); load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "تعذر الحذف"); }
  }

  return (
    <AppShell title="المستخدمون والصلاحيات" roles={["admin"]}>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="flex-1 grid sm:grid-cols-3 gap-2 text-xs">
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <div key={r} className="rounded-lg bg-card shadow-card p-2"><b>{ROLE_LABELS[r]}:</b> {ROLE_HINTS[r]}</div>)}
        </div>
        <Button onClick={() => setAddOpen(true)}><UserPlus className="size-4" /> مستخدم جديد</Button>
      </div>
      <div className="rounded-xl bg-card shadow-card divide-y">
        {rows.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-4 p-4">
            <UserCircle className="size-8 text-muted-foreground" />
            <div className="flex-1 min-w-32"><div className="font-medium" dir="ltr">{u.username}</div>{u.full_name && <div className="text-xs text-muted-foreground">{u.full_name}</div>}</div>
            {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm">
                <Switch checked={u.roles.includes(role)} disabled={role === "admin" && u.id === session?.user.id} onCheckedChange={(v) => toggle(u.id, role, v)} />
                {ROLE_LABELS[role]}
              </label>
            ))}
            <Button size="icon" variant="ghost" onClick={() => setPwFor(u)} aria-label="تغيير كلمة المرور"><KeyRound className="size-4" /></Button>
            {u.id !== session?.user.id && <Button size="icon" variant="ghost" onClick={() => onDelete(u)} aria-label="حذف"><Trash2 className="size-4 text-destructive" /></Button>}
          </div>
        ))}
        {!rows.length && <Loader2 className="mx-auto my-6 size-6 animate-spin text-primary" />}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>مستخدم جديد</DialogTitle></DialogHeader>
          <form onSubmit={onAdd} className="space-y-3">
            <div className="space-y-1"><Label>اسم المستخدم (حروف إنجليزية وأرقام)</Label><Input name="username" dir="ltr" required minLength={3} pattern="[a-zA-Z0-9._\-]+" /></div>
            <div className="space-y-1"><Label>الاسم الكامل</Label><Input name="full_name" /></div>
            <div className="space-y-1"><Label>كلمة المرور</Label><Input name="password" type="password" dir="ltr" required minLength={6} /></div>
            <div className="flex gap-4">{(Object.keys(ROLE_LABELS) as Role[]).map((r) => <label key={r} className="flex items-center gap-2 text-sm"><Checkbox name={`role_${r}`} defaultChecked={r === "cashier"} /> {ROLE_LABELS[r]}</label>)}</div>
            <Button type="submit" className="w-full">إنشاء</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!pwFor} onOpenChange={(o) => !o && setPwFor(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>كلمة مرور جديدة لـ {pwFor?.username}</DialogTitle></DialogHeader>
          <form onSubmit={onReset} className="space-y-3">
            <Input name="password" type="password" dir="ltr" required minLength={6} />
            <Button type="submit" className="w-full">حفظ</Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
