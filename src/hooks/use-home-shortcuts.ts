import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Tables } from "@/integrations/supabase/types";

export type HomeShortcutRow = Tables<"home_shortcuts">;

export function useHomeShortcuts() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [shortcuts, setShortcuts] = useState<HomeShortcutRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setShortcuts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("home_shortcuts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_visible", true)
      .order("sort_order");
    if (error) {
      console.error("load home_shortcuts", error.message);
    }
    setShortcuts(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`home-shortcuts-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "home_shortcuts",
          filter: `user_id=eq.${userId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [userId, load]);

  return { shortcuts, loading, reload: load };
}
