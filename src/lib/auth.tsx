import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isPermitted, type PermissionSet } from "@/lib/permissions";

export type Role = "admin" | "storekeeper" | "cashier";
export const ROLE_LABELS: Record<Role, string> = {
  admin: "مدير",
  storekeeper: "أمين مخزن",
  cashier: "بائع",
};

type AuthState = {
  session: Session | null;
  loading: boolean;
  username: string | null;
  roles: Role[];
  can: (...r: Role[]) => boolean;
  canPage: (key: string) => boolean;
  canAction: (key: string) => boolean;
  canField: (key: string) => boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionSet | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) {
      setRoles([]);
      setPermissions(null);
      setUsername(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase.from("profiles").select("username").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase
        .from("employee_permissions")
        .select("pages,actions,fields")
        .eq("user_id", uid)
        .maybeSingle(),
    ]).then(([p, r, cfg]) => {
      setUsername(p.data?.username ?? null);
      setRoles((r.data ?? []).map((x) => x.role as Role));
      setPermissions(cfg.error ? { pages: [], actions: [], fields: [] } : cfg.data);
      setLoading(false);
    });
  }, [session?.user.id]);

  const can = (...r: Role[]) => roles.includes("admin") || r.some((x) => roles.includes(x));
  const canPage = (key: string) => isPermitted(roles, permissions, "pages", key);
  const canAction = (key: string) => isPermitted(roles, permissions, "actions", key);
  const canField = (key: string) => isPermitted(roles, permissions, "fields", key);

  return (
    <Ctx.Provider
      value={{
        session,
        loading,
        username,
        roles,
        can,
        canPage,
        canAction,
        canField,
        signOut: async () => void (await supabase.auth.signOut()),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
