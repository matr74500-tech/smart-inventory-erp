import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Save, Loader2 } from "lucide-react";
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

export const Route = createFileRoute("/scanner_settings")({
  head: () => ({
    meta: [
      { title: "إعدادات ماسح الباركود | نظام المخزون الذكي" },
      {
        name: "description",
        content: "تكوين سلوك ماسح الباركود لكل صفحة (المنتج، الإضافة للسلة، البحث، فتح صفحة، إلخ).",
      },
    ],
  }),
  component: ScannerSettingsPage,
});

type ScannerSetting = Tables<"scanner_settings">;

const SCANNER_ACTIONS: { value: string; label: string }[] = [
  { value: "find_product", label: "البحث عن منتج" },
  { value: "add_to_cart", label: "إضافة إلى سلة المشتريات" },
  { value: "search_invoice", label: "البحث في فاتورة" },
  { value: "add_expense", label: "إضافة مصروف" },
  { value: "add_stock_adjustment", label: "إضافة تعديل مخزون" },
  { value: "open_page", label: "فتح صفحة" },
  { value: "none", label: "تعطيل المسح" },
];

const SCANNER_PAGES: { value: string; label: string }[] = [
  { value: "/sales", label: "صفحة المبيعات" },
  { value: "/purchases", label: "صفحة المشتريات" },
  { value: "/stocktake", label: "صفحة الجرد" },
  { value: "/inventory", label: "صفحة الأصناف" },
  { value: "/expenses", label: "صفحة المصروفات" },
  { value: "/returns", label: "صفحة المرتجعات" },
];

function actionLabelFor(value: string) {
  return SCANNER_ACTIONS.find((a) => a.value === value)?.label ?? value;
}

function ScannerSettingsPage() {
  const { canAction } = useAuth();
  const [settings, setSettings] = useState<ScannerSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const { data, error } = await supabase.from("scanner_settings").select("*").order("page_path");
    if (!error) setSettings(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    const channel = supabase
      .channel("scanner-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scanner_settings" },
        () => void loadData(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [loadData]);

  async function saveSetting(s: ScannerSetting) {
    if (!canAction("settings.manage")) {
      toast.error("ليس لديك صلاحية إدارة الإعدادات");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_scanner_settings", {
        _page_path: s.page_path,
        _scanner_action: s.scanner_action,
        _target_page: s.target_page || null,
        _auto_execute: s.auto_execute,
        _beep_on_scan: s.beep_on_scan,
        _vibrate_on_scan: s.vibrate_on_scan,
      });
      if (error) throw error;
      toast.success(`تم حفظ إعدادات الماسح لصفحة ${s.page_path}`);
      void loadData();
    } catch (error) {
      toast.error(`تعذر الحفظ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="إعدادات ماسح الباركود" roles={["storekeeper"]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">إعدادات ماسح الباركود</h2>
            <p className="text-sm text-muted-foreground">
              حدد إجراء الماسح الافتراضي لكل صفحة، وما إذا كان يُنفَّذ تلقائياً بعد المسح، مع تفعيل
              التنبيه الصوتي والاهتزاز.
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
                    <th className="pb-3 font-medium">الصفحة</th>
                    <th className="pb-3 font-medium">إجراء الماسح</th>
                    <th className="pb-3 font-medium">الصفحة المستهدفة</th>
                    <th className="pb-3 font-medium">تنفيذ تلقائي</th>
                    <th className="pb-3 font-medium">تنبيه صوتي</th>
                    <th className="pb-3 font-medium">اهتزاز</th>
                    <th className="pb-3 font-medium text-right">الحفظ</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.map((s) => (
                    <tr key={s.page_path} className="border-b last:border-0">
                      <td className="py-3 font-medium">{s.page_path}</td>
                      <td className="py-3">{actionLabelFor(s.scanner_action)}</td>
                      <td className="py-3">
                        {s.target_page ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-3">
                        <Checkbox
                          checked={Boolean(s.auto_execute)}
                          onCheckedChange={(v: boolean) =>
                            void saveSetting({ ...s, auto_execute: v })
                          }
                        />
                      </td>
                      <td className="py-3">
                        <Checkbox
                          checked={Boolean(s.beep_on_scan)}
                          onCheckedChange={(v: boolean) =>
                            void saveSetting({ ...s, beep_on_scan: v })
                          }
                        />
                      </td>
                      <td className="py-3">
                        <Checkbox
                          checked={Boolean(s.vibrate_on_scan)}
                          onCheckedChange={(v: boolean) =>
                            void saveSetting({ ...s, vibrate_on_scan: v })
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
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
              <p>
                يُستخدم ماسح الباركود في صفحات{mappedPagesLabel()}. اختر الإجراء الذي يتم تنفيذه عند
                مسح باركود في كل صفحة.
              </p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );

  function mappedPagesLabel() {
    return SCANNER_PAGES.map((p) => p.label).join("، ");
  }
}
