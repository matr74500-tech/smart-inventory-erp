import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { User, Lock, Loader2, LogIn, UserPlus, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usernameToEmail } from "@/lib/arabic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | سهيل سوفت" },
      { name: "description", content: "سجّل الدخول باسم المستخدم وكلمة المرور إلى سهيل سوفت." },
      { property: "og:title", content: "تسجيل الدخول | سهيل سوفت" },
      { property: "og:description", content: "الدخول إلى نظام نقاط البيع وإدارة المخزون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: "/" });
  }, [session, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(username.trim())) {
      toast.error("اسم المستخدم يجب أن يكون 3 أحرف إنجليزية أو أرقام على الأقل");
      return;
    }
    setBusy(true);
    const email = usernameToEmail(username);
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { username: username.trim().toLowerCase() }, emailRedirectTo: window.location.origin },
          });
    setBusy(false);
    if (error) toast.error(mode === "in" ? "اسم المستخدم أو كلمة المرور غير صحيحة" : error.message);
  }

  return (
    <div dir="rtl" className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex bg-brand text-primary-foreground flex-col justify-between p-12">
        <div className="flex items-center gap-3 font-display text-2xl font-bold">
          <Store className="size-8" /> سهيل سوفت
        </div>
        <div>
          <h2 className="text-4xl font-bold leading-tight">مخزونك تحت السيطرة،<br />لحظة بلحظة.</h2>
          <p className="mt-4 opacity-80">جرد، تحويلات، توريد، وبحث ذكي بالباركود — في مكان واحد.</p>
        </div>
        <div className="text-sm opacity-60">© SuhailSoft</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-3xl font-bold">{mode === "in" ? "تسجيل الدخول" : "حساب جديد"}</h1>
            <p className="text-muted-foreground mt-1">أدخل اسم المستخدم وكلمة المرور</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="u">اسم المستخدم</Label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input id="u" dir="ltr" className="pr-10 h-11 text-right" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p">كلمة المرور</Label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input id="p" type="password" dir="ltr" className="pr-10 h-11 text-right" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} required />
            </div>
          </div>
          <Button type="submit" className="w-full h-11" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "in" ? <LogIn className="size-4" /> : <UserPlus className="size-4" />}
            {mode === "in" ? "دخول" : "إنشاء الحساب"}
          </Button>
          <button type="button" className="w-full text-sm text-primary hover:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "ليس لديك حساب؟ أنشئ حساباً" : "لديك حساب؟ سجّل الدخول"}
          </button>
          <p className="text-xs text-muted-foreground text-center">أول حساب يُنشأ يصبح مديراً، والبقية بصلاحية بائع حتى يغيّرها المدير.</p>
        </form>
      </div>
    </div>
  );
}
