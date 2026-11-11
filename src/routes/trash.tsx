import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2, RotateCcw, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/trash")({
  head: () => ({
    meta: [
      { title: "سلة المحذوفات المستقلة | سهيل سوفت" },
      { name: "description", content: "إدارة العناصر المحذوفة، استعادتها أو تفريغها نهائياً." },
    ],
  }),
  component: TrashPage,
});

function TrashPage() {
  const { canAction } = useAuth();
  const [trashItems, setTrashItems] = useState<any[]>([]);

  const loadTrash = () => {
    try {
      const items = JSON.parse(localStorage.getItem("trash_products") || "[]");
      setTrashItems(items);
    } catch {
      setTrashItems([]);
    }
  };

  useEffect(() => {
    loadTrash();
  }, []);

  async function restoreItem(item: any, index: number) {
    if (!canAction("inventory.edit")) return toast.error("ليس لديك صلاحية الاستعادة");
    const { deletedAt, ...rest } = item;
    const { error } = await supabase.from("products").upsert(rest);
    if (error) {
      toast.error(error.message);
    } else {
      const next = trashItems.filter((_, i) => i !== index);
      setTrashItems(next);
      localStorage.setItem("trash_products", JSON.stringify(next));
      toast.success(`تمت استعادة الصنف "${item.name}" بنجاح`);
    }
  }

  async function restoreAll() {
    if (!canAction("inventory.edit")) return toast.error("ليس لديك صلاحية الاستعادة");
    if (!trashItems.length) return toast.error("السلة فارغة");
    if (!confirm("تأكيد استعادة جميع العناصر المحذوفة؟")) return;
    for (const item of trashItems) {
      const { deletedAt, ...rest } = item;
      await supabase.from("products").upsert(rest);
    }
    localStorage.removeItem("trash_products");
    setTrashItems([]);
    toast.success("تمت استعادة جميع العناصر إلى المخزون بنجاح");
  }

  function emptyTrash() {
    if (!canAction("inventory.delete")) return toast.error("ليس لديك صلاحية الحذف النهائي");
    if (!trashItems.length) return toast.error("السلة فارغة مسبقاً");
    if (!confirm("تحذير: سيتم تفريغ سلة المحذوفات نهائياً ولن يمكنك استعادتها. هل أنت متأكد؟")) return;
    localStorage.removeItem("trash_products");
    setTrashItems([]);
    toast.success("تم تفريغ سلة المحذوفات نهائياً");
  }

  return (
    <AppShell title="سلة المحذوفات المستقلة" roles={["storekeeper"]}>
      <div className="space-y-4">
        <div className="rounded-xl bg-card shadow-card p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><Trash2 className="size-5 text-destructive" /> إدارة المحذوفات</h2>
            <p className="text-xs text-muted-foreground">العناصر المحذوفة هنا محفوظة محلياً ويمكن استعادتها لجدول المنتجات في أي وقت.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={restoreAll} disabled={!trashItems.length}>
              <RotateCcw className="size-4 ml-1.5" /> استعادة الكل
            </Button>
            <Button variant="destructive" onClick={emptyTrash} disabled={!trashItems.length}>
              <Trash2 className="size-4 ml-1.5" /> تفريغ السلة نهائياً
            </Button>
          </div>
        </div>

        <div className="rounded-xl bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="p-3 text-right">الصنف</th>
                <th className="p-3 text-right">الكود / الباركود</th>
                <th className="p-3 text-right">سعر التجزئة</th>
                <th className="p-3 text-right">تاريخ الحذف</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {trashItems.map((item, index) => (
                <tr key={item.id ?? index} className="hover:bg-muted/50">
                  <td className="p-3 font-medium">{item.name}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">{item.code || item.barcode || "—"}</td>
                  <td className="p-3">{Number(item.price ?? 0)} ر.ي</td>
                  <td className="p-3 text-xs text-muted-foreground">{item.deletedAt ? new Date(item.deletedAt).toLocaleString("ar") : "—"}</td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => restoreItem(item, index)}>
                        <RotateCcw className="size-3.5 ml-1" /> استعادة
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {trashItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground">
                    <CheckCircle2 className="mx-auto size-8 text-success mb-2" />
                    سلة المحذوفات فارغة تماماً
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
