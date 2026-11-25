import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Tags, Save, Loader2 } from "lucide-react";
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

export const Route = createFileRoute("/barcode_labels")({
  head: () => ({
    meta: [
      { title: "إعدادات ملصقات الباركود | نظام المخزون الذكي" },
      {
        name: "description",
        content:
          "تخصيص طباعة ملصقات الباركود (الاسم، السعر، الأبعاد، الحقول الظاهرة، نوع الطابعة).",
      },
    ],
  }),
  component: BarcodeLabelSettingsPage,
});

type BarcodeLabelSetting = Tables<"barcode_label_settings">;

const NAME_FIELDS: { value: string; label: string }[] = [
  { value: "name", label: "اسم الصنف" },
  { value: "code", label: "كود الصنف" },
  { value: "model_no", label: "رقم الموديل" },
];

const PRICE_SOURCES: { value: string; label: string }[] = [
  { value: "category", label: "سعر الفئة" },
  { value: "manual", label: "سعر مخصص" },
  { value: "none", label: "بدون سعر" },
];

const PRICE_CATEGORIES: { value: string; label: string }[] = [
  { value: "price_special", label: "سعر خاص" },
  { value: "price", label: "تجزئة" },
  { value: "price_half", label: "نصف جملة" },
  { value: "price_wholesale", label: "جملة" },
  { value: "price_bulk", label: "جملة الجملة" },
];

const PRINTER_TYPES: { value: string; label: string }[] = [
  { value: "thermal", label: "حرارية" },
  { value: "a4", label: "A4" },
  { value: "a5", label: "A5" },
  { value: "pos", label: "POS" },
  { value: "none", label: "بدون" },
];

function BarcodeLabelSettingsPage() {
  const { canAction } = useAuth();
  const [setting, setSetting] = useState<BarcodeLabelSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    const { data, error } = await supabase
      .from("barcode_label_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (!error) setSetting(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    const channel = supabase
      .channel("barcode-label-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "barcode_label_settings" },
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
      const { error } = await supabase.rpc("save_barcode_label_settings", {
        _shop_name: setting.shop_name,
        _product_name_field: setting.product_name_field,
        _price_source: setting.price_source,
        _price_category: setting.price_category || "",
        _custom_price: setting.custom_price || 0,
        _title: setting.title,
        _show_logo: setting.show_logo,
        _show_barcode_image: setting.show_barcode_image,
        _show_qr_code: setting.show_qr_code,
        _label_width_mm: setting.label_width_mm,
        _label_height_mm: setting.label_height_mm,
        _labels_per_page: setting.labels_per_page,
        _printer_type: setting.printer_type || "",
      });
      if (error) throw error;
      toast.success("تم حفظ إعدادات ملصقات الباركود");
      void loadData();
    } catch (error) {
      toast.error(`تعذر الحفظ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !setting) {
    return (
      <AppShell title="إعدادات ملصقات الباركود" roles={["storekeeper"]}>
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="إعدادات ملصقات الباركود" roles={["storekeeper"]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">إعدادات ملصقات الباركود</h2>
            <p className="text-sm text-muted-foreground">
              تخصيص طباعة ملصقات الباركود (الاسم المعروض، مصدر السعر، الأبعاد، الحقول الظاهرة، ونوع
              الطابعة).
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
              <Label>اسم المحل (يُطبع على الملصق)</Label>
              <Input
                value={setting.shop_name}
                onChange={(e) => setSetting({ ...setting, shop_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>حقل الاسم المعروض</Label>
              <Select
                value={setting.product_name_field}
                onValueChange={(v) => setSetting({ ...setting, product_name_field: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NAME_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>مصدر السعر</Label>
              <Select
                value={setting.price_source}
                onValueChange={(v) => setSetting({ ...setting, price_source: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>فئة السعر</Label>
              <Select
                value={setting.price_category ?? ""}
                onValueChange={(v) => setSetting({ ...setting, price_category: v || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر فئة السعر" />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>السعر المخصص</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={String(setting.custom_price ?? "")}
                onChange={(e) =>
                  setSetting({
                    ...setting,
                    custom_price: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>عنوان الملصق</Label>
              <Input
                value={setting.title}
                onChange={(e) => setSetting({ ...setting, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>عرض الملصق (مم)</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={String(setting.label_width_mm)}
                onChange={(e) => setSetting({ ...setting, label_width_mm: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>ارتفاع الملصق (مم)</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={String(setting.label_height_mm)}
                onChange={(e) =>
                  setSetting({ ...setting, label_height_mm: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>عدد الملصقات في الصفحة</Label>
              <Input
                type="number"
                step="1"
                min="1"
                max="100"
                value={String(setting.labels_per_page)}
                onChange={(e) =>
                  setSetting({ ...setting, labels_per_page: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>نوع الطابعة</Label>
              <Select
                value={setting.printer_type ?? ""}
                onValueChange={(v) => setSetting({ ...setting, printer_type: v || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر نوع الطابعة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">افتراضي</SelectItem>
                  {PRINTER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold">الحقول الظاهرة</h4>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(setting.show_logo)}
                  onCheckedChange={(v) => setSetting({ ...setting, show_logo: Boolean(v) })}
                />
                <span className="text-sm">الشعار</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(setting.show_barcode_image)}
                  onCheckedChange={(v) =>
                    setSetting({ ...setting, show_barcode_image: Boolean(v) })
                  }
                />
                <span className="text-sm">صورة الباركود</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(setting.show_qr_code)}
                  onCheckedChange={(v) => setSetting({ ...setting, show_qr_code: Boolean(v) })}
                />
                <span className="text-sm">رمز الاستجابة السريعة</span>
              </div>
            </div>
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
