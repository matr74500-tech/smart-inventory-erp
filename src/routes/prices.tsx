import { useAuth } from "@/lib/auth";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Save, Search, Percent } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useInventory } from "@/hooks/use-inventory";
import { matchesSearch } from "@/lib/arabic";
import { PRICE_TIERS, adjustPrice, type PriceKey } from "@/lib/inventory-utils";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/prices")({
  head: () => ({
    meta: [
      { title: "تحديث الأسعار | نظام المخزون الذكي" },
      {
        name: "description",
        content: "تعديل التكلفة وشرائح أسعار البيع الخمس لكل الأصناف دفعة واحدة.",
      },
      { property: "og:title", content: "تحديث الأسعار | نظام المخزون الذكي" },
      { property: "og:description", content: "تحديث جماعي للأسعار بنسبة مئوية أو هامش ربح." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricesPage,
});

const ALL = "__all";
type Field = PriceKey | "cost";
const FIELDS: { key: Field; label: string }[] = [{ key: "cost", label: "التكلفة" }, ...PRICE_TIERS];

function PricesPage() {
  const { canAction, canField } = useAuth();
  const { products, categories } = useInventory();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(ALL);
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<Field, number>>>>({});
  const [target, setTarget] = useState<PriceKey>("price");
  const [mode, setMode] = useState<"percent" | "margin">("percent");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const list = useMemo(
    () =>
      products.filter(
        (p) =>
          (cat === ALL || p.category_id === cat) && matchesSearch([p.name, p.code, p.barcode], q),
      ),
    [products, cat, q],
  );
  const val = (id: string, k: Field) =>
    drafts[id]?.[k] ?? Number(products.find((p) => p.id === id)?.[k] ?? 0);
  const setVal = (id: string, k: Field, v: number) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));

  function applyBulk() {
    const n = Number(value);
    if (!value || !Number.isFinite(n)) return;
    const next = { ...drafts };
    for (const p of list) {
      const v =
        mode === "percent" ? adjustPrice(val(p.id, target), n) : adjustPrice(val(p.id, "cost"), n);
      next[p.id] = { ...next[p.id], [target]: v };
    }
    setDrafts(next);
    toast.info(`تم تجهيز ${list.length} سعر — اضغط حفظ لاعتمادها`);
  }

  async function saveAll() {
    if (!canAction("prices.update")) return;
    const ids = Object.keys(drafts);
    if (!ids.length) return;
    setSaving(true);
    const results = await Promise.all(
      ids.map((id) =>
        supabase
          .from("products")
          .update({ ...drafts[id], updated_at: new Date().toISOString() })
          .eq("id", id),
      ),
    );
    setSaving(false);
    const failed = results.filter((r) => r.error);
    if (failed.length) toast.error(failed[0]?.error?.message ?? "خطأ");
    else {
      toast.success(`تم تحديث أسعار ${ids.length} صنف في كل المستودعات`);
      setDrafts({});
    }
  }

  const changed = Object.keys(drafts).length;

  return (
    <AppShell title="تحديث الأسعار" roles={["storekeeper"]}>
      <div className="rounded-xl bg-card shadow-card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>الشريحة</Label>
          <Select value={target} onValueChange={(v) => setTarget(v as PriceKey)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRICE_TIERS.filter((t) => canField(t.key)).map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>الطريقة</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as "percent" | "margin")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">زيادة/نقص بنسبة من السعر الحالي</SelectItem>
              <SelectItem value="margin">هامش ربح فوق التكلفة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>النسبة %</Label>
          <Input
            className="w-24"
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="10"
          />
        </div>
        <Button variant="outline" onClick={applyBulk}>
          <Percent className="size-4" /> تطبيق على {list.length} صنف
        </Button>
        <div className="flex-1" />
        <Button onClick={saveAll} disabled={!canAction("prices.update") || !changed || saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} حفظ (
          {changed})
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pr-10 bg-card"
            placeholder="بحث…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-44 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الفئات</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl bg-card shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th className="p-3 text-right">الصنف</th>
              {FIELDS.filter((f) => canField(f.key)).map((f) => (
                <th key={f.key} className="p-3 text-right whitespace-nowrap">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={`border-t ${drafts[p.id] ? "bg-accent/40" : ""}`}>
                <td className="p-3 font-medium min-w-40">{p.name}</td>
                {FIELDS.filter((f) => canField(f.key)).map((f) => (
                  <td key={f.key} className="p-1.5">
                    <Input
                      className="w-24 h-9"
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={!canAction("prices.update")}
                      value={val(p.id, f.key)}
                      onChange={(e) => setVal(p.id, f.key, Number(e.target.value))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
