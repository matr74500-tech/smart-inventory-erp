import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShoppingCart, Printer, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/hooks/use-inventory";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/sales_settings")({
  head: () => ({
    meta: [
      { title: "إعدادات المبيعات والطباعة | نظام المخزون الذكي" },
      {
        name: "description",
        content:
          "إعدادات المبيعات الافتراضية لنقطة البيع وفاتورة المبيعات، وتخصيص طباعة السندات والفواتير.",
      },
    ],
  }),
  component: SalesSettingsPage,
});

type SalesDefault = Tables<"sales_defaults">;
type PrintSetting = Tables<"print_settings">;

type SalesDefaultsForm = {
  default_tier: string;
  default_currency_code: string;
  default_payment_method: string;
  default_discount: string;
  default_tax: string;
  auto_print_receipt: boolean;
  print_printer_type: string;
};

const PAGE_TYPES: { value: string; label: string }[] = [
  { value: "quick_sales", label: "المبيعات السريعة (POS)" },
  { value: "sales_invoice", label: "فاتورة المبيعات" },
];

const PRICE_TIERS: { value: string; label: string }[] = [
  { value: "price_special", label: "سعر خاص" },
  { value: "price", label: "تجزئة" },
  { value: "price_half", label: "نصف جملة" },
  { value: "price_wholesale", label: "جملة" },
  { value: "price_bulk", label: "جملة الجملة" },
];

const PAYMENT_METHODS = ["نقدي YER", "سعودي SAR", "تحويلات شبكات محلية", "آجل"];
const PRINTER_TYPES = ["thermal", "a4", "a5", "pos", "none"];
const PAPER_SIZES = ["a4", "a5", "receipt_80", "receipt_58", "pos_58", "custom"];
const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: "invoice", label: "فاتورة مبيعات" },
  { value: "receipt", label: "إيصال استلام" },
  { value: "voucher", label: "سند نقدي" },
  { value: "label", label: "ملصق باركود" },
  { value: "report", label: "تقرير" },
];

function labelForSize(value: string) {
  switch (value) {
    case "a4":
      return "A4";
    case "a5":
      return "A5";
    case "receipt_80":
      return "إيصال 80 مم";
    case "receipt_58":
      return "إيصال 58 مم";
    case "pos_58":
      return "POS 58 مم";
    default:
      return "مخصص";
  }
}

function labelForPrinter(value: string) {
  switch (value) {
    case "thermal":
      return "حرارية";
    case "a4":
      return "A4";
    case "a5":
      return "A5";
    case "pos":
      return "POS";
    case "network":
      return "شبكة";
    default:
      return "بدون";
  }
}

function SalesSettingsPage() {
  const { canAction } = useAuth();
  const { currencies } = useInventory();
  const activeCurrencies = currencies.filter((c) => c.active);

  const [salesDefaults, setSalesDefaults] = useState<SalesDefault[]>([]);
  const [printSettings, setPrintSettings] = useState<PrintSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("sales");

  const [formData, setFormData] = useState<Record<string, SalesDefaultsForm>>({});

  const loadData = useCallback(async () => {
    const [sdResult, psResult] = await Promise.all([
      supabase.from("sales_defaults").select("*"),
      supabase.from("print_settings").select("*"),
    ]);
    if (!sdResult.error) setSalesDefaults(sdResult.data ?? []);
    if (!psResult.error) setPrintSettings(psResult.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    const channels = [
      supabase
        .channel("sales-defaults")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sales_defaults" },
          () => void loadData(),
        )
        .subscribe(),
      supabase
        .channel("print-settings")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "print_settings" },
          () => void loadData(),
        )
        .subscribe(),
    ];
    return () => {
      channels.forEach((ch) => void supabase.removeChannel(ch));
    };
  }, [loadData]);

  const getDefault = (pageType: string) => salesDefaults.find((d) => d.page_type === pageType);

  const getPrintSetting = (docType: string) =>
    printSettings.find((p) => p.document_type === docType);

  useEffect(() => {
    PAGE_TYPES.forEach((pt) => {
      const d = getDefault(pt.value);
      if (d && !formData[pt.value]) {
        setFormData((prev) => ({
          ...prev,
          [pt.value]: {
            default_tier: d.default_tier,
            default_currency_code: d.default_currency_code,
            default_payment_method: d.default_payment_method,
            default_discount: String(d.default_discount),
            default_tax: String(d.default_tax),
            auto_print_receipt: d.auto_print_receipt,
            print_printer_type: d.print_printer_type ?? "",
          },
        }));
      }
    });
  }, [salesDefaults, formData]);

  async function saveSalesDefaults(pageType: string) {
    if (!canAction("settings.manage")) {
      toast.error("ليس لديك صلاحية إدارة الإعدادات");
      return;
    }
    const data = formData[pageType];
    if (!data) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_sales_defaults", {
        _page_type: pageType,
        _default_tier: data.default_tier,
        _default_currency_code: data.default_currency_code,
        _default_payment_method: data.default_payment_method,
        _default_discount: Number(data.default_discount),
        _default_tax: Number(data.default_tax),
        _auto_print_receipt: data.auto_print_receipt,
        _print_printer_type: data.print_printer_type || null,
      });
      if (error) throw error;
      toast.success(`تم حفظ إعدادات المبيعات لصفحة ${pageType}`);
      void loadData();
    } catch (error) {
      toast.error(`تعذر حفظ الإعدادات: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function savePrintSetting(docType: string) {
    if (!canAction("settings.manage")) {
      toast.error("ليس لديك صلاحية إدارة الإعدادات");
      return;
    }
    const p = getPrintSetting(docType);
    if (!p) return;

    setBusy(true);
    try {
      const { error } = await supabase.rpc("save_print_settings", {
        _document_type: docType,
        _paper_size: p.paper_size,
        _orientation: p.orientation,
        _margin_top: p.margin_top,
        _margin_bottom: p.margin_bottom,
        _margin_left: p.margin_left,
        _margin_right: p.margin_right,
        _font_family: p.font_family,
        _font_size: p.font_size,
        _primary_color: p.primary_color,
        _secondary_color: p.secondary_color,
        _accent_color: p.accent_color,
        _show_logo: p.show_logo,
        _show_shop_name: p.show_shop_name,
        _show_shop_address: p.show_shop_address,
        _show_shop_phone: p.show_shop_phone,
        _show_customer_info: p.show_customer_info,
        _show_items_table: p.show_items_table,
        _show_totals: p.show_totals,
        _show_tax: p.show_tax,
        _show_discount: p.show_discount,
        _show_payment_method: p.show_payment_method,
        _show_date_time: p.show_date_time,
        _show_qr_code: p.show_qr_code,
        _show_barcode: p.show_barcode,
        _show_footer: p.show_footer,
        _footer_text: p.footer_text,
        _printer_type: p.printer_type,
        _copies: p.copies,
      });
      if (error) throw error;
      toast.success(`تم حفظ إعدادات طباعة ${docType}`);
      void loadData();
    } catch (error) {
      toast.error(
        `تعذر حفظ إعدادات الطباعة: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  const updateFormField = useCallback(
    (
      pageType: string,
      key: keyof SalesDefaultsForm,
      value: SalesDefaultsForm[keyof SalesDefaultsForm],
    ) => {
      setFormData((prev) => ({
        ...prev,
        [pageType]: { ...prev[pageType], [key]: value },
      }));
    },
    [],
  );

  const updatePrintField = useCallback(
    (docType: string, key: keyof PrintSetting, value: string | number | boolean | null) => {
      setPrintSettings((prev) =>
        prev.map((s) => (s.document_type === docType ? { ...s, [key]: value } : s)),
      );
    },
    [],
  );

  return (
    <AppShell title="إعدادات المبيعات والطباعة" roles={["storekeeper"]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">إعدادات المبيعات والطباعة</h2>
            <p className="text-sm text-muted-foreground">
              فصل إعدادات المبيعات الافتراضية بين نقطة البيع وفاتورة المبيعات، وتخصيص طباعة السندات
              والفواتير (الحجم، الخط، الألوان، الحقول الظاهرة، ونوع الطابعة).
            </p>
          </div>
        </div>

        <Tabs defaultValue="sales" onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex-wrap">
            <TabsTrigger value="sales">
              <ShoppingCart className="size-4 mr-2" /> إعدادات المبيعات الافتراضية
            </TabsTrigger>
            <TabsTrigger value="print">
              <Printer className="size-4 mr-2" /> إعدادات الطباعة
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales">
            <div className="mt-4 space-y-4">
              {PAGE_TYPES.map((pt) => {
                const d = getDefault(pt.value);
                const fd = formData[pt.value] || {
                  default_tier: d?.default_tier ?? "price",
                  default_currency_code: d?.default_currency_code ?? "YER",
                  default_payment_method: d?.default_payment_method ?? "نقدي YER",
                  default_discount: d?.default_discount?.toString() ?? "0",
                  default_tax: d?.default_tax?.toString() ?? "0",
                  auto_print_receipt: d?.auto_print_receipt ?? false,
                  print_printer_type: d?.print_printer_type ?? "",
                };
                return (
                  <div key={pt.value} className="rounded-xl bg-card p-5 shadow-card space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{pt.label}</h3>
                        <p className="text-sm text-muted-foreground">
                          الإعدادات الافتراضية التي تُطبق تلقائياً عند فتح هذه الصفحة.
                        </p>
                      </div>
                      <Button
                        onClick={() => void saveSalesDefaults(pt.value)}
                        disabled={busy || !canAction("settings.manage")}
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )}
                        حفظ الإعدادات
                      </Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>السعر الافتراضي</Label>
                        <Select
                          value={fd.default_tier}
                          onValueChange={(v) => updateFormField(pt.value, "default_tier", v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRICE_TIERS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>العملة الافتراضية</Label>
                        <Select
                          value={fd.default_currency_code}
                          onValueChange={(v) =>
                            updateFormField(pt.value, "default_currency_code", v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {activeCurrencies.map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {c.name} ({c.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>طريقة الدفع الافتراضية</Label>
                        <Select
                          value={fd.default_payment_method}
                          onValueChange={(v) =>
                            updateFormField(pt.value, "default_payment_method", v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>الخصم الافتراضي (%)</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={fd.default_discount}
                          onChange={(e) =>
                            updateFormField(pt.value, "default_discount", e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>الضريبة الافتراضية (%)</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={fd.default_tax}
                          onChange={(e) => updateFormField(pt.value, "default_tax", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>طباعة الإيصال تلقائياً</Label>
                        <Checkbox
                          checked={fd.auto_print_receipt}
                          onCheckedChange={(v) =>
                            updateFormField(pt.value, "auto_print_receipt", v)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>نوع الطابعة</Label>
                        <Select
                          value={fd.print_printer_type}
                          onValueChange={(v) => updateFormField(pt.value, "print_printer_type", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="اختر نوع الطابعة" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">افتراضي</SelectItem>
                            {PRINTER_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {labelForPrinter(t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-3 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                      <p>
                        {pt.value === "quick_sales"
                          ? "هذه الإعدادات تُطبّق على صفحة المبيعات السريعة (نقطة البيع)."
                          : "هذه الإعدادات تُطبّق على صفحة فاتورة المبيعات التفصيلية."}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="print">
            <div className="mt-4 space-y-4">
              {DOCUMENT_TYPES.map((dt) => {
                const p = getPrintSetting(dt.value);
                if (!p) return null;
                return (
                  <div key={dt.value} className="rounded-xl bg-card p-5 shadow-card space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{dt.label}</h3>
                        <p className="text-sm text-muted-foreground">
                          تخصيص طباعة {dt.label} (الحجم، الاتجاه، الهوامش، الخط، الألوان، الحقول
                          الظاهرة، الطابعة).
                        </p>
                      </div>
                      <Button
                        onClick={() => void savePrintSetting(dt.value)}
                        disabled={busy || !canAction("settings.manage")}
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )}
                        حفظ الإعدادات
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>حجم الورق</Label>
                        <Select
                          value={p.paper_size}
                          onValueChange={(v) => updatePrintField(dt.value, "paper_size", v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAPER_SIZES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {labelForSize(s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>اتجاه الورق</Label>
                        <Select
                          value={p.orientation}
                          onValueChange={(v) => updatePrintField(dt.value, "orientation", v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="portrait">عمودي</SelectItem>
                            <SelectItem value="landscape">أفقي</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label>نوع الطابعة</label>
                        <Select
                          value={p.printer_type ?? ""}
                          onValueChange={(v) =>
                            updatePrintField(dt.value, "printer_type", v || null)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">افتراضي</SelectItem>
                            {PRINTER_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {labelForPrinter(t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>حجم الخط</Label>
                        <Input
                          type="number"
                          step="1"
                          min="8"
                          max="72"
                          value={String(p.font_size)}
                          onChange={(e) =>
                            updatePrintField(dt.value, "font_size", Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>نوع الخط</Label>
                        <Select
                          value={p.font_family}
                          onValueChange={(v) => updatePrintField(dt.value, "font_family", v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Tahoma">Tahoma</SelectItem>
                            <SelectItem value="Arial">Arial</SelectItem>
                            <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                            <SelectItem value="Cairo">Cairo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>عدد النسخ</Label>
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          max="10"
                          value={String(p.copies)}
                          onChange={(e) =>
                            updatePrintField(dt.value, "copies", Number(e.target.value))
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-semibold">الألوان</h4>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label>اللون الأساسي</Label>
                          <Input
                            type="color"
                            value={p.primary_color}
                            onChange={(e) =>
                              updatePrintField(dt.value, "primary_color", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>اللون الثانوي</Label>
                          <Input
                            type="color"
                            value={p.secondary_color}
                            onChange={(e) =>
                              updatePrintField(dt.value, "secondary_color", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>لون التمييز</Label>
                          <Input
                            type="color"
                            value={p.accent_color}
                            onChange={(e) =>
                              updatePrintField(dt.value, "accent_color", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-semibold">الحقول الظاهرة</h4>
                      <div className="grid gap-2 md:grid-cols-4">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_logo}
                            onCheckedChange={(v) => updatePrintField(dt.value, "show_logo", v)}
                          />
                          <span className="text-sm">الشعار</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_shop_name}
                            onCheckedChange={(v) => updatePrintField(dt.value, "show_shop_name", v)}
                          />
                          <span className="text-sm">اسم المحل</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_shop_address}
                            onCheckedChange={(v) =>
                              updatePrintField(dt.value, "show_shop_address", v)
                            }
                          />
                          <span className="text-sm">عنوان المحل</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_shop_phone}
                            onCheckedChange={(v) =>
                              updatePrintField(dt.value, "show_shop_phone", v)
                            }
                          />
                          <span className="text-sm">هاتف المحل</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_customer_info}
                            onCheckedChange={(v) =>
                              updatePrintField(dt.value, "show_customer_info", v)
                            }
                          />
                          <span className="text-sm">معلومات العميل</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_items_table}
                            onCheckedChange={(v) =>
                              updatePrintField(dt.value, "show_items_table", v)
                            }
                          />
                          <span className="text-sm">جدول الأصناف</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_totals}
                            onCheckedChange={(v) => updatePrintField(dt.value, "show_totals", v)}
                          />
                          <span className="text-sm">المجموع</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_tax}
                            onCheckedChange={(v) => updatePrintField(dt.value, "show_tax", v)}
                          />
                          <span className="text-sm">الضريبة</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_discount}
                            onCheckedChange={(v) => updatePrintField(dt.value, "show_discount", v)}
                          />
                          <span className="text-sm">الخصم</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_payment_method}
                            onCheckedChange={(v) =>
                              updatePrintField(dt.value, "show_payment_method", v)
                            }
                          />
                          <span className="text-sm">طريقة الدفع</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_date_time}
                            onCheckedChange={(v) => updatePrintField(dt.value, "show_date_time", v)}
                          />
                          <span className="text-sm">التاريخ والوقت</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_qr_code}
                            onCheckedChange={(v) => updatePrintField(dt.value, "show_qr_code", v)}
                          />
                          <span className="text-sm">رمز الاستجابة السريعة</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_barcode}
                            onCheckedChange={(v) => updatePrintField(dt.value, "show_barcode", v)}
                          />
                          <span className="text-sm">الباركود</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={p.show_footer}
                            onCheckedChange={(v) => updatePrintField(dt.value, "show_footer", v)}
                          />
                          <span className="text-sm">التذييل</span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>نص التذييل</Label>
                        <Input
                          value={p.footer_text ?? ""}
                          onChange={(e) =>
                            updatePrintField(dt.value, "footer_text", e.target.value || null)
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
