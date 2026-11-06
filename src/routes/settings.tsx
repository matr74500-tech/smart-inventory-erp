import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useInventory } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "الإعدادات | سهيل سوفت" },
      { name: "description", content: "إعداد الفئات والمستودعات والوحدات والحقول الإضافية وبيانات المحل." },
      { property: "og:title", content: "الإعدادات | سهيل سوفت" },
      { property: "og:description", content: "تخصيص الفئات والمستودعات والوحدات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type Col = { key: string; label: string; type?: "text" | "number" | "kind" | "list"; dir?: "ltr" };
type Table = "categories" | "warehouses" | "units" | "custom_fields";

const KINDS: Record<string, string> = { text: "نص", number: "رقم", select: "قائمة اختيار" };

function SettingsPage() {
  const inv = useInventory();
  const { can } = useAuth();
  return (
    <AppShell title="الإعدادات" roles={["storekeeper"]}>
      <Tabs defaultValue="categories" dir="rtl">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="categories">الفئات</TabsTrigger>
          <TabsTrigger value="warehouses">المستودعات</TabsTrigger>
          <TabsTrigger value="units">الوحدات</TabsTrigger>
          <TabsTrigger value="fields">حقول إضافية</TabsTrigger>
          {can("admin") && <TabsTrigger value="shop">بيانات المحل</TabsTrigger>}
        </TabsList>
        <TabsContent value="categories">
          <ListEditor table="categories" rows={inv.categories} cols={[{ key: "name", label: "اسم الفئة" }, { key: "prefix", label: "بادئة الكود", dir: "ltr" }]} hint="بادئة الكود تُستخدم لتوليد كود الصنف تلقائياً، مثل OFF-0001." />
        </TabsContent>
        <TabsContent value="warehouses">
          <ListEditor table="warehouses" rows={inv.warehouses} cols={[{ key: "name", label: "اسم المستودع / المعرض" }]} hint="أي تعديل يظهر فوراً في كل الشاشات والأجهزة." />
        </TabsContent>
        <TabsContent value="units">
          <ListEditor table="units" rows={inv.units} cols={[{ key: "name", label: "اسم الوحدة" }, { key: "factor", label: "معامل التحويل الافتراضي", type: "number" }]} hint="سعة العبوة الفعلية تُحدد لكل صنف، والمعامل هنا قيمة مقترحة." />
        </TabsContent>
        <TabsContent value="fields">
          <ListEditor table="custom_fields" rows={inv.fields} cols={[{ key: "name", label: "اسم الحقل (مثل اللون، الحجم، الوزن)" }, { key: "kind", label: "النوع", type: "kind" }, { key: "options", label: "الخيارات (افصل بفاصلة)", type: "list" }]} hint="الحقول الإضافية تظهر في نموذج الصنف وهي اختيارية." />
        </TabsContent>
        <TabsContent value="shop"><ShopSettings name={inv.settings?.shop_name ?? ""} phone={inv.settings?.phone ?? ""} /></TabsContent>
      </Tabs>
    </AppShell>
  );
}

type AnyRow = { id: string; [k: string]: unknown };

function toValue(c: Col, v: string) {
  if (c.type === "number") return Number(v || 0);
  if (c.type === "list") return v.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
  return v.trim();
}
const show = (c: Col, v: unknown) => (c.type === "list" ? ((v as string[]) ?? []).join("، ") : c.type === "kind" ? KINDS[String(v)] : String(v ?? ""));

function ListEditor({ table, rows, cols, hint }: { table: Table; rows: AnyRow[]; cols: Col[]; hint: string }) {
  const empty = Object.fromEntries(cols.map((c) => [c.key, c.type === "kind" ? "text" : ""]));
  const [draft, setDraft] = useState<Record<string, string>>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});

  const payload = (d: Record<string, string>) => Object.fromEntries(cols.map((c) => [c.key, toValue(c, d[c.key] ?? "")]));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!draft[cols[0]?.key ?? ""]?.trim()) return;
    const { error } = await supabase.from(table).insert(payload(draft) as never);
    if (error) { toast.error(error.code === "23505" ? "الاسم موجود مسبقاً" : error.message); return; }
    setDraft(empty);
    toast.success("تمت الإضافة");
  }
  async function save(id: string) {
    const { error } = await supabase.from(table).update(payload(edit) as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditing(null);
  }
  async function remove(id: string) {
    if (!confirm("تأكيد الحذف؟")) return;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) toast.error(error.code === "23503" ? "لا يمكن الحذف لوجود بيانات مرتبطة" : error.message);
  }

  const field = (c: Col, val: string, set: (v: string) => void) =>
    c.type === "kind" ? (
      <Select value={val || "text"} onValueChange={set}>
        <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
        <SelectContent>{Object.entries(KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
    ) : (
      <Input className="bg-card" dir={c.dir} type={c.type === "number" ? "number" : "text"} step="any" value={val} onChange={(e) => set(e.target.value)} />
    );

  return (
    <div className="space-y-4 mt-4">
      <form onSubmit={add} className="rounded-xl bg-card shadow-card p-4 flex flex-wrap items-end gap-3">
        {cols.map((c) => (
          <div key={c.key} className="space-y-1 flex-1 min-w-40"><Label>{c.label}</Label>{field(c, draft[c.key] ?? "", (v) => setDraft((d) => ({ ...d, [c.key]: v })))}</div>
        ))}
        <Button type="submit"><Plus className="size-4" /> إضافة</Button>
      </form>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <div className="rounded-xl bg-card shadow-card divide-y">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
            {editing === r.id ? (
              <>
                {cols.map((c) => <div key={c.key} className="flex-1 min-w-32">{field(c, edit[c.key] ?? "", (v) => setEdit((d) => ({ ...d, [c.key]: v })))}</div>)}
                <Button size="icon" onClick={() => save(r.id)} aria-label="حفظ"><Check className="size-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditing(null)} aria-label="إلغاء"><X className="size-4" /></Button>
              </>
            ) : (
              <>
                {cols.map((c, i) => <div key={c.key} className={`flex-1 min-w-32 ${i === 0 ? "font-medium" : "text-sm text-muted-foreground"}`} dir={c.dir}>{show(c, r[c.key])}</div>)}
                <Button size="icon" variant="ghost" aria-label="تعديل" onClick={() => { setEditing(r.id); setEdit(Object.fromEntries(cols.map((c) => [c.key, c.type === "list" ? ((r[c.key] as string[]) ?? []).join("، ") : String(r[c.key] ?? "")]))); }}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => remove(r.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </>
            )}
          </div>
        ))}
        {rows.length === 0 && <div className="p-6 text-center text-muted-foreground">لا توجد عناصر بعد</div>}
      </div>
    </div>
  );
}

function ShopSettings({ name, phone }: { name: string; phone: string }) {
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const { error } = await supabase.from("app_settings").upsert({ id: 1, shop_name: String(f.get("shop_name")), phone: String(f.get("phone") || "") || null });
    if (error) toast.error(error.message); else toast.success("تم الحفظ");
  }
  return (
    <form key={name + phone} onSubmit={save} className="mt-4 rounded-xl bg-card shadow-card p-4 grid sm:grid-cols-2 gap-3 max-w-xl">
      <div className="space-y-1"><Label>اسم المحل (يظهر على الملصقات والكتالوج)</Label><Input name="shop_name" defaultValue={name} required /></div>
      <div className="space-y-1"><Label>رقم الهاتف</Label><Input name="phone" dir="ltr" defaultValue={phone} /></div>
      <Button type="submit" className="sm:col-span-2">حفظ</Button>
    </form>
  );
}
