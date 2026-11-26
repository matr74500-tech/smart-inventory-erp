import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CloudUpload, Download, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
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
  "profiles",
  "user_roles",
  "employee_permissions",
  "categories",
  "units",
  "custom_fields",
  "warehouses",
  "currencies",
  "exchange_rates",
  "products",
  "stock",
  "stock_minimums",
  "stock_movements",
  "purchase_invoices",
  "purchase_items",
  "purchase_orders",
  "purchase_order_items",
  "suppliers",
  "product_suppliers",
  "reorder_requests",
  "customers",
  "customer_payment_plans",
  "sales_invoices",
  "sales_items",
  "vouchers",
  "cash_transactions",
  "daily_cash_closings",
] as const;

async function fetchAllowedTables(): Promise<Set<string>> {
  const { data } = await supabase
    .from("backup_allowed_tables" as never)
    .select("table_name")
    .eq("allowed", true);
  return new Set((data ?? []).map((row) => String((row as Record<string, unknown>)["table_name"])));
}
type Row = { id: string; created_at: string; size_bytes: number };

type TableName = keyof Database["public"]["Tables"];

type BackupData = {
  app?: string;
  version?: number;
  created_at?: string;
  table_count?: number;
  row_counts?: Record<string, number>;
  tables?: Record<string, unknown[]>;
};

const CURRENT_BACKUP_VERSION = 2;

/** Dependencias entre tablas (FKs) para un orden seguro al restaurar. */
const RESTORE_DEPS: Record<string, string[]> = {
  products: ["categories", "warehouses"],
  purchase_invoices: ["warehouses"],
  purchase_items: ["products", "purchase_invoices"],
  reorder_requests: ["products", "warehouses"],
  stock: ["products", "warehouses"],
  stock_movements: ["products", "warehouses"],
  customer_payment_plans: ["customers"],
  sales_invoices: ["customers"],
  sales_items: ["sales_invoices", "products"],
  vouchers: ["customers"],
  product_suppliers: ["products", "suppliers"],
  purchase_order_items: ["purchase_orders", "products"],
};

function restoreOrder(names: string[]): string[] {
  const wanted = new Set(names);
  const done = new Set<string>();
  const out: string[] = [];
  const visit = (t: string) => {
    if (done.has(t) || !wanted.has(t)) return;
    done.add(t);
    for (const dep of RESTORE_DEPS[t] ?? []) visit(dep);
    out.push(t);
  };
  names.forEach(visit);
  return out;
}

/** Lee y valida estructura + compatibilidad del archivo JSON del backup. */
async function readBackupFile(file: File): Promise<BackupData | string> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return "تعذر قراءة الملف";
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return "الملف ليس JSON صالحاً";
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return "تنسيق الملف غير صالح (يجب أن يكون كائنًا)";
  }
  const obj = data as Record<string, unknown>;
  if (obj["app"] !== undefined && obj["app"] !== "suhailsoft") {
    return "هذا الملف لمنصة أخرى";
  }
  const version = obj["version"];
  if (typeof version === "number" && version > CURRENT_BACKUP_VERSION) {
    return `نسخة الملف أحدث من هذه النسخة (${version} > ${CURRENT_BACKUP_VERSION})`;
  }
  const tables = obj["tables"];
  if (typeof tables !== "object" || tables === null || Array.isArray(tables)) {
    return "تنسيق الملف غير صالح (القسم tables مفقود)";
  }
  for (const [name, rows] of Object.entries(tables)) {
    if (!Array.isArray(rows)) return `الجدول "${name}" لا يحتوي على مصفوفة صالحة`;
  }
  return data as BackupData;
}

/** ملخص معاينة: عدد السجلات لكل جدول موجود في الملف. */
function previewRows(data: BackupData): Array<{ name: string; count: number }> {
  const counts = data.row_counts ?? {};
  return Object.entries(data.tables ?? {}).map(([name, rows]) => ({
    name,
    count: Array.isArray(rows) ? rows.length : (counts[name] ?? 0),
  }));
}

async function executeRestore(
  data: BackupData,
  allowedTables: Set<string>,
): Promise<{ ok: boolean; message: string }> {
  const tables = data.tables ?? {};
  const skipped = Object.keys(tables).filter(
    (t) => Array.isArray(tables[t]) && tables[t].length > 0 && !allowedTables.has(t),
  );
  const names = Object.keys(tables).filter((t) => {
    const rows = tables[t];
    return Array.isArray(rows) && rows.length > 0 && allowedTables.has(t);
  });
  let total = 0;
  for (const t of restoreOrder(names)) {
    const rows = tables[t] as Record<string, unknown>[];
    const { error } = await supabase
      .from(t as TableName)
      .upsert(rows as never, { onConflict: "id", ignoreDuplicates: true });
    if (error) return { ok: false, message: `${t}: ${error.message}` };
    total += rows.length;
  }
  const skippedText = skipped.length ? `؛ تم تجاهل ${skipped.length} جدول غير مسموح` : "";
  return { ok: true, message: `تمت الاستعادة: ${total} سجل${skippedText}` };
}

async function collect() {
  const out: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  for (const t of TABLES) {
    if (t === "products") {
      const { data, error } = await supabase.rpc("visible_products");
      if (error) throw error;
      out[t] = data ?? [];
      rowCounts[t] = data?.length ?? 0;
      continue;
    }

    const rows: unknown[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from(t)
        .select("*")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
    }
    out[t] = rows;
    rowCounts[t] = rows.length;
  }
  return {
    app: "suhailsoft",
    version: 2,
    created_at: new Date().toISOString(),
    table_count: TABLES.length,
    row_counts: rowCounts,
    tables: out,
  };
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
  const [file, setFile] = useState<BackupData | null>(null);
  const [preview, setPreview] = useState<Array<{ name: string; count: number }> | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [allowedTables, setAllowedTables] = useState<Set<string>>(new Set(TABLES));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const load = () =>
    supabase
      .from("backups")
      .select("id,created_at,size_bytes")
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  useEffect(() => {
    void load();
    void fetchAllowedTables().then(setAllowedTables);
  }, []);

  async function run(target: "device" | "cloud") {
    setBusy(target);
    try {
      const data = await collect();
      if (target === "device") download(data, fname(data.created_at));
      else {
        const { data: u } = await supabase.auth.getUser();
        const sizeBytes = JSON.stringify(data).length;
        const { error } = await supabase.rpc(
          "backup_create_if_allowed" as never,
          {
            _allowed_tables: [...allowedTables],
            _data: data as never,
            _user_id: u.user?.id ?? null,
            _size_bytes: sizeBytes,
          } as never,
        );
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

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow selecting the same file again
    if (!f) return;
    const result = await readBackupFile(f);
    if (typeof result === "string") {
      toast.error(result);
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(result);
    setPreview(previewRows(result));
  }

  async function runRestore() {
    if (!file) return;
    setRestoring(true);
    try {
      const msg = await executeRestore(file, await fetchAllowedTables());
      if (msg.ok) {
        toast.success(msg.message);
        setFile(null);
        setPreview(null);
      } else {
        toast.error(msg.message);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <AppShell title="النسخ الاحتياطي" roles={["admin"]}>
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl bg-card shadow-card p-5 space-y-3">
          <div className="font-bold">حفظ في السحابة (المنصة)</div>
          <p className="text-sm text-muted-foreground">
            نسخة محفوظة على الخادم يمكن تنزيلها من أي جهاز. عدد الجداول المسموحة:{" "}
            {allowedTables.size}.
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
      <div className="rounded-xl bg-card shadow-card p-5 space-y-4 mb-6">
        <div className="font-bold">استعادة من ملف (استيراد)</div>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm font-semibold text-destructive">
          ⚠️ تنبيه: الاستعادة تشمل بيانات الجداول فقط — لا تشمل حسابات المصادقة (Auth) أو ملفات
          الصور في Storage.
        </div>
        <p className="text-sm text-muted-foreground">
          رفع ملف نسخ احتياطي (JSON) لاستعادة بيانات الجداول من هذا الجهاز.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFile}
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={!!restoring}>
            اختيار ملف النسخ الاحتياطي
          </Button>
          <span className="text-sm text-muted-foreground">
            {file
              ? file.created_at
                ? `الملف: ${new Date(file.created_at).toLocaleString("ar")}`
                : "لم يتم اختيار ملف"
              : "لم يتم اختيار ملف"}
          </span>
        </div>
        {file && preview && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">معاينة الاستعادة (عدد السجلات لكل جدول):</div>
            <div className="max-h-56 overflow-y-auto text-sm space-y-1">
              {preview.map((p) => (
                <div key={p.name} className="flex justify-between">
                  <span dir="ltr">{p.name}</span>
                  <span>
                    {p.count} سجل{p.count === 1 ? "" : "ات"}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-sm text-muted-foreground">
              المجموع: {preview.reduce((a, p) => a + p.count, 0)} سجل
            </div>
          </div>
        )}
        <Button onClick={runRestore} disabled={!file || !!restoring}>
          {restoring ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{" "}
          ابدأ الاستعادة
        </Button>
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
