import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { applyUiThemeToDom, type UiThemeSetting } from "@/lib/uiTheme";

export { type UiThemeSetting, applyUiThemeToDom } from "@/lib/uiTheme";

export function useUiTheme() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [setting, setSetting] = useState<UiThemeSetting | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setSetting(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("ui_theme_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("load ui_theme_settings", error.message);
    }
    const next = (data as UiThemeSetting | null) ?? null;
    setSetting(next);
    if (next) applyUiThemeToDom(next);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`ui-theme-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ui_theme_settings" },
        () => void load(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [userId, load]);

  useEffect(() => {
    if (!setting) return;
    applyUiThemeToDom(setting);
  }, [setting]);

  return { setting, loading, reload: load };
}
