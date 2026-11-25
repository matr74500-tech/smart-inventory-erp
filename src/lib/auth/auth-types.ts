export type Role = "admin" | "storekeeper" | "cashier";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "مدير",
  storekeeper: "أمين مخزن",
  cashier: "بائع",
};

export type AuthState = {
  session: import("@supabase/supabase-js").Session | null;
  loading: boolean;
  username: string | null;
  roles: Role[];
  can: (...r: Role[]) => boolean;
  canPage: (key: string) => boolean;
  canAction: (key: string) => boolean;
  canField: (key: string) => boolean;
  signOut: (wipeLocalData?: boolean) => Promise<void>;
};
