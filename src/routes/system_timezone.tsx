import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Save, Loader2 } from "lucide-react";
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

export const Route = createFileRoute("/system_timezone")({
  head: () => ({
    meta: [
      { title: "التوقيت الزمني للنظام | نظام المخزون الذكي" },
      {
        name: "description",
        content: "تحديد التوقيت الزمني والنظام (24/12 ساعة) وتنسيق التاريخ والوقت للنظام.",
      },
    ],
  }),
  component: SystemTimezonePage,
});

type SystemTimezone = Tables<"system_timezone">;

const TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Aden", label: "عدن (توقيت اليمن UTC+3)" },
  { value: "Asia/Riyadh", label: "الرياض (UTC+3)" },
  { value: "UTC", label: "UTC (التوقيت العالمي)" },
  { value: "Asia/Dubai", label: "دبي (UTC+4)" },
  { value: "Europe/London", label: "لندن (UTC+0/1)" },
];

const DATE_FORMATS: { value: string; label: string }[] = [
  { value: "DD/MM/YYYY", label: "يوم/شهر/سنة" },
  { value: "MM/DD/YYYY", label: "شهر/يوم/سنة" },
  { value: "YYYY-MM-DD", label: "سنة-شهر-يوم" },
];

const TIME_FORMATS: { value: string; label: string }[] = [
  { value: "24h", label: "24 ساعة" },
  { value: "12h", label: "12 ساعة" },
];

function SystemTimezonePage() {
  const { canAction } = useAuth();
  const [setting, setSetting] = useState<SystemTimezone | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const { data, error } = await supabase
      .from("system_timezone")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (!error) setSetting(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    const channel = supabase
      .channel("system-timezone")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_timezone" },
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
      const { error } = await supabase.rpc("save_system_timezone", {
        _id: setting.id,
        _timezone: setting.timezone,
        _auto_detect: setting.auto_detect,
        _use_24h_format: setting.use_24h_format,
        _date_format: setting.date_format,
        _time_format: setting.time_format,
      });
      if (error) throw error;
      toast.success("تم حفظ إعدادات التوقيت الزمني");
      void loadData();
    } catch (error) {
      toast.error(`تعذر الحفظ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !setting) {
    return (
      <AppShell title="التوقيت الزمني للنظام" roles={["storekeeper"]}>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="التوقيت الزمني للنظام" roles={["storekeeper"]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">التوقيت الزمني للنظام</h2>
            <p className="text-sm text-muted-foreground">
              تحديد التوقيت الزمني ونظام الساعات (24/12) وتنسيق التاريخ والوقت المستخدم في النظام.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveSetting();
          }}
          className="rounded-xl bg-card p-6 shadow-card space-y-4 max-w-xl"
        >
          <div className="space-y-2">
            <Label>التوقيت الزمني</Label>
            <Select
              value={setting.timezone}
              onValueChange={(v) => setSetting({ ...setting, timezone: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Checkbox
              checked={Boolean(setting.auto_detect)}
              onCheckedChange={(v: boolean) => setSetting({ ...setting, auto_detect: v })}
            />
            <span className="text-sm">اكتشاف الموقع تلقائياً</span>
          </div>

          <div className="space-y-1">
            <Checkbox
              checked={Boolean(setting.use_24h_format)}
              onCheckedChange={(v: boolean) => setSetting({ ...setting, use_24h_format: v })}
            />
            <span className="text-sm">استخدام نظام 24 ساعة</span>
          </div>

          <div className="space-y-2">
            <Label>تنسيق التاريخ</Label>
            <Select
              value={setting.date_format}
              onValueChange={(v) => setSetting({ ...setting, date_format: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>تنسيق الوقت</Label>
            <Select
              value={setting.time_format}
              onValueChange={(v) => setSetting({ ...setting, time_format: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
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
