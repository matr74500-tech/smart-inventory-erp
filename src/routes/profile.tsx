import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { updateOwnPassword, updateOwnProfile } from "@/lib/users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "ملف المستخدم | نظام المخزون الذكي" },
      {
        name: "description",
        content: "إدارة ملفك الشخصي وتغيير كلمة المرور.",
      },
      { property: "og:title", content: "ملف المستخدم | نظام المخزون الذكي" },
      { property: "og:description", content: "تعديل البيانات الشخصية وتغيير كلمة المرور." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { session, username, roles, can } = useAuth();
  const [fullName, setFullName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const updateProfile = useServerFn(updateOwnProfile);
  const changePassword = useServerFn(updateOwnPassword);

  const userRoles = roles.map(
    (r) =>
      ({
        admin: "مدير",
        storekeeper: "أمين مخزن",
        cashier: "بائع",
      })[r] ?? r,
  );

  useEffect(() => {
    const load = async () => {
      if (!session?.user.id) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.user.id)
        .maybeSingle();
      setFullName(data?.full_name ?? "");
    };
    load();
  }, [session]);

  async function onSaveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile({ data: { fullName } });
      toast.success("تم تحديث البيانات الشخصية");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر التحديث");
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast.error("كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("تأكيد كلمة المرور غير متطابق");
      return;
    }
    setBusy(true);
    try {
      await changePassword({
        data: { currentPassword, newPassword },
      });
      toast.success("تم تغيير كلمة المرور بنجاح");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تغيير كلمة المرور");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="ملفي الشخصي" roles={["storekeeper", "cashier", "admin"]}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="rounded-xl bg-card shadow-card p-6">
          <div className="flex items-center gap-4 mb-6">
            <User className="size-8 text-primary" />
            <div>
              <h2 className="text-xl font-bold">ملفي الشخصي</h2>
              <p className="text-sm text-muted-foreground">إدارة بيانات حسابك وتغيير كلمة المرور</p>
            </div>
          </div>

          <Separator />

          <h3 className="text-sm font-semibold mb-4">بيانات الحساب</h3>
          <form onSubmit={onSaveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المستخدم</Label>
              <Input value={username ?? ""} dir="ltr" readOnly className="bg-muted/50" />
              <p className="text-xs text-muted-foreground">
                لا يمكن تغيير اسم المستخدم بعد الإنشاء.
              </p>
            </div>
            <div className="space-y-2">
              <Label>الاسم الكامل</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="اسمك الكامل"
              />
            </div>
            <div className="space-y-2">
              <Label>الأدوار</Label>
              <div className="flex flex-wrap gap-2">
                {userRoles.map((r) => (
                  <span key={r} className="px-3 py-1 rounded-full border border-input text-xs">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              حفظ البيانات الشخصية
            </Button>
          </form>
        </div>

        <div className="rounded-xl bg-card shadow-card p-6">
          <h3 className="text-sm font-semibold mb-4">تغيير كلمة المرور</h3>
          <p className="text-sm text-muted-foreground mb-6">
            أدخل كلمة المرور الحالية والجديدة لتغيير كلمة المرور الخاصة بك.
          </p>
          <form onSubmit={onChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>كلمة المرور الحالية</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label>تأكيد كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              تغيير كلمة المرور
            </Button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
