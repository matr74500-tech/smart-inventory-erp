import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);

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
      setUsername(null);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase.from("profiles").select("username").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]).then(([p, r]) => {
      setUsername(p.data?.username ?? null);
      setRoles((r.data ?? []).map((x) => x.role as Role));
      setLoading(false);
    });
  }, [session?.user.id]);

  const can = (...r: Role[]) => roles.includes("admin") || r.some((x) => roles.includes(x));

  return (
    <Ctx.Provider
      value={{ session, loading, username, roles, can, signOut: async () => void (await supabase.auth.signOut()) }}
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
