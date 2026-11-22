import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CloudUpload, Download, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/backup")({
  head: () => ({
    meta: [
      { title: "النسخ الاحتياطي | نظام المخزون الذكي" },
      { name: "description", content: "نسخ احتياطي لبيانات المخزون إلى السحابة أو إلى جهازك." },
      { property: "og:title", content: "النسخ الاحتياطي | نظام المخزون الذكي" },
      { property: "og:description", content: "حفظ نسخة من كل البيانات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BackupPage,
});

const TABLES = [
  "app_settings",
  "categories",
  "units",
  "custom_fields",
  "warehouses",
  "products",
  "stock",
  "stock_minimums",
  "stock_movements",
  "purchase_invoices",
  "purchase_items",
  "reorder_requests",
] as const;
type Row = { id: string; created_at: string; size_bytes: number };

async function collect() {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const { data, error } = await (t === "products"
      ? supabase.rpc("visible_products")
      : supabase.from(t).select("*").limit(100000));
    if (error) throw error;
    out[t] = data ?? [];
  }
  return { app: "suhailsoft", version: 1, created_at: new Date().toISOString(), tables: out };
}
function download(obj: unknown, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
const fname = (d: string) => `suhailsoft-backup-${d.slice(0, 16).replace(/[:T]/g, "-")}.json`;

function BackupPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState("");
  const load = () =>
    supabase
      .from("backups")
      .select("id,created_at,size_bytes")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  useEffect(() => {
    load();
  }, []);

  async function run(target: "device" | "cloud") {
    setBusy(target);
    try {
      const data = await collect();
      if (target === "device") download(data, fname(data.created_at));
      else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("backups").insert({
          data: data as never,
          user_id: u.user?.id ?? null,
          size_bytes: JSON.stringify(data).length,
        });
        if (error) throw error;
        load();
      }
      toast.success("تم إنشاء النسخة الاحتياطية");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy("");
  }
  async function get(r: Row) {
    const { data } = await supabase.from("backups").select("data").eq("id", r.id).single();
    if (data) download(data.data, fname(r.created_at));
  }
  async function del(id: string) {
    if (!confirm("حذف هذه النسخة؟")) return;
    await supabase.from("backups").delete().eq("id", id);
    load();
  }

  return (
    <AppShell title="النسخ الاحتياطي" roles={["admin"]}>
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl bg-card shadow-card p-5 space-y-3">
          <div className="font-bold">حفظ في السحابة (المنصة)</div>
          <p className="text-sm text-muted-foreground">
            نسخة محفوظة على الخادم يمكن تنزيلها من أي جهاز.
          </p>
          <Button onClick={() => run("cloud")} disabled={!!busy}>
            {busy === "cloud" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CloudUpload className="size-4" />
            )}{" "}
            نسخ إلى السحابة
          </Button>
        </div>
        <div className="rounded-xl bg-card shadow-card p-5 space-y-3">
          <div className="font-bold">تنزيل إلى الجهاز</div>
          <p className="text-sm text-muted-foreground">
            ملف يُحفظ على جوالك أو حاسوبك، ويمكنك رفعه إلى Google Drive أو أي موقع.
          </p>
          <Button variant="outline" onClick={() => run("device")} disabled={!!busy}>
            {busy === "device" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}{" "}
            تنزيل نسخة
          </Button>
        </div>
      </div>
      <div className="rounded-xl bg-card shadow-card divide-y">
        <div className="p-4 font-bold">النسخ المحفوظة في السحابة</div>
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
            <span className="flex-1" dir="ltr">
              {new Date(r.created_at).toLocaleString("ar")}
            </span>
            <span className="text-muted-foreground">{(r.size_bytes / 1024).toFixed(0)} KB</span>
            <Button size="icon" variant="ghost" aria-label="تنزيل" onClick={() => get(r)}>
              <Download className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => del(r.id)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
        {!rows.length && (
          <div className="p-6 text-center text-muted-foreground">لا توجد نسخ بعد</div>
        )}
      </div>
    </AppShell>
  );
}
