import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/settings_establishment")({
  head: () => ({
    meta: [
      { title: "بيانات المنشأة والتسويق | نظام المخزون الذكي" },
      { name: "description", content: "إدارة شعار وبيانات المنشأة والعبارات التسويقية." },
    ],
  }),
  component: SettingsEstablishmentPage,
});

type AppSettingsRow = {
  id: number;
  shop_name: string | null;
  phone: string | null;
  payment_methods: unknown;
  business_name?: string | null;
  business_activity?: string | null;
  address?: string | null;
  contact_numbers?: string | null;
  logo_url?: string | null;
  marketing_slogans?: string[];
  active_marketing_slogan_index?: number;
};

function SettingsEstablishmentPage() {
  const { canAction } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessActivity, setBusinessActivity] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumbers, setContactNumbers] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [slogansText, setSlogansText] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const row = data as AppSettingsRow | null;
    setShopName(row?.shop_name ?? "");
    setPhone(row?.phone ?? "");
    setBusinessName(row?.business_name ?? row?.shop_name ?? "");
    setBusinessActivity(row?.business_activity ?? "");
    setAddress(row?.address ?? "");
    setContactNumbers(row?.contact_numbers ?? row?.phone ?? "");
    setLogoUrl(row?.logo_url ?? "");
    const sl = Array.isArray(row?.marketing_slogans) ? (row!.marketing_slogans as string[]) : [];
    setSlogansText(sl.join("\n"));
    setActiveIdx(Math.max(0, Number(row?.active_marketing_slogan_index ?? 0)));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canAction("settings.manage")) {
      toast.error("ليس لديك صلاحية إدارة الإعدادات");
      return;
    }
    setBusy(true);
    const slogans = slogansText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const idx = Math.min(Math.max(0, activeIdx), Math.max(0, slogans.length - 1));
    const { error } = await supabase
      .from("app_settings")
      .update({
        shop_name: shopName.trim() || null,
        phone: phone.trim() || null,
        business_name: businessName.trim() || null,
        business_activity: businessActivity.trim() || null,
        address: address.trim() || null,
        contact_numbers: contactNumbers.trim() || null,
        logo_url: logoUrl.trim() || null,
        marketing_slogans: slogans,
        active_marketing_slogan_index: slogans.length ? idx : 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم حفظ بيانات المنشأة");
    void load();
  }

  return (
    <AppShell title="بيانات المنشأة والتسويق" roles={["storekeeper"]}>
      <div className="rounded-xl bg-card p-5 shadow-card max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Building2 className="size-5 text-primary" />
          <h2 className="font-bold">المنشأة والسطر التسويقي</h2>
        </div>
        {loading ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المحل (مختصر)</Label>
              <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>اسم المنشأة/الفرع (للطباعة)</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>النشاط</Label>
              <Input value={businessActivity} onChange={(e) => setBusinessActivity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>أرقام التواصل</Label>
              <Input value={contactNumbers} onChange={(e) => setContactNumbers(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>رابط الشعار (URL)</Label>
              <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>عبارات تسويقية (سطر لكل عبارة)</Label>
              <Textarea value={slogansText} onChange={(e) => setSlogansText(e.target.value)} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>رقم العبارة النشطة (يبدأ من 0)</Label>
              <Input
                type="number"
                min={0}
                value={activeIdx}
                onChange={(e) => setActiveIdx(Number(e.target.value) || 0)}
              />
            </div>
            <Button type="submit" disabled={busy || !canAction("settings.manage")}>
              {busy ? <Loader2 className="size-4 animate-spin ml-2" /> : <Save className="size-4 ml-2" />}
              حفظ
            </Button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
