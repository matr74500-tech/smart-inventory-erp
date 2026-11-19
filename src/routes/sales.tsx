import { useState, useRef, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, ShoppingCart, Plus, Minus, Trash2, Printer, CheckCircle2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory, type Product } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { findByCode, PRICE_TIERS, type PriceKey } from "@/lib/inventory-utils";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/sales")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: search["view"] === "invoice" ? "invoice" as const : "pos" as const,
  }),
  head: () => ({
    meta: [
      { title: "وحدة المبيعات ونقطة البيع (POS & NewInvoice) | سهيل سوفت" },
      { name: "description", content: "نظام المبيعات الفوري مع شرائح الأسعار، الباركود، خصم المخزون والطباعة الحرارية وتحديث حسابات العملاء." },
    ],
  }),
  component: SalesPage,
});

type CartItem = { product: Product; qty: number; price: number; tier: PriceKey };
type Customer = Tables<"customers">;
type SalesInvoice = Tables<"sales_invoices">;

function SalesPage() {
  const { canAction } = useAuth();
  const { products, warehouses, qty, reload, currencies, exchangeRates } = useInventory();
  const { view } = Route.useSearch();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drafts, setDrafts] = useState<SalesInvoice[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [q, setQ] = useState("");
  const [warehouse, setWarehouse] = useState(() => warehouses[0]?.id || "");
  const [defaultTier, setDefaultTier] = useState<PriceKey>("price");
  const [currency, setCurrency] = useState("YER");
  const [paymentMethod, setPaymentMethod] = useState("نقدي YER");
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);

  const paymentMethods = JSON.parse(localStorage.getItem("suhail_payment_methods") || '["نقدي YER", "سعودي SAR", "تحويلات شبكات محلية", "آجل"]');

  const refreshDrafts = useCallback(async () => {
    const { data, error } = await supabase.from("sales_invoices").select("*")
      .eq("status", "draft").order("created_at", { ascending: false }).limit(25);
    if (error) toast.error(`تعذر تحميل مسودات البيع: ${error.message}`);
    else setDrafts(data ?? []);
  }, []);

  useEffect(() => {
    void refreshDrafts();
    const channel = supabase.channel("sales-drafts")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_invoices" }, () => void refreshDrafts())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refreshDrafts]);

  useEffect(() => {
    let active = true;
    const loadCustomers = async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("active", true).order("name");
      if (!active) return;
      if (error) toast.error(`تعذر تحميل العملاء: ${error.message}`);
      else setCustomers(data ?? []);
    };
    void loadCustomers();
    const channel = supabase.channel("sales-customers")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => void loadCustomers())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!warehouse && warehouses[0]) setWarehouse(warehouses[0].id);
  }, [warehouses, warehouse]);

  const addToCart = useCallback((p: Product, delta = 1, tier: PriceKey = defaultTier) => {
    const itemPrice = Number(p[tier] ?? p.price ?? 0);
    setCart((items) => {
      const idx = items.findIndex((i) => i.product.id === p.id && i.tier === tier);
      if (idx >= 0) {
        const next = [...items];
        const existing = next[idx];
        if (!existing) return items;
        const newQty = existing.qty + delta;
        if (newQty <= 0) return items.filter((_, i) => i !== idx);
        next[idx] = { ...existing, qty: newQty };
        return next;
      }
      if (delta <= 0) return items;
      return [...items, { product: p, qty: delta, price: itemPrice, tier }];
    });
    setQ("");
  }, [defaultTier]);

  const onScan = useCallback((code: string) => {
    const p = findByCode(products, code);
    if (p) {
      addToCart(p, 1, defaultTier);
      toast.success(`تمت الإضافة: ${p.name} (+1)`);
    } else {
      toast.error("الصنف غير موجود بالباركود المدخل");
    }
  }, [products, addToCart, defaultTier]);

  function updateCartItem(index: number, patch: Partial<CartItem>) {
    setCart((items) => items.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const discountVal = Number(discount) || 0;
  const taxVal = Number(tax) || 0;
  const netTotal = Math.max(0, subtotal - discountVal + taxVal);
  const activeCurrencies = currencies.filter((item) => item.active);
  const currentCurrency = activeCurrencies.find((item) => item.code === currency);
  const currentRate = currency === "YER" ? 1 : exchangeRates.find((rate) => rate.currency_code === currency)?.rate_to_yer;
  const rateMissing = currentRate === undefined || !Number.isFinite(Number(currentRate)) || Number(currentRate) <= 0;
  const finalAmount = rateMissing ? 0 : netTotal / Number(currentRate);

  async function saveDraft(): Promise<string | null> {
    if (!canAction("sales.draft")) {
      toast.error("ليس لديك صلاحية حفظ مسودة بيع");
      return null;
    }
    if (!cart.length) {
      toast.error("السلة فارغة");
      return null;
    }
    if (!warehouse) {
      toast.error("الرجاء اختيار المستودع");
      return null;
    }
    if (rateMissing) {
      toast.error("لا يوجد سعر صرف صالح لهذه العملة");
      return null;
    }

    const selectedCustomer = customers.find((item) => item.id === customerId);
    try {
      const { data, error } = await supabase.rpc("save_sale_draft", {
        _id: draftId,
        _customer_id: selectedCustomer?.id ?? null,
        _customer_name: selectedCustomer?.name ?? null,
        _warehouse: warehouse,
        _currency_code: currency,
        _rate_to_yer: Number(currentRate),
        _payment_method: paymentMethod,
        _affects_drawer: paymentMethod.includes("نقدي") || paymentMethod.startsWith("سعودي"),
        _paid_amount: paymentMethod === "آجل" ? 0 : finalAmount,
        _discount_yer: discountVal,
        _tax_yer: taxVal,
        _notes: null,
        _items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.qty,
          unit_price_yer: item.price,
          price_tier: item.tier,
        })),
      });
      if (error) {
        toast.error(`تعذر حفظ المسودة: ${error.message}`);
        return null;
      }
      setDraftId(data);
      void refreshDrafts();
      return data;
    } catch (error) {
      toast.error(`تعذر الاتصال لحفظ المسودة: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async function postDraft(id: string) {
    if (!canAction("sales.post")) {
      toast.error("ليس لديك صلاحية ترحيل فاتورة البيع");
      return;
    }
    try {
      const { error } = await supabase.rpc("post_sale", { _id: id });
      if (error) {
        toast.error(`تعذر ترحيل الفاتورة؛ حُفظت كمسودة: ${error.message}`);
        return;
      }
      toast.success("تم ترحيل الفاتورة وتحديث المخزون والصندوق");
      setDraftId(null);
      void refreshDrafts();
      setCart([]);
      setDiscount("0");
      setTax("0");
      reload();
    } catch (error) {
      toast.error(`تعذر الاتصال لترحيل الفاتورة؛ بقيت مسودة: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function postSavedDraft() {
    if (!draftId) return;
    setBusy(true);
    try {
      await postDraft(draftId);
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftOnly() {
    setBusy(true);
    try {
      const id = await saveDraft();
      if (id) toast.success("تم حفظ الفاتورة كمسودة");
    } finally {
      setBusy(false);
    }
  }

  async function postCurrentSale() {
    setBusy(true);
    try {
      const id = await saveDraft();
      if (id) await postDraft(id);
    } finally {
      setBusy(false);
    }
  }

  async function loadDraft(invoice: SalesInvoice) {
    const { data, error } = await supabase.from("sales_items").select("*").eq("invoice_id", invoice.id);
    if (error) {
      toast.error(`تعذر تحميل أصناف المسودة: ${error.message}`);
      return;
    }
    const restored: CartItem[] = [];
    for (const line of data ?? []) {
      const product = products.find((item) => item.id === line.product_id);
      if (!product) {
        toast.error(`تعذر استعادة المسودة: الصنف ${line.product_id} غير متاح بصلاحياتك`);
        return;
      }
      const tier = PRICE_TIERS.find((item) => item.key === line.price_tier)?.key ?? "price";
      restored.push({ product, qty: Number(line.quantity), price: Number(line.unit_price_yer), tier });
    }
    setDraftId(invoice.id);
    setCart(restored);
    setCustomerId(invoice.customer_id ?? "");
    setWarehouse(invoice.warehouse_id);
    setCurrency(invoice.currency_code);
    setPaymentMethod(invoice.payment_method);
    setDiscount(String(invoice.discount_yer));
    setTax(String(invoice.tax_yer));
    toast.success(`تم تحميل مسودة الفاتورة #${invoice.number}`);
  }

  const storeInfo = "مكتبة ومحلات الإخوة - ذمار، جولة رداع، سوق عنس، أمام فندق الأهرام، ت: 777758043 - 771508085";

  return (
    <AppShell title="وحدة المبيعات والفواتير (POS & NewInvoice)">
      {drafts.length > 0 && (
        <section className="mb-4 rounded-xl bg-card p-4 shadow-card">
          <h2 className="mb-3 font-bold">المسودات المحفوظة</h2>
          <div className="flex flex-wrap gap-2">
            {drafts.map((invoice) => (
              <Button key={invoice.id} type="button" variant={draftId === invoice.id ? "default" : "outline"}
                disabled={!products.length} onClick={() => void loadDraft(invoice)}>
                #{invoice.number} · {invoice.customer_name || "عميل نقدي"} · {Number(invoice.total_yer).toFixed(2)} ر.ي
              </Button>
            ))}
          </div>
        </section>
      )}
      <Tabs defaultValue={view} dir="rtl" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="pos">نقطة البيع السريع (FastPOS)</TabsTrigger>
          <TabsTrigger value="invoice">فاتورة مبيعات تفصيلية (NewInvoice)</TabsTrigger>
        </TabsList>

        <TabsContent value="pos" className="space-y-4">
          <div className="grid lg:grid-cols-[1.5fr_1fr] gap-5">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-56">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input className="pr-10 h-11 bg-card text-base" placeholder="امسح الباركود أو ابحث عن الصنف بالاسم أو الكود…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const p = findByCode(products, q) || products.find(x => x.name.includes(q));
                      if (p) { addToCart(p, 1, defaultTier); } else { toast.error("الصنف غير موجود"); }
                    }
                  }} />
                </div>
                <BarcodeScanner onDetected={onScan} />
                <Select value={defaultTier} onValueChange={(v) => setDefaultTier(v as PriceKey)}>
                  <SelectTrigger className="w-36 bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRICE_TIERS.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto p-1">
                {products.filter(p => !q || p.name.includes(q) || p.code?.includes(q) || p.barcode?.includes(q)).slice(0, 36).map(p => (
                  <button key={p.id} onClick={() => addToCart(p, 1, defaultTier)} className="rounded-xl bg-card shadow-card p-3 text-right hover:border-primary border transition-all flex flex-col justify-between h-28">
                    <div className="font-semibold text-sm line-clamp-2">{p.name}</div>
                    <div className="flex justify-between items-end mt-2"><span className="text-primary font-bold">{Number(p[defaultTier] ?? p.price)} ر.ي</span><span className="text-xs text-muted-foreground">الرصيد: {qty(p.id)}</span></div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-card shadow-card p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><ShoppingCart className="size-5 text-primary" /> سلة المبيعات الحالية</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto divide-y">
                  {cart.map((item, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{item.product.name} <span className="text-xs text-muted-foreground">({PRICE_TIERS.find(t => t.key === item.tier)?.label})</span></div>
                        <div className="text-xs text-muted-foreground">{item.price} ر.ي × {item.qty}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => addToCart(item.product, -1, item.tier)}><Minus className="size-3" /></Button>
                        <Input className="w-16 h-8 text-center" type="number" min="0.01" step="any" aria-label={`كمية ${item.product.name}`} value={item.qty} onChange={(e) => {
                          const qty = Number(e.target.value);
                          if (Number.isFinite(qty) && qty > 0) updateCartItem(idx, { qty });
                        }} />
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => addToCart(item.product, 1, item.tier)}><Plus className="size-3" /></Button>
                      </div>
                      <Input className="w-24 h-8" type="number" min="0" step="any" aria-label={`سعر ${item.product.name}`} value={item.price} disabled={!canAction("sales.override_price")} onChange={(e) => {
                        const price = Number(e.target.value);
                        if (Number.isFinite(price) && price >= 0) updateCartItem(idx, { price });
                      }} />
                    </div>
                  ))}
                  {cart.length === 0 && <div className="py-12 text-center text-muted-foreground text-sm">السلة فارغة — امسح صنفاً للبدء</div>}
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>المستودع</Label>
                    <Select value={warehouse} onValueChange={setWarehouse}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div className="space-y-1"><Label>طريقة الدفع</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{paymentMethods.map((m: string) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div className="space-y-1"><Label>العميل</Label>
                    <Select value={customerId || "__cash__"} onValueChange={(value) => setCustomerId(value === "__cash__" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="__cash__">عميل نقدي عام</SelectItem>{customers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
                  </div>
                  <div className="space-y-1"><Label>عملة الفاتورة</Label>
                    <Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{activeCurrencies.map((item) => <SelectItem key={item.code} value={item.code}>{item.name} ({item.code})</SelectItem>)}</SelectContent></Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>الخصم</Label><Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></div>
                  <div className="space-y-1"><Label>الضريبة</Label><Input type="number" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" /></div>
                </div>

                <div className="flex justify-between items-center text-lg font-bold pt-2 border-t">
                  <span>الإجمالي النهائي:</span>
                  <span className="text-primary">{finalAmount.toFixed(2)} {currentCurrency?.code ?? currency}</span>
                </div>
                {rateMissing && <p className="text-sm text-destructive">لا يوجد سعر صرف صالح لهذه العملة. حدّثه من الإعدادات قبل إتمام البيع.</p>}

                <div className="grid gap-2">
                  <Button variant="outline" className="w-full" disabled={busy || rateMissing || !cart.length || !canAction("sales.draft")} onClick={saveDraftOnly}>حفظ كمسودة</Button>
                  {draftId && <Button variant="outline" className="w-full" disabled={busy || !canAction("sales.post")} onClick={postSavedDraft}>ترحيل المسودة</Button>}
                  <Button className="w-full h-12 text-base font-bold" disabled={busy || rateMissing || !cart.length || !canAction("sales.post")} onClick={postCurrentSale}>
                    {busy ? "جاري الحفظ والترحيل..." : "حفظ وترحيل البيع"}
                  </Button>
                </div>
                <div className="text-[10px] text-center text-muted-foreground leading-tight">{storeInfo}</div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="invoice" className="space-y-4">
          <div className="rounded-xl bg-card shadow-card p-6 space-y-4 max-w-4xl mx-auto">
            <div className="border-b pb-4 text-center">
              <h2 className="font-bold text-xl">{storeInfo}</h2>
              <p className="text-xs text-muted-foreground mt-1">فاتورة مبيعات تفصيلية (NewInvoice)</p>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1"><Label>العميل</Label>
                <Select value={customerId || "__cash__"} onValueChange={(value) => setCustomerId(value === "__cash__" ? "" : value)}><SelectTrigger><SelectValue placeholder="عميل نقدي عام" /></SelectTrigger>
                  <SelectContent><SelectItem value="__cash__">عميل نقدي عام</SelectItem>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>مستودع الصرف</Label>
                <Select value={warehouse} onValueChange={setWarehouse}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>شريحة الأسعار الافتراضية</Label>
                <Select value={defaultTier} onValueChange={(v) => setDefaultTier(v as PriceKey)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRICE_TIERS.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>عملة الفاتورة</Label>
                <Select value={currency} onValueChange={setCurrency}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{activeCurrencies.map((item) => <SelectItem key={item.code} value={item.code}>{item.name} ({item.code})</SelectItem>)}</SelectContent></Select>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input className="h-11 bg-card" placeholder="ابحث عن صنف لإضافته للفاتورة التفصيلية…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <BarcodeScanner onDetected={onScan} />
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right">الصنف</th>
                    <th className="p-3 text-right">الشريحة</th>
                    <th className="p-3 text-right">السعر</th>
                    <th className="p-3 text-right">الكمية</th>
                    <th className="p-3 text-right">الإجمالي</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cart.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/50">
                      <td className="p-3 font-medium">{item.product.name}</td>
                      <td className="p-3 text-xs">{PRICE_TIERS.find(t => t.key === item.tier)?.label}</td>
                      <td className="p-3"><Input className="w-24 h-9" type="number" min="0" step="any" aria-label={`سعر ${item.product.name}`} value={item.price} disabled={!canAction("sales.override_price")} onChange={(e) => {
                        const price = Number(e.target.value);
                        if (Number.isFinite(price) && price >= 0) updateCartItem(idx, { price });
                      }} /></td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => addToCart(item.product, -1, item.tier)}><Minus className="size-3" /></Button>
                          <Input className="w-16 h-8 text-center" type="number" min="0.01" step="any" aria-label={`كمية ${item.product.name}`} value={item.qty} onChange={(e) => {
                            const qty = Number(e.target.value);
                            if (Number.isFinite(qty) && qty > 0) updateCartItem(idx, { qty });
                          }} />
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => addToCart(item.product, 1, item.tier)}><Plus className="size-3" /></Button>
                        </div>
                      </td>
                      <td className="p-3 font-bold">{item.qty * item.price} ر.ي</td>
                      <td className="p-3"><Button size="icon" variant="ghost" onClick={() => setCart(cart.filter((_, i) => i !== idx))}><Trash2 className="size-4 text-destructive" /></Button></td>
                    </tr>
                  ))}
                  {cart.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-muted-foreground">لم يتم إضافة أصناف الفاتورة بعد</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <div className="text-sm font-semibold">عدد الأصناف: {cart.length}</div>
              <div className="text-xl font-bold text-primary">المجموع الكلي: {finalAmount.toFixed(2)} {currentCurrency?.code ?? currency}</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => window.print()}><Printer className="size-4 ml-1.5" /> طباعة حرارية</Button>
              <Button variant="outline" onClick={saveDraftOnly} disabled={busy || rateMissing || !cart.length || !canAction("sales.draft")}>حفظ مسودة</Button>
              {draftId && <Button variant="outline" onClick={postSavedDraft} disabled={busy || !canAction("sales.post")}>ترحيل المسودة</Button>}
              <Button onClick={postCurrentSale} disabled={busy || rateMissing || !cart.length || !canAction("sales.post")}>حفظ وترحيل الفاتورة</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
