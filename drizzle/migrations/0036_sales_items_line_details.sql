-- Batch 2: per-line warehouse/unit/bonus/discount/tax/note + draft/post logic
ALTER TABLE public.sales_items
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_name text,
  ADD COLUMN IF NOT EXISTS bonus_qty numeric NOT NULL DEFAULT 0 CHECK (bonus_qty >= 0),
  ADD COLUMN IF NOT EXISTS line_discount_yer numeric NOT NULL DEFAULT 0 CHECK (line_discount_yer >= 0),
  ADD COLUMN IF NOT EXISTS line_tax_yer numeric NOT NULL DEFAULT 0 CHECK (line_tax_yer >= 0),
  ADD COLUMN IF NOT EXISTS note text;

CREATE INDEX IF NOT EXISTS sales_items_warehouse_idx ON public.sales_items (warehouse_id);

-- Replace save_sale_draft: items may include warehouse_id, unit_name, bonus_qty, line_discount_yer, line_tax_yer, note
CREATE OR REPLACE FUNCTION public.save_sale_draft(
  _id uuid, _customer_id uuid, _customer_name text, _warehouse uuid,
  _currency_code text, _rate_to_yer numeric, _payment_method text,
  _affects_drawer boolean, _paid_amount numeric, _discount_yer numeric,
  _tax_yer numeric, _notes text, _items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE invoice_id uuid; item jsonb; subtotal numeric := 0; invoice_status text;
  current_rate numeric; quantity numeric; price numeric; product_id uuid; tier text;
  line_wh uuid; line_unit text; line_bonus numeric; line_disc numeric; line_tax numeric; line_note text;
  line_base numeric; line_total numeric;
BEGIN
  IF NOT public.employee_can(auth.uid(), 'pages', 'sales')
    OR NOT public.employee_can(auth.uid(), 'actions', 'sales.draft') THEN
    RAISE EXCEPTION 'غير مصرح بحفظ فواتير البيع';
  END IF;
  IF _warehouse IS NULL OR _rate_to_yer IS NULL OR _rate_to_yer <= 0
    OR _paid_amount IS NULL OR _paid_amount < 0
    OR coalesce(_discount_yer,0) < 0 OR coalesce(_tax_yer,0) < 0
    OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items)=0 THEN
    RAISE EXCEPTION 'بيانات الفاتورة غير صالحة';
  END IF;
  SELECT rate_to_yer INTO current_rate FROM public.exchange_rates
    WHERE currency_code=_currency_code ORDER BY effective_at DESC, created_at DESC LIMIT 1;
  IF current_rate IS NULL OR current_rate <> _rate_to_yer THEN
    RAISE EXCEPTION 'تغير سعر الصرف؛ حدّث الفاتورة بالسعر الحالي';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=_warehouse) THEN RAISE EXCEPTION 'المستودع غير موجود'; END IF;
  IF _customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id=_customer_id AND active) THEN
    RAISE EXCEPTION 'العميل غير موجود أو غير نشط';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.sales_invoices (customer_id, customer_name, warehouse_id, currency_code, exchange_rate_to_yer,
      payment_method, affects_drawer, paid_amount, discount_yer, tax_yer, notes, created_by)
    VALUES (_customer_id, nullif(btrim(_customer_name),''), _warehouse, _currency_code, _rate_to_yer,
      coalesce(_payment_method,'نقدي'), coalesce(_affects_drawer,true), _paid_amount,
      coalesce(_discount_yer,0), coalesce(_tax_yer,0), _notes, auth.uid())
    RETURNING id INTO invoice_id;
  ELSE
    SELECT status INTO invoice_status FROM public.sales_invoices WHERE id=_id AND created_by=auth.uid() FOR UPDATE;
    IF invoice_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'لا يمكن تعديل فاتورة غير مسودة'; END IF;
    invoice_id := _id;
    UPDATE public.sales_invoices SET customer_id=_customer_id, customer_name=nullif(btrim(_customer_name),''),
      warehouse_id=_warehouse, currency_code=_currency_code, exchange_rate_to_yer=_rate_to_yer,
      payment_method=coalesce(_payment_method,'نقدي'), affects_drawer=coalesce(_affects_drawer,true),
      paid_amount=_paid_amount, discount_yer=coalesce(_discount_yer,0), tax_yer=coalesce(_tax_yer,0),
      notes=_notes WHERE id=invoice_id;
    DELETE FROM public.sales_items WHERE sales_items.invoice_id=invoice_id;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    product_id := (item->>'product_id')::uuid;
    quantity := (item->>'quantity')::numeric;
    price := (item->>'unit_price_yer')::numeric;
    tier := coalesce(nullif(trim(item->>'price_tier'),''),'price');
    line_wh := nullif(item->>'warehouse_id','')::uuid;
    line_unit := nullif(trim(item->>'unit_name'),'');
    line_bonus := coalesce(nullif(item->>'bonus_qty','')::numeric, 0);
    line_disc := coalesce(nullif(item->>'line_discount_yer','')::numeric, 0);
    line_tax := coalesce(nullif(item->>'line_tax_yer','')::numeric, 0);
    line_note := nullif(trim(item->>'note'),'');
    IF line_wh IS NULL THEN line_wh := _warehouse; END IF;
    IF quantity IS NULL OR quantity <= 0 OR price IS NULL OR price < 0
      OR line_bonus < 0 OR line_disc < 0 OR line_tax < 0
      OR tier NOT IN ('price','price_special','price_half','price_wholesale','price_bulk') THEN
      RAISE EXCEPTION 'بيانات صنف غير صالحة';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=product_id) THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=line_wh) THEN RAISE EXCEPTION 'مستودع الصنف غير موجود'; END IF;
    IF NOT public.employee_can(auth.uid(), 'actions', 'sales.override_price') AND NOT EXISTS (
      SELECT 1 FROM public.products p WHERE p.id=product_id AND
        CASE tier
          WHEN 'price' THEN p.price
          WHEN 'price_special' THEN p.price_special
          WHEN 'price_half' THEN p.price_half
          WHEN 'price_wholesale' THEN p.price_wholesale
          ELSE p.price_bulk
        END = price
    ) THEN RAISE EXCEPTION 'لا تملك صلاحية تعديل سعر الصنف'; END IF;
    line_base := quantity * price;
    line_total := greatest(0, line_base - line_disc + line_tax);
    INSERT INTO public.sales_items (invoice_id, product_id, quantity, unit_price_yer, price_tier, total_yer,
      warehouse_id, unit_name, bonus_qty, line_discount_yer, line_tax_yer, note)
      VALUES (invoice_id, product_id, quantity, price, tier, line_total,
        line_wh, line_unit, line_bonus, line_disc, line_tax, line_note);
    subtotal := subtotal + line_total;
  END LOOP;
  IF _paid_amount * _rate_to_yer > greatest(0, subtotal-coalesce(_discount_yer,0)+coalesce(_tax_yer,0)) THEN
    RAISE EXCEPTION 'المبلغ المدفوع أكبر من إجمالي الفاتورة';
  END IF;
  UPDATE public.sales_invoices SET subtotal_yer=subtotal,
    total_yer=greatest(0, subtotal-coalesce(discount_yer,0)+coalesce(tax_yer,0)) WHERE id=invoice_id;
  RETURN invoice_id;
END $$;

REVOKE ALL ON FUNCTION public.save_sale_draft(uuid,uuid,text,uuid,text,numeric,text,boolean,numeric,numeric,numeric,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sale_draft(uuid,uuid,text,uuid,text,numeric,text,boolean,numeric,numeric,numeric,text,jsonb) TO authenticated;

-- Replace post_sale: use per-line warehouse and deduct quantity+bonus_qty
CREATE OR REPLACE FUNCTION public.post_sale(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.sales_invoices; line record; available numeric; due_yer numeric; wh uuid; deduct_qty numeric;
BEGIN
  IF NOT public.employee_can(auth.uid(), 'pages', 'sales')
    OR NOT public.employee_can(auth.uid(), 'actions', 'sales.post')
    OR NOT public.employee_can(auth.uid(), 'fields', 'quantity') THEN
    RAISE EXCEPTION 'غير مصرح بترحيل فاتورة البيع';
  END IF;
  SELECT * INTO inv FROM public.sales_invoices WHERE id=_id FOR UPDATE;
  IF inv.id IS NULL OR inv.status <> 'draft' THEN RAISE EXCEPTION 'الفاتورة غير موجودة أو ليست مسودة'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_items WHERE invoice_id=inv.id) THEN RAISE EXCEPTION 'الفاتورة فارغة'; END IF;
  IF inv.affects_drawer AND EXISTS (
    SELECT 1 FROM public.daily_cash_closings WHERE business_date=current_date AND currency_code=inv.currency_code
  ) THEN RAISE EXCEPTION 'تم إقفال الصندوق لهذه العملة اليوم'; END IF;
  FOR line IN
    SELECT product_id,
      coalesce(warehouse_id, inv.warehouse_id) AS wh_id,
      sum(quantity + coalesce(bonus_qty,0)) AS total_qty
    FROM public.sales_items WHERE invoice_id=inv.id GROUP BY product_id, coalesce(warehouse_id, inv.warehouse_id) ORDER BY product_id
  LOOP
    SELECT quantity INTO available FROM public.stock
      WHERE product_id=line.product_id AND warehouse_id=line.wh_id FOR UPDATE;
    IF coalesce(available,0) < line.total_qty THEN RAISE EXCEPTION 'الرصيد غير كافٍ للصنف %', line.product_id; END IF;
    UPDATE public.stock SET quantity=quantity-line.total_qty, updated_at=now()
      WHERE product_id=line.product_id AND warehouse_id=line.wh_id;
    INSERT INTO public.stock_movements (product_id, warehouse_id, kind, quantity, user_id, note)
      VALUES (line.product_id, line.wh_id, 'sale', -line.total_qty, auth.uid(), 'فاتورة بيع '||inv.number);
  END LOOP;
  due_yer := greatest(0, inv.total_yer - inv.paid_amount*inv.exchange_rate_to_yer);
  IF inv.customer_id IS NOT NULL THEN
    UPDATE public.customers SET balance_yer=balance_yer+due_yer, last_sale_at=now(), updated_at=now()
      WHERE id=inv.customer_id;
  END IF;
  IF inv.paid_amount > 0 AND inv.affects_drawer THEN
    INSERT INTO public.cash_transactions (source_type, source_id, currency_code, amount, rate_to_yer,
      payment_method, affects_drawer, created_by)
    VALUES ('sale', inv.id, inv.currency_code, inv.paid_amount, inv.exchange_rate_to_yer,
      inv.payment_method, true, auth.uid());
  END IF;
  UPDATE public.sales_invoices SET status='posted', posted_at=now() WHERE id=inv.id;
END $$;

REVOKE ALL ON FUNCTION public.post_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_sale(uuid) TO authenticated;
