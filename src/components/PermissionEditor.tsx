import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ACTIONS, FIELDS, PAGES, defaultPermissions, type PermissionSet } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Save } from "lucide-react";

export function PermissionEditor({ user, onClose }: { user: { id: string; username: string; roles: string[] }; onClose: () => void }) {
  const [draft, setDraft] = useState<PermissionSet>(defaultPermissions(user.roles));
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    Promise.all([
      supabase.from("employee_permissions").select("pages,actions,fields").eq("user_id", user.id).maybeSingle(),
      supabase.from("custom_fields").select("name"),
    ]).then(([cfg, fields]) => {
      if (cfg.error || fields.error) { toast.error("تعذر تحميل الصلاحيات"); onClose(); return; }
      const names = (fields.data ?? []).map(f => f.name);
      setCustomFields(names);
      setDraft(cfg.data ?? { ...defaultPermissions(user.roles), fields: defaultPermissions(user.roles).fields.concat(names.map(n => `attribute:${n}`)) });
      setLoading(false);
    });
  }, [user.id]);
  function toggle(kind: keyof PermissionSet, key: string, on: boolean) {
    setDraft(d => ({ ...d, [kind]: on ? [...new Set([...d[kind], key])] : d[kind].filter(k => k !== key) }));
  }
  async function save() {
    setSaving(true);
    const { error } = await supabase.from("employee_permissions").upsert({ user_id: user.id, ...draft, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حفظ الصلاحيات؛ تسري عند فتح الموظف للصفحة مجدداً");
    onClose();
  }
  const groups: { kind: keyof PermissionSet; title: string; items: readonly (readonly [string, string])[] }[] = [
    { kind: "pages", title: "الصفحات", items: PAGES.filter(([k]) => !["users", "backup"].includes(k)) },
    { kind: "actions", title: "العمليات", items: ACTIONS.filter(([k]) => k !== "backup.manage") },
    { kind: "fields", title: "الأعمدة والتفاصيل الظاهرة", items: [...FIELDS, ...customFields.map(n => [`attribute:${n}`, n] as const)] },
  ];
  return <Dialog open onOpenChange={o => !o && onClose()}><DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>صلاحيات {user.username}</DialogTitle></DialogHeader>
    {loading ? <Loader2 className="size-6 animate-spin mx-auto" /> : <>
      {groups.map(g => <section key={g.kind} className="border-b pb-4">
        <div className="flex items-center justify-between mb-3"><h2 className="font-bold">{g.title}</h2>
          <label className="flex gap-2 items-center text-sm"><Checkbox checked={g.items.every(([k]) => draft[g.kind].includes(k))} onCheckedChange={v => setDraft(d => ({ ...d, [g.kind]: v === true ? [...new Set([...d[g.kind], ...g.items.map(([k]) => k)])] : d[g.kind].filter(k => !g.items.some(([i]) => i === k)) }))} /> تحديد الكل</label>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{g.items.map(([key, label]) => <label key={key} className="flex items-start gap-2 text-sm"><Checkbox checked={draft[g.kind].includes(key)} onCheckedChange={v => toggle(g.kind, key, v === true)} aria-label={label} /><span>{label}</span></label>)}</div>
      </section>)}
      <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} حفظ الصلاحيات</Button>
    </>}
  </DialogContent></Dialog>;
}