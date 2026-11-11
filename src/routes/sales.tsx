import { useState, useRef, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, ShoppingCart, Plus, Minus, Trash2, Printer, CheckCircle2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useInventory, type Product } from "@/hooks/use-inventory";
import { useAuth } from "@/lib/auth";
import { findByCode, logMovement, PRICE_TIERS, type PriceKey } from "@/lib/inventory-utils";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "وحدة المبيعات ونقطة البيع (POS & NewInvoice) | سهيل سوفت" },
      { name: "description", content: "نظام المبيعات الفوري مع شرائح الأسعار، الباركود، خصم المخزون والطباعة الحرارية وتحديث حسابات العملاء." },
    ],
  }),
  component: SalesPage,
});

type CartItem = { product: Product; qty: number; price: number; tier: PriceKey };

function SalesPage() {
  const { canAction } = useAuth();
  const { products, warehouses, qty, reload } = useInventory();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [q, setQ] = useState("");
  const [warehouse, setWarehouse] = useState(() => warehouses[0]?.id || "");
  const [defaultTier, setDefaultTier] = useState<PriceKey>("price");
  const [currency, setCurrency] = useState("YER");
  const [paymentMethod, setPaymentMethod] = useState("نقدي YER");
  const [customer, setCustomer] = useState("");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [busy, setBusy] = useState(false);

  const currencies = JSON.parse(localStorage.getItem("suhail_currencies") || '[{"code":"YER","name":"ريال يمني","rate":1},{"code":"SAR","name":"ريال سعودي","rate":140}]');
  const paymentMethods = JSON.parse(localStorage.getItem("suhail_payment_methods") || '["نقدي YER", "سعودي SAR", "تحويلات شبكات محلية", "آجل"]');
  const customersList = JSON.parse(localStorage.getItem("suhail_customers") || '[]');

  useEffect(() => {
    if (!warehouse && warehouses.length > 0) setWarehouse(warehouses[0].id);
  }, [warehouses, warehouse]);

  const addToCart = useCallback((p: Product, delta = 1, tier: PriceKey = defaultTier) => {
    const itemPrice = Number(p[tier] ?? p.price ?? 0);
    setCart((items) => {
      const idx = items.findIndex((i) => i.product.id === p.id && i.tier === tier);
      if (idx >= 0) {
        const next = [...items];
        const newQty = next[idx]!.qty + delta;
        if (newQty <= 0) return items.filter((_, i) => i !== idx);
        next[idx] = { ...next[idx]!, qty: newQty };
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

  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const discountVal = Number(discount) || 0;
  const taxVal = Number(tax) || 0;
  const netTotal = Math.max(0, subtotal - discountVal + taxVal);
  const currentCurrencyObj = currencies.find((c: any) => c.code === currency) || { rate: 1 };
  const finalAmount = currency === "SAR" ? netTotal / Number(currentCurrencyObj.rate || 140) : netTotal;

  async function checkout() {
    if (!canAction("purchases.post")) return toast.error("ليس لديك صلاحية اعتماد المبيعات");
    if (!cart.length) return toast.error("السلة فارغة");
    if (!warehouse) return toast.error("الرجاء اختيار المستودع");

    setBusy(true);
    try {
      // Real-time synchronization with inventory & customer ledger
      for (const item of cart) {
        logMovement(item.product.id, "مبيعات", item.qty, `فاتورة مبيعات (${paymentMethod}) - السعر: ${item.price} - العميل: ${customer || "نقدي"}`);
      }

      if (customer) {
        const storedCusts = JSON.parse(localStorage.getItem("suhail_customers") || "[]");
        const updated = storedCusts.map((c: any) => {
          if (c.name === customer || c.id === customer) {
            const newBal = Number(c.balance || 0) + (paymentMethod === "آجل" ? finalAmount : 0);
            return { ...c, balance: newBal };
          }
          return c;
        });
        localStorage.setItem("suhail_customers", JSON.stringify(updated));
      }

      toast.success("تم إتمام عملية البيع، وتحديث المخزون وحساب العميل بنجاح");
      setCart([]);
      setDiscount("0");
      setTax("0");
      reload?.();
    } catch (err: any) {
      toast.error(err?.message || "حدث خطأ أثناء إتمام العملية");
    } finally {
      setBusy(false);
    }
  }

  const storeInfo = "مكتبة ومحلات الإخوة - ذمار، جولة رداع، سوق عنس، أمام فندق الأهرام، ت: 777758043 - 771508085";

  return (
    <AppShell title="وحدة المبيعات والفواتير (POS & NewInvoice)">
      <Tabs defaultValue="pos" dir="rtl" className="space-y-4">
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
                        <span className="w-8 text-center font-bold text-sm">{item.qty}</span>
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => addToCart(item.product, 1, item.tier)}><Plus className="size-3" /></Button>
                      </div>
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
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>الخصم</Label><Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></div>
                  <div className="space-y-1"><Label>الضريبة</Label><Input type="number" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0" /></div>
                </div>

                <div className="flex justify-between items-center text-lg font-bold pt-2 border-t">
                  <span>الإجمالي النهائي:</span>
                  <span className="text-primary">{finalAmount.toFixed(2)} {currency === "SAR" ? "ر.س" : "ر.ي"}</span>
                </div>

                <Button className="w-full h-12 text-base font-bold" disabled={busy || !cart.length} onClick={checkout}>
                  {busy ? "جاري الإتمام..." : "إتمام البيع والطباعة الحرارية"}
                </Button>
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
                <Select value={customer} onValueChange={setCustomer}><SelectTrigger><SelectValue placeholder="عميل نقدي عام" /></SelectTrigger>
                  <SelectContent><SelectItem value="">عميل نقدي عام</SelectItem>{customersList.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>مستودع الصرف</Label>
                <Select value={warehouse} onValueChange={setWarehouse}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1"><Label>شريحة الأسعار الافتراضية</Label>
                <Select value={defaultTier} onValueChange={(v) => setDefaultTier(v as PriceKey)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRICE_TIERS.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent></Select>
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
                      <td className="p-3">{item.price}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => addToCart(item.product, -1, item.tier)}><Minus className="size-3" /></Button>
                          <span className="w-8 text-center font-bold">{item.qty}</span>
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
              <div className="text-xl font-bold text-primary">المجموع الكلي: {finalAmount.toFixed(2)} ر.ي</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => window.print()}><Printer className="size-4 ml-1.5" /> طباعة حرارية</Button>
              <Button onClick={checkout} disabled={busy || !cart.length}>اعتماد وترحيل الفاتورة</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
