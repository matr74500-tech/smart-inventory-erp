import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Share2, Save, Loader2 } from "lucide-react";
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

export const Route = createFileRoute("/share_settings")({
  head: () => ({
    meta: [
      { title: "إعدادات المشاركة | نظام المخزون الذكي" },
      {
        name: "description",
        content: "تخصيص مشاركة المستندات (الفواتير، الإيصالات، التقارير) تلقائياً أو يدوياً.",
      },
    ],
  }),
  component: ShareSettingsPage,
});

type ShareSetting = Tables<"share_settings">;

const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: "invoice", label: "فاتورة مبيعات" },
  { value: "receipt", label: "إيصال استلام" },
  { value: "voucher", label: "سند نقدي" },
  { value: "report", label: "تقرير" },
];

const SHARE_METHODS: { value: string; label: string }[] = [
  { value: "whatsapp", label: "واتساب" },
  { value: "sms", label: "رسالة نصية" },
  { value: "email", label: "بريد إلكتروني" },
  { value: "print", label: "طباعة" },
];

function ShareSettingsPage() {
  const { canAction } = useAuth();
  const [settings, setSettings] = useState<ShareSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const { data, error } = await supabase
      .from("share_settings")
      .select("*")
      .order("document_type");
    if (!error) setSettings(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    const channel = supabase
      .channel("share-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "share_settings" },
        () => void loadData(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [loadData]);

  async function saveSetting(s: ShareSetting) {
    if (!canAction("settings.manage")) {
      toast.error("ليس لديك صلاحية إدارة الإعدادات");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_share_settings", {
        _document_type: s.document_type,
        _auto_share: s.auto_share,
        _share_methods: s.share_methods ?? [],
        _default_message: s.default_message || null,
        _require_confirmation: s.require_confirmation,
      });
      if (error) throw error;
      toast.success(`تم حفظ إعدادات مشاركة ${s.document_type}`);
      void loadData();
    } catch (error) {
      toast.error(`تعذر الحفظ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="إعدادات المشاركة" roles={["storekeeper"]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">إعدادات المشاركة</h2>
            <p className="text-sm text-muted-foreground">
              تخصيص مشاركة المستندات تلقائياً أو يدوياً، وطرق المشاركة الافتراضية لكل نوع مستند.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-xl bg-card p-6 shadow-card space-y-4">
            <div className="table-wrapper overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pb-3 font-medium">نوع المستند</th>
                    <th className="pb-3 font-medium">مشاركة تلقائية</th>
                    <th className="pb-3 font-medium">طرق المشاركة</th>
                    <th className="pb-3 font-medium">رسالة افتراضية</th>
                    <th className="pb-3 font-medium">تأكيد قبل الإرسال</th>
                    <th className="pb-3 font-medium text-right">الحفظ</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.map((s) => {
                    const methods = (s.share_methods as string[] | undefined) ?? [];
                    const methodsLabel =
                      methods.length > 0
                        ? methods
                            .map((m) => SHARE_METHODS.find((sm) => sm.value === m)?.label ?? m)
                            .join("، ")
                        : "—";
                    return (
                      <tr key={s.document_type} className="border-b last:border-0">
                        <td className="py-3 font-medium">
                          {DOCUMENT_TYPES.find((d) => d.value === s.document_type)?.label ??
                            s.document_type}
                        </td>
                        <td className="py-3">
                          <Checkbox
                            checked={Boolean(s.auto_share)}
                            onCheckedChange={(v: boolean) =>
                              void saveSetting({ ...s, auto_share: v })
                            }
                          />
                        </td>
                        <td className="py-3">{methodsLabel}</td>
                        <td className="py-3">
                          <Input
                            value={s.default_message || ""}
                            onChange={(e) =>
                              void saveSetting({
                                ...s,
                                default_message: e.target.value || null,
                              })
                            }
                            placeholder="رسالة افتراضية"
                          />
                        </td>
                        <td className="py-3">
                          <Checkbox
                            checked={Boolean(s.require_confirmation)}
                            onCheckedChange={(v: boolean) =>
                              void saveSetting({ ...s, require_confirmation: v })
                            }
                          />
                        </td>
                        <td className="py-3 text-right">
                          <Button
                            size="sm"
                            onClick={() => void saveSetting(s)}
                            disabled={busy || !canAction("settings.manage")}
                          >
                            حفظ
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
