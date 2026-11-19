import { useEffect, useState, type FormEvent } from "react";
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
  const { can, canAction } = useAuth();
  return (
    <AppShell title="الإعدادات" roles={["storekeeper"]}>
      <fieldset disabled={!canAction("settings.manage")}><Tabs defaultValue="categories" dir="rtl">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="categories">الفئات</TabsTrigger>
          <TabsTrigger value="warehouses">المستودعات</TabsTrigger>
          <TabsTrigger value="units">الوحدات</TabsTrigger>
          <TabsTrigger value="fields">حقول إضافية</TabsTrigger>
          <TabsTrigger value="mins">حد أدنى لكل مستودع</TabsTrigger>
          {can("admin") && <TabsTrigger value="shop">بيانات المحل</TabsTrigger>}
          {can("admin") && <TabsTrigger value="currencies">العملات وسعر الصرف</TabsTrigger>}
          {can("admin") && <TabsTrigger value="activity">متابعة العملاء</TabsTrigger>}
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
        <TabsContent value="mins"><MinimumsEditor inv={inv} /></TabsContent>
        <TabsContent value="shop"><ShopSettings name={inv.settings?.shop_name ?? ""} phone={inv.settings?.phone ?? ""} /></TabsContent>
        <TabsContent value="currencies"><CurrenciesEditor currencies={inv.currencies} exchangeRates={inv.exchangeRates} /></TabsContent>
        <TabsContent value="activity"><InactiveCustomerSettings days={inv.settings?.inactive_customer_days ?? null} /></TabsContent>
      </Tabs></fieldset>
    </AppShell>
  );
}

function InactiveCustomerSettings({ days }: { days: number | null }) {
  const [value, setValue] = useState(days?.toString() ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(days?.toString() ?? "");
  }, [days]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    const parsedDays = trimmed ? Number(trimmed) : null;
    if (parsedDays !== null && (!Number.isInteger(parsedDays) || parsedDays < 1)) {
      toast.error("أدخل عدد أيام صحيحًا أكبر من صفر أو اتركه فارغًا لإيقاف التنبيه");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("app_settings").update({ inactive_customer_days: parsedDays }).eq("id", 1);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(parsedDays === null ? "تم إيقاف تنبيه العملاء غير النشطين" : `سيظهر تنبيه بعد ${parsedDays} يومًا من عدم النشاط`);
  }

  return (
    <form onSubmit={save} className="mt-4 max-w-xl rounded-xl bg-card p-4 shadow-card space-y-3">
      <p className="text-sm text-muted-foreground">حدد عدد الأيام منذ آخر عملية بيع لترشيح العميل كغير نشط. اترك الحقل فارغًا لإيقاف هذا التنبيه.</p>
      <div className="space-y-1">
        <Label>فترة عدم النشاط بالأيام</Label>
        <Input type="number" min="1" step="1" value={value} onChange={(e) => setValue(e.target.value)} placeholder="مثال: 90" />
      </div>
      <Button type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ الإعداد"}</Button>
    </form>
  );
}

function CurrenciesEditor({ currencies, exchangeRates }: {
  currencies: ReturnType<typeof useInventory>["currencies"];
  exchangeRates: ReturnType<typeof useInventory>["exchangeRates"];
}) {
  const { session } = useAuth();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [newRate, setNewRate] = useState("");
  const [draftRates, setDraftRates] = useState<Record<string, string>>({});
  const latestRates = new Map<string, (typeof exchangeRates)[number]>();
  for (const rate of exchangeRates) {
    if (!latestRates.has(rate.currency_code)) latestRates.set(rate.currency_code, rate);
  }

  async function addCurrency(e: FormEvent) {
    e.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    const rate = Number(newRate);
    if (!/^[A-Z]{3,8}$/.test(normalizedCode) || !name.trim() || !Number.isFinite(rate) || rate <= 0) {
      toast.error("أدخل رمزًا من 3 إلى 8 أحرف واسمًا وسعرًا أكبر من صفر");
      return;
    }
    const { error: currencyError } = await supabase.from("currencies").insert({ code: normalizedCode, name: name.trim() });
    if (currencyError) {
      toast.error(currencyError.code === "23505" ? "رمز العملة موجود مسبقًا" : currencyError.message);
      return;
    }
    const { error: rateError } = await supabase.from("exchange_rates").insert({
      currency_code: normalizedCode,
      rate_to_yer: rate,
      created_by: session?.user.id ?? null,
    });
    if (rateError) {
      toast.error(`أُضيفت العملة، لكن تعذر حفظ سعرها: ${rateError.message}`);
      setCode("");
      setName("");
      setNewRate("");
      return;
    }
    setCode("");
    setName("");
    setNewRate("");
    toast.success("تمت إضافة العملة وسعر الصرف");
  }

  async function saveRate(currencyCode: string) {
    const rate = Number(draftRates[currencyCode]);
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error("يجب أن يكون سعر الصرف أكبر من صفر");
      return;
    }
    const { error } = await supabase.from("exchange_rates").insert({
      currency_code: currencyCode,
      rate_to_yer: rate,
      created_by: session?.user.id ?? null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraftRates((values) => { const next = { ...values }; delete next[currencyCode]; return next; });
    toast.success("تم حفظ سعر الصرف الجديد");
  }

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">سعر الصرف هو عدد الريالات اليمنية مقابل وحدة واحدة من العملة. كل تعديل يُحفظ كسجل جديد؛ أسعار المعاملات السابقة لا تتغير.</p>
      <form onSubmit={addCurrency} className="rounded-xl bg-card p-4 shadow-card grid sm:grid-cols-4 gap-3 items-end">
        <div className="space-y-1"><Label>رمز العملة</Label><Input dir="ltr" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="مثال: EUR" /></div>
        <div className="space-y-1"><Label>اسم العملة</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label>سعرها بالريال اليمني</Label><Input type="number" min="0.000001" step="any" value={newRate} onChange={(e) => setNewRate(e.target.value)} /></div>
        <Button type="submit">إضافة عملة</Button>
      </form>
      <div className="rounded-xl bg-card shadow-card divide-y">
        {currencies.map((currency) => {
          const current = latestRates.get(currency.code);
          return (
            <div key={currency.code} className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-36 flex-1">
                <div className="font-semibold">{currency.name} <span className="text-xs text-muted-foreground" dir="ltr">{currency.code}</span></div>
                <div className="text-xs text-muted-foreground">
                  {currency.is_base ? "العملة الأساسية" : current ? `السعر الحالي: ${Number(current.rate_to_yer)}` : "لا يوجد سعر مسجل"}
                  {current && !currency.is_base ? ` · ${new Date(current.effective_at).toLocaleString("ar")}` : ""}
                </div>
              </div>
              {!currency.is_base && (
                <>
                  <div className="w-40 space-y-1"><Label>سعر جديد (YER)</Label><Input type="number" min="0.000001" step="any" value={draftRates[currency.code] ?? ""} onChange={(e) => setDraftRates((values) => ({ ...values, [currency.code]: e.target.value }))} /></div>
                  <Button type="button" variant="outline" onClick={() => saveRate(currency.code)}>حفظ السعر</Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
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

function MinimumsEditor({ inv }: { inv: ReturnType<typeof useInventory> }) {
  const [wh, setWh] = useState("");
  const [q, setQ] = useState("");
  const warehouse = wh || inv.warehouses[0]?.id || "";
  const minOf = (pid: string) => inv.minimums.find((m) => m.product_id === pid && m.warehouse_id === warehouse)?.min_qty;
  async function save(pid: string, v: string) {
    const n = Number(v || 0);
    if (Number(minOf(pid) ?? 0) === n) return;
    const { error } = await supabase.from("stock_minimums").upsert({ product_id: pid, warehouse_id: warehouse, min_qty: n });
    if (error) toast.error(error.message); else toast.success("تم حفظ الحد الأدنى");
  }
  const list = inv.products.filter((p) => !q || p.name.includes(q) || p.code?.includes(q));
  return (
    <div className="space-y-3 mt-4">
      <div className="flex flex-wrap gap-2">
        <Select value={warehouse} onValueChange={setWh}>
          <SelectTrigger className="w-56 bg-card"><SelectValue placeholder="المستودع" /></SelectTrigger>
          <SelectContent>{inv.warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input className="flex-1 min-w-40 bg-card" placeholder="بحث عن صنف…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">لكل مستودع (مثل المعرض الرئيسي) حد أدنى خاص. يظهر تنبيه فوري عند نزول الرصيد عنه. اترك 0 لإلغاء التنبيه.</p>
      <div className="rounded-xl bg-card shadow-card divide-y">
        {list.map((p) => (
          <div key={p.id + warehouse} className="flex items-center gap-3 p-3">
            <div className="flex-1"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">الرصيد هنا: {inv.qty(p.id, warehouse)} {p.unit}</div></div>
            <Input type="number" min="0" step="any" className="w-28" placeholder="الحد" defaultValue={minOf(p.id) ?? ""} onBlur={(e) => save(p.id, e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          </div>
        ))}
        {!list.length && <div className="p-6 text-center text-muted-foreground">لا توجد أصناف</div>}
      </div>
    </div>
  );
}
