-- Batch 3: document numbering sequences + backdated document dates
-- ----------------------------------------------------------------------------
-- 1) Table: document numbering settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_numbering_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL UNIQUE CHECK (
    document_type IN (
      'sales_invoice','sales_return','voucher_receipt','voucher_payment',
      'purchase_invoice','purchase_return','purchase_order','quotation'
    )
  ),
  prefix text NOT NULL DEFAULT '',
  suffix text NOT NULL DEFAULT '',
  pad_length integer NOT NULL DEFAULT 6 CHECK (pad_length >= 1 AND pad_length <= 12),
  reset_policy text NOT NULL DEFAULT 'never' CHECK (reset_policy IN ('never','yearly','monthly','daily')),
  start_number bigint NOT NULL DEFAULT 1 CHECK (start_number >= 0),
  allow_manual_edit boolean NOT NULL DEFAULT false,
  include_branch boolean NOT NULL DEFAULT false,
  include_user boolean NOT NULL DEFAULT false,
  include_year boolean NOT NULL DEFAULT true,
  include_month boolean NOT NULL DEFAULT false,
  branch_label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_numbering_settings TO authenticated;
GRANT ALL ON public.document_numbering_settings TO service_role;
ALTER TABLE public.document_numbering_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read document numbering" ON public.document_numbering_settings;
CREATE POLICY "read document numbering" ON public.document_numbering_settings FOR SELECT TO authenticated
  USING (public.employee_can(auth.uid(),'pages','settings') OR public.employee_can(auth.uid(),'pages','sales'));

DROP POLICY IF EXISTS "manage document numbering" ON public.document_numbering_settings;
CREATE POLICY "manage document numbering" ON public.document_numbering_settings FOR ALL TO authenticated
  USING (public.employee_can(auth.uid(),'pages','settings') AND public.employee_can(auth.uid(),'actions','settings.manage'))
  WITH CHECK (public.employee_can(auth.uid(),'pages','settings') AND public.employee_can(auth.uid(),'actions','settings.manage'));

-- Sequence state per document type + scope key (period key)
CREATE TABLE IF NOT EXISTS public.document_number_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL,
  scope_key text NOT NULL DEFAULT 'default',
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type, scope_key)
);

GRANT SELECT ON public.document_number_sequences TO authenticated;
GRANT ALL ON public.document_number_sequences TO service_role;
ALTER TABLE public.document_number_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read document number sequences" ON public.document_number_sequences;
CREATE POLICY "read document number sequences" ON public.document_number_sequences FOR SELECT TO authenticated
  USING (public.employee_can(auth.uid(),'pages','settings'));

DROP POLICY IF EXISTS "manage document number sequences" ON public.document_number_sequences;
CREATE POLICY "manage document number sequences" ON public.document_number_sequences FOR ALL TO authenticated
  USING (public.employee_can(auth.uid(),'pages','settings') AND public.employee_can(auth.uid(),'actions','settings.manage'))
  WITH CHECK (public.employee_can(auth.uid(),'pages','settings') AND public.employee_can(auth.uid(),'actions','settings.manage'));

-- Seed defaults
INSERT INTO public.document_numbering_settings (document_type, prefix, include_year, include_month, pad_length, reset_policy)
VALUES
  ('sales_invoice', 'INV-', true, false, 6, 'never'),
  ('sales_return', 'SR-', true, false, 6, 'never'),
  ('voucher_receipt', 'RV-', true, false, 6, 'never'),
  ('voucher_payment', 'PV-', true, false, 6, 'never'),
  ('purchase_invoice', 'PINV-', true, false, 6, 'never'),
  ('purchase_return', 'PRT-', true, false, 6, 'never'),
  ('purchase_order', 'PO-', true, false, 6, 'never'),
  ('quotation', 'QUO-', true, false, 6, 'never')
ON CONFLICT (document_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.next_document_number(
  _document_type text,
  _period_date date DEFAULT current_date,
  _manual_number text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  cfg public.document_numbering_settings;
  scope_key text := 'default';
  period_part text := '';
  next_val bigint;
  display_no text;
  uname text;
  yr text;
  mo text;
BEGIN
  SELECT * INTO cfg FROM public.document_numbering_settings WHERE document_type = _document_type;
  IF cfg.id IS NULL THEN
    RAISE EXCEPTION 'إعدادات ترقيم غير موجودة للنوع %', _document_type;
  END IF;

  IF _manual_number IS NOT NULL AND btrim(_manual_number) <> '' THEN
    IF NOT cfg.allow_manual_edit THEN
      RAISE EXCEPTION 'التعديل اليدوي لرقم المستند غير مسموح';
    END IF;
    RETURN btrim(_manual_number);
  END IF;

  yr := to_char(coalesce(_period_date, current_date), 'YYYY');
  mo := to_char(coalesce(_period_date, current_date), 'MM');
  IF cfg.reset_policy = 'yearly' THEN
    period_part := yr;
  ELSIF cfg.reset_policy = 'monthly' THEN
    period_part := yr || mo;
  ELSIF cfg.reset_policy = 'daily' THEN
    period_part := to_char(coalesce(_period_date, current_date), 'YYYYMMDD');
  ELSE
    period_part := 'all';
  END IF;

  scope_key := _document_type || '|' || period_part;
  IF cfg.include_branch AND cfg.branch_label <> '' THEN
    scope_key := scope_key || '|b:' || cfg.branch_label;
  END IF;
  IF cfg.include_user AND auth.uid() IS NOT NULL THEN
    SELECT username INTO uname FROM public.profiles WHERE id = auth.uid();
    scope_key := scope_key || '|u:' || coalesce(nullif(btrim(uname),''), auth.uid()::text);
  END IF;

  INSERT INTO public.document_number_sequences (document_type, scope_key, last_value, updated_at)
    VALUES (_document_type, scope_key, cfg.start_number, now())
    ON CONFLICT (document_type, scope_key) DO UPDATE SET updated_at = now();

  UPDATE public.document_number_sequences
    SET last_value = CASE
          WHEN public.document_number_sequences.last_value < cfg.start_number THEN cfg.start_number
          ELSE public.document_number_sequences.last_value + 1
        END,
        updated_at = now()
    WHERE document_number_sequences.document_type = _document_type
      AND document_number_sequences.scope_key = scope_key
    RETURNING last_value INTO next_val;

  display_no := cfg.prefix;
  IF cfg.include_branch AND cfg.branch_label <> '' THEN
    display_no := display_no || cfg.branch_label || '-';
  END IF;
  IF cfg.include_user THEN
    SELECT username INTO uname FROM public.profiles WHERE id = auth.uid();
    display_no := display_no || coalesce(nullif(btrim(uname),''), 'U') || '-';
  END IF;
  IF cfg.include_year THEN
    display_no := display_no || yr;
    IF cfg.include_month THEN
      display_no := display_no || '-' || mo;
    END IF;
    display_no := display_no || '-';
  END IF;
  display_no := display_no || lpad(next_val::text, greatest(cfg.pad_length,1), '0') || cfg.suffix;

  PERFORM public.log_system_activity(
    'document_number.generated',
    _document_type,
    NULL,
    jsonb_build_object('scope_key', scope_key, 'display_number', display_no, 'period_date', _period_date)
  );

  RETURN display_no;
END $$;

REVOKE ALL ON FUNCTION public.next_document_number(text,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text,date,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) Backdating / document dates on key tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS document_date date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS is_backdated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS backdate_reason text,
  ADD COLUMN IF NOT EXISTS display_number text;

ALTER TABLE public.sales_returns
  ADD COLUMN IF NOT EXISTS document_date date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS is_backdated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS backdate_reason text,
  ADD COLUMN IF NOT EXISTS display_number text;

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS document_date date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS is_backdated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS backdate_reason text,
  ADD COLUMN IF NOT EXISTS display_number text;

CREATE INDEX IF NOT EXISTS sales_invoices_document_date_idx ON public.sales_invoices (document_date DESC);
CREATE INDEX IF NOT EXISTS sales_returns_document_date_idx ON public.sales_returns (document_date DESC);
CREATE INDEX IF NOT EXISTS vouchers_document_date_idx ON public.vouchers (document_date DESC);

-- Extend save_sale_draft: add _document_date, _is_backdated, _backdate_reason, _manual_number
CREATE OR REPLACE FUNCTION public.save_sale_draft(
  _id uuid, _customer_id uuid, _customer_name text, _warehouse uuid,
  _currency_code text, _rate_to_yer numeric, _payment_method text,
  _affects_drawer boolean, _paid_amount numeric, _discount_yer numeric,
  _tax_yer numeric, _notes text, _items jsonb,
  _document_date date DEFAULT NULL,
  _is_backdated boolean DEFAULT false,
  _backdate_reason text DEFAULT NULL,
  _manual_number text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  invoice_id uuid;
  item jsonb;
  subtotal numeric := 0;
  invoice_status text;
  current_rate numeric;
  quantity numeric;
  price numeric;
  product_id uuid;
  tier text;
  doc_date date;
  dn text;
BEGIN
  IF NOT public.employee_can(auth.uid(), 'pages', 'sales')
    OR NOT public.employee_can(auth.uid(), 'actions', 'sales.draft') THEN
    RAISE EXCEPTION 'غير مصرح بحفظ فواتير البيع';
  END IF;
  doc_date := coalesce(_document_date, current_date);
  IF doc_date > current_date THEN
    RAISE EXCEPTION 'لا يمكن تحديد تاريخ مستقبلي للفاتورة';
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
  IF _manual_number IS NOT NULL AND btrim(_manual_number) <> '' THEN
    dn := public.next_document_number('sales_invoice', doc_date, _manual_number);
  ELSE
    dn := NULL;
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.sales_invoices (customer_id, customer_name, warehouse_id, currency_code, exchange_rate_to_yer,
      payment_method, affects_drawer, paid_amount, discount_yer, tax_yer, notes, created_by,
      document_date, is_backdated, backdate_reason, display_number)
    VALUES (_customer_id, nullif(btrim(_customer_name),''), _warehouse, _currency_code, _rate_to_yer,
      coalesce(_payment_method,'نقدي'), coalesce(_affects_drawer,true), _paid_amount,
      coalesce(_discount_yer,0), coalesce(_tax_yer,0), _notes, auth.uid(),
      doc_date, coalesce(_is_backdated,false) OR doc_date <> current_date, nullif(btrim(_backdate_reason),''), dn)
    RETURNING id INTO invoice_id;
  ELSE
    SELECT status INTO invoice_status FROM public.sales_invoices WHERE id=_id AND created_by=auth.uid() FOR UPDATE;
    IF invoice_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'لا يمكن تعديل فاتورة غير مسودة'; END IF;
    invoice_id := _id;
    UPDATE public.sales_invoices SET customer_id=_customer_id, customer_name=nullif(btrim(_customer_name),''),
      warehouse_id=_warehouse, currency_code=_currency_code, exchange_rate_to_yer=_rate_to_yer,
      payment_method=coalesce(_payment_method,'نقدي'), affects_drawer=coalesce(_affects_drawer,true),
      paid_amount=_paid_amount, discount_yer=coalesce(_discount_yer,0), tax_yer=coalesce(_tax_yer,0),
      notes=_notes, document_date=doc_date,
      is_backdated = coalesce(_is_backdated,false) OR doc_date <> current_date,
      backdate_reason = nullif(btrim(_backdate_reason),''),
      display_number = coalesce(dn, display_number)
    WHERE id=invoice_id;
    DELETE FROM public.sales_items WHERE sales_items.invoice_id=invoice_id;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    product_id := (item->>'product_id')::uuid;
    quantity := (item->>'quantity')::numeric;
    price := (item->>'unit_price_yer')::numeric;
    tier := coalesce(item->>'price_tier','price');
    IF quantity IS NULL OR quantity <= 0 OR price IS NULL OR price < 0
      OR tier NOT IN ('price','price_special','price_half','price_wholesale','price_bulk') THEN
      RAISE EXCEPTION 'بيانات صنف غير صالحة';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=product_id) THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;
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
    INSERT INTO public.sales_items (invoice_id, product_id, quantity, unit_price_yer, price_tier, total_yer)
      VALUES (invoice_id, product_id, quantity, price, tier, quantity*price);
    subtotal := subtotal + quantity*price;
  END LOOP;
  IF _paid_amount * _rate_to_yer > greatest(0, subtotal-coalesce(_discount_yer,0)+coalesce(_tax_yer,0)) THEN
    RAISE EXCEPTION 'المبلغ المدفوع أكبر من إجمالي الفاتورة';
  END IF;
  UPDATE public.sales_invoices SET subtotal_yer=subtotal,
    total_yer=greatest(0, subtotal-discount_yer+tax_yer) WHERE id=invoice_id;
  RETURN invoice_id;
END $$;

REVOKE ALL ON FUNCTION public.save_sale_draft(uuid,uuid,text,uuid,text,numeric,text,boolean,numeric,numeric,numeric,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sale_draft(uuid,uuid,text,uuid,text,numeric,text,boolean,numeric,numeric,numeric,text,jsonb) TO authenticated;

-- Keep offline wrapper compatible (old signature style still works if we call by args? safer: recreate)
CREATE OR REPLACE FUNCTION public.save_sale_draft_offline(
  _id uuid, _customer_id uuid, _customer_name text, _warehouse uuid,
  _currency_code text, _rate_to_yer numeric, _payment_method text,
  _affects_drawer boolean, _paid_amount numeric, _discount_yer numeric,
  _tax_yer numeric, _notes text, _items jsonb,
  _document_date date DEFAULT NULL,
  _is_backdated boolean DEFAULT false,
  _backdate_reason text DEFAULT NULL,
  _manual_number text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public.save_sale_draft(
    _id, _customer_id, _customer_name, _warehouse,
    _currency_code, _rate_to_yer, _payment_method,
    _affects_drawer, _paid_amount, _discount_yer,
    _tax_yer, _notes, _items,
    _document_date, _is_backdated, _backdate_reason, _manual_number
  );
END $$;

REVOKE ALL ON FUNCTION public.save_sale_draft_offline(uuid,uuid,text,uuid,text,numeric,text,boolean,numeric,numeric,numeric,text,jsonb,date,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_sale_draft_offline(uuid,uuid,text,uuid,text,numeric,text,boolean,numeric,numeric,numeric,text,jsonb,date,boolean,text,text) TO authenticated;

-- Update post_sale to allow backdated? keep logic; no change required to stock/cash except it uses existing fields
-- (no body change needed beyond what existed)

-- Vouchers: extend save/post? minimal: add document_date columns already above; keep existing RPCs (they don't set doc date) — optional follow-up
