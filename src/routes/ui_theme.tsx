import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Palette, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/ui_theme")({
  head: () => ({
    meta: [
      { title: "التخصيص والشكل | نظام المخزون الذكي" },
      {
        name: "description",
        content: "تخصيص سمة الواجهة، الألوان، الخط، اللغة، والإشعارات للمستخدم الحالي.",
      },
    ],
  }),
  component: UiThemePage,
});

type UiThemeSetting = Tables<"ui_theme_settings">;

const THEME_MODES: { value: string; label: string }[] = [
  { value: "light", label: "فاتح" },
  { value: "dark", label: "داكن" },
  { value: "system", label: "نظام الجهاز" },
];

const FONT_SIZES: { value: string; label: string }[] = [
  { value: "small", label: "صغير" },
  { value: "medium", label: "متوسط" },
  { value: "large", label: "كبير" },
];

const LANGUAGES: { value: string; label: string }[] = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "الإنجليزية" },
];

const NOTIFICATION_IMPORTANCE: { value: string; label: string }[] = [
  { value: "low", label: "منخفضة" },
  { value: "normal", label: "عادية" },
  { value: "high", label: "عالية" },
  { value: "critical", label: "حرجة" },
];

function UiThemePage() {
  const { canAction } = useAuth();
  const [setting, setSetting] = useState<UiThemeSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const { data, error } = await supabase
      .from("ui_theme_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (!error) setSetting(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    const channel = supabase
      .channel("ui-theme-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ui_theme_settings" },
        () => void loadData(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [loadData]);

  async function saveSetting() {
    if (!setting || !canAction("settings.manage")) {
      toast.error("ليس لديك صلاحية إدارة الإعدادات");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_ui_theme_settings", {
        _theme_mode: setting.theme_mode,
        _primary_color: setting.primary_color,
        _secondary_color: setting.secondary_color,
        _accent_color: setting.accent_color,
        _font_family: setting.font_family,
        _font_size: setting.font_size,
        _language: setting.language,
        _rtl_layout: setting.rtl_layout,
        _compact_mode: setting.compact_mode,
        _show_avatars: setting.show_avatars,
        _show_animations: setting.show_animations,
        _notification_enabled: setting.notification_enabled,
        _notification_importance: setting.notification_importance,
        _notification_sound: setting.notification_sound,
        _notification_vibrate: setting.notification_vibrate,
      });
      if (error) throw error;
      toast.success("تم حفظ إعدادات التخصيص");
      void loadData();
    } catch (error) {
      toast.error(`تعذر الحفظ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !setting) {
    return (
      <AppShell title="التخصيص والشكل" roles={["storekeeper"]}>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="التخصيص والشكل" roles={["storekeeper"]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">التخصيص والشكل</h2>
            <p className="text-sm text-muted-foreground">
              تخصيص سمة الواجهة، الألوان، الخط، اللغة، والإشعارات لحسابك الحالي.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveSetting();
          }}
          className="rounded-xl bg-card p-6 shadow-card space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>وضع السمة</Label>
              <Select
                value={setting.theme_mode}
                onValueChange={(v) => setSetting({ ...setting, theme_mode: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THEME_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label>اللون الأساسي</label>
              <Input
                type="color"
                value={setting.primary_color}
                onChange={(e) => setSetting({ ...setting, primary_color: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label>اللون الثانوي</label>
              <Input
                type="color"
                value={setting.secondary_color}
                onChange={(e) => setSetting({ ...setting, secondary_color: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label>لون التمييز</label>
              <Input
                type="color"
                value={setting.accent_color}
                onChange={(e) => setSetting({ ...setting, accent_color: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>نوع الخط</Label>
              <Select
                value={setting.font_family}
                onValueChange={(v) => setSetting({ ...setting, font_family: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tahoma">Tahoma</SelectItem>
                  <SelectItem value="Arial">Arial</SelectItem>
                  <SelectItem value="Cairo">Cairo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>حجم الخط</Label>
              <Select
                value={setting.font_size}
                onValueChange={(v) => setSetting({ ...setting, font_size: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>اللغة</Label>
              <Select
                value={setting.language}
                onValueChange={(v) => setSetting({ ...setting, language: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تخطيط من اليمين لليسار (RTL)</Label>
              <Checkbox
                checked={Boolean(setting.rtl_layout)}
                onCheckedChange={(v: boolean) => setSetting({ ...setting, rtl_layout: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>وضع مضغوط</Label>
              <Checkbox
                checked={Boolean(setting.compact_mode)}
                onCheckedChange={(v: boolean) => setSetting({ ...setting, compact_mode: v })}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold">الصورة الرمزية والحركة والإشعارات</h4>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(setting.show_avatars)}
                  onCheckedChange={(v: boolean) => setSetting({ ...setting, show_avatars: v })}
                />
                <span className="text-sm">إظهار الصور الرمزية</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(setting.show_animations)}
                  onCheckedChange={(v: boolean) => setSetting({ ...setting, show_animations: v })}
                />
                <span className="text-sm">إظهار الحركات</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(setting.notification_enabled)}
                  onCheckedChange={(v: boolean) =>
                    setSetting({ ...setting, notification_enabled: v })
                  }
                />
                <span className="text-sm">تفعيل الإشعارات</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(setting.notification_sound)}
                  onCheckedChange={(v: boolean) =>
                    setSetting({ ...setting, notification_sound: v })
                  }
                />
                <span className="text-sm">صوت الإشعار</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(setting.notification_vibrate)}
                  onCheckedChange={(v: boolean) =>
                    setSetting({ ...setting, notification_vibrate: v })
                  }
                />
                <span className="text-sm">اهتزاز الإشعار</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>أهمية الإشعارات</Label>
            <Select
              value={setting.notification_importance}
              onValueChange={(v) => setSetting({ ...setting, notification_importance: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTIFICATION_IMPORTANCE.map((n) => (
                  <SelectItem key={n.value} value={n.value}>
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={busy || !canAction("settings.manage")}>
              {busy ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Save className="size-4 mr-2" />
              )}
              حفظ الإعدادات
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
