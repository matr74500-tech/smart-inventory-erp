import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Tables } from "@/integrations/supabase/types";

export type UiThemeSetting = Tables<"ui_theme_settings">;

const FONT_MAP: Record<string, string> = {
  Tahoma: 'Tahoma, "Segoe UI", sans-serif',
  Arial: 'Arial, "Helvetica Neue", sans-serif',
  Cairo: '"Cairo", "Tajawal", system-ui, sans-serif',
};

const FONT_SIZE_MAP: Record<string, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

export function applyUiThemeToDom(s: UiThemeSetting) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  const mode = s.theme_mode;
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = mode === "dark" || (mode === "system" && prefersDark);
  root.classList.toggle("dark", isDark);

  root.lang = s.language || "ar";
  root.dir = s.rtl_layout ? "rtl" : "ltr";

  const fontFamily = FONT_MAP[s.font_family] ?? FONT_MAP["Tahoma"];
  root.style.setProperty("--font-sans", fontFamily);
  const displayFont =
    s.font_family === "Cairo" ? '"Cairo", "Tajawal", system-ui, sans-serif' : fontFamily;
  root.style.setProperty("--font-display", displayFont);

  const fs = FONT_SIZE_MAP[s.font_size] ?? FONT_SIZE_MAP["medium"];
  root.style.fontSize = fs;

  root.dataset["compact"] = s.compact_mode ? "true" : "false";
  if (s.compact_mode) {
    root.style.setProperty("--radius", "0.5rem");
  } else {
    root.style.removeProperty("--radius");
  }

  root.dataset["showAvatars"] = s.show_avatars ? "true" : "false";
  root.dataset["showAnimations"] = s.show_animations ? "true" : "false";
  if (!s.show_animations) {
    root.classList.add("reduce-motion");
  } else {
    root.classList.remove("reduce-motion");
  }
}

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
    const next = data ?? null;
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
