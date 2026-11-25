import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Save, Trash2, Loader2, Move } from "lucide-react";
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

export const Route = createFileRoute("/home_shortcuts")({
  head: () => ({
    meta: [
      { title: "اختصارات الصفحة الرئيسية | نظام المخزون الذكي" },
      {
        name: "description",
        content: "إدارة اختصارات الصفحات المفضلة في الشاشة الرئيسية للمستخدم الحالي.",
      },
    ],
  }),
  component: HomeShortcutsPage,
});

type HomeShortcut = Tables<"home_shortcuts">;

const SHORTCUT_PAGES: { value: string; label: string }[] = [
  { value: "/sales", label: "المبيعات" },
  { value: "/inventory", label: "الأصناف والمخزون" },
  { value: "/purchases", label: "فاتورة مشتريات" },
  { value: "/customers", label: "العملاء" },
  { value: "/cash", label: "الصندوق والإقفال" },
  { value: "/expenses", label: "المصروفات العامة" },
  { value: "/returns", label: "المرتجعات والمردودات" },
  { value: "/reports", label: "التقارير" },
  { value: "/settings", label: "الإعدادات" },
  { value: "/labels", label: "ملصقات الباركود" },
];

const SHORTCUT_ICONS: { value: string; label: string }[] = [
  { value: "ShoppingCart", label: "عربة تسوق" },
  { value: "Boxes", label: "صناديق" },
  { value: "Users", label: "مستخدمون" },
  { value: "Wallet", label: "محفظة" },
  { value: "CreditCard", label: "بطاقة ائتمان" },
  { value: "FileText", label: "نص ملف" },
  { value: "Tags", label: "علامات" },
  { value: "Barcode", label: "باركود" },
  { value: "Bell", label: "جرس" },
  { value: "Settings", label: "إعدادات" },
];

function HomeShortcutsPage() {
  const { session, canAction } = useAuth();
  const userId = session?.user.id;
  const [shortcuts, setShortcuts] = useState<HomeShortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Partial<HomeShortcut>>({});

  const loadData = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("home_shortcuts")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order");
    if (!error) setShortcuts(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadData();
    const channel = supabase
      .channel("home-shortcuts")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "home_shortcuts",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadData(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [loadData, userId]);

  async function saveShortcut() {
    if (!userId || !canAction("settings.manage")) {
      toast.error("ليس لديك صلاحية إدارة الإعدادات");
      return;
    }
    setBusy(true);
    try {
      if (draft.id) {
        const { error } = await supabase.rpc("update_home_shortcut", {
          _id: draft.id,
          _page_path: draft.page_path || "",
          _label: draft.label || "",
          _icon: draft.icon || "",
          _sort_order: draft.sort_order || 0,
          _is_visible: draft.is_visible ?? true,
        });
        if (error) throw error;
        toast.success("تم تعديل الاختصار");
      } else {
        const { error } = await supabase.rpc("add_home_shortcut", {
          _user_id: userId,
          _page_path: draft.page_path || "",
          _label: draft.label || "",
          _icon: draft.icon || "",
          _sort_order: draft.sort_order || 0,
          _is_visible: draft.is_visible ?? true,
        });
        if (error) throw error;
        toast.success("تم إضافة الاختصار");
      }
      setDraft({});
      void loadData();
    } catch (error) {
      toast.error(`تعذر الحفظ: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteShortcut(id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("remove_home_shortcut", {
        _id: id,
      });
      if (error) throw error;
      toast.success("تم حذف الاختصار");
      void loadData();
    } catch (error) {
      toast.error(`تعذر الحذف: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="اختصارات الصفحة الرئيسية" roles={["storekeeper"]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">اختصارات الصفحة الرئيسية</h2>
            <p className="text-sm text-muted-foreground">
              إدارة اختصارات الصفحات المفضلة التي تظهر في الشاشة الرئيسية لحسابك الحالي.
            </p>
          </div>
          <Button onClick={() => setDraft({})} disabled={busy || !canAction("settings.manage")}>
            <Plus className="size-4 mr-2" /> إضافة اختصار
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-xl bg-card p-6 shadow-card space-y-4">
            {!draft.id && shortcuts.length === 0 && (
              <div className="p-6 text-center text-muted-foreground">
                لا توجد اختصارات بعد. أضف اختصاراً جديداً للبدء.
              </div>
            )}

            {draft.id ||
              (shortcuts.length > 0 && (
                <>
                  {draft.id && (
                    <div className="space-y-2">
                      <h4 className="font-semibold">تعديل اختصار</h4>
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-1">
                          <Label>الصفحة</Label>
                          <Select
                            value={draft.page_path || ""}
                            onValueChange={(v) => setDraft({ ...draft, page_path: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SHORTCUT_PAGES.map((p) => (
                                <SelectItem key={p.value} value={p.value}>
                                  {p.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>العنوان</Label>
                          <Input
                            value={draft.label || ""}
                            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>الأيقونة</Label>
                          <Select
                            value={draft.icon || ""}
                            onValueChange={(v) => setDraft({ ...draft, icon: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SHORTCUT_ICONS.map((i) => (
                                <SelectItem key={i.value} value={i.value}>
                                  {i.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>ترتيب العرض</Label>
                          <Input
                            type="number"
                            step="1"
                            value={String(draft.sort_order || 0)}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                sort_order: e.target.value ? Number(e.target.value) : 0,
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={Boolean(draft.is_visible ?? true)}
                          onCheckedChange={(v: boolean) => setDraft({ ...draft, is_visible: v })}
                        />
                        <span className="text-sm">إظهار الاختصار</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => void saveShortcut()}
                          disabled={busy || !canAction("settings.manage")}
                        >
                          {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Save className="size-4" />
                          )}
                          حفظ
                        </Button>
                        <Button variant="outline" onClick={() => setDraft({})} disabled={busy}>
                          إلغاء
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h4 className="font-semibold">الاختصارات الحالية</h4>
                    <div className="divide-y">
                      {shortcuts.map((s) => (
                        <div key={s.id} className="flex items-center justify-between gap-3 p-3">
                          <div className="flex items-center gap-3 flex-1">
                            <span className="text-muted-foreground text-xs">{s.sort_order}</span>
                            <span className="font-medium">{s.label}</span>
                            <span className="text-xs text-muted-foreground">{s.page_path}</span>
                            <span className="text-xs text-muted-foreground">{s.icon}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs">
                              {s.is_visible ? "مفعل" : "مخفي"}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() =>
                                setDraft({
                                  id: s.id,
                                  page_path: s.page_path,
                                  label: s.label,
                                  icon: s.icon,
                                  sort_order: s.sort_order,
                                  is_visible: s.is_visible,
                                })
                              }
                              disabled={busy || !canAction("settings.manage")}
                            >
                              <Move className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="destructive"
                              onClick={() => void deleteShortcut(s.id)}
                              disabled={busy}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
