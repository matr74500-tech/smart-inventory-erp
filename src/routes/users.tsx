import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UserCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, useAuth, type Role } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "المستخدمون والصلاحيات | سهيل سوفت" },
      { name: "description", content: "إدارة صلاحيات المستخدمين: مدير، أمين مخزن، بائع." },
      { property: "og:title", content: "المستخدمون والصلاحيات | سهيل سوفت" },
      { property: "og:description", content: "تحديد صلاحيات كل مستخدم." },
    ],
  }),
  component: UsersPage,
});

type Row = { id: string; username: string; roles: Role[] };

function UsersPage() {
  const { session, can } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from("profiles").select("id, username").order("created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setRows((p.data ?? []).map((u) => ({
      ...u,
      roles: (r.data ?? []).filter((x) => x.user_id === u.id).map((x) => x.role as Role),
    })));
  }, []);

  useEffect(() => { if (can("admin")) load(); }, [load, can]);

  async function toggle(userId: string, role: Role, on: boolean) {
    const { error } = on
      ? await supabase.from("user_roles").insert({ user_id: userId, role })
      : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <AppShell title="المستخدمون والصلاحيات" roles={["admin"]}>
      <div className="rounded-xl bg-card shadow-card divide-y">
        {rows.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-4 p-4">
            <UserCircle className="size-8 text-muted-foreground" />
            <div className="flex-1 font-medium" dir="ltr">{u.username}</div>
            {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
              <label key={role} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={u.roles.includes(role)}
                  disabled={role === "admin" && u.id === session?.user.id}
                  onCheckedChange={(v) => toggle(u.id, role, v)}
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
        ))}
      </div>
    </AppShell>
  );
}
