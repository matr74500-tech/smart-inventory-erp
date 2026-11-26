-- 0027_db_hardening_and_offline_traces.sql
--
-- مرحلة قاعدة بيانات (0027):
-- توحيد الترحيلات، تصليح set_stock لتكون آمنة لإعادة التشغيل، إضافة تتبع لعمليات الأوفلاين،
-- وضبط قيود نافعة لا تؤثر على واجهات المستخدم أو إعدادات الأندرويد.

-- ----------------------------------------------------------------------------
-- 1) ضمان الرصيد غير السالب في public.stock
-- ----------------------------------------------------------------------------
UPDATE public.stock
SET quantity = 0
WHERE quantity < 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stock_quantity_non_negative'
      AND conrelid = 'public.stock'::regclass
  ) THEN
    ALTER TABLE public.stock
      ADD CONSTRAINT stock_quantity_non_negative CHECK (quantity >= 0);
  END IF;
END $$;

ALTER TABLE public.stock VALIDATE CONSTRAINT stock_quantity_non_negative;

-- ----------------------------------------------------------------------------
-- 2) تمديد تتبع حركات المخزون بعدم التساوي (idempotency trace marker)
-- ----------------------------------------------------------------------------
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS operation_id uuid;
CREATE INDEX IF NOT EXISTS stock_movements_operation_id_idx
  ON public.stock_movements (operation_id);
CREATE INDEX IF NOT EXISTS stock_movements_kind_created_idx
  ON public.stock_movements (kind, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3) تتبع بنى أوفلاين: قبول عمليات إعادة تشغيل دون تكرار تأثيرات حركات المخزون
-- ----------------------------------------------------------------------------
ALTER TABLE public.offline_operation_receipts
  ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS operation_id uuid UNIQUE;
CREATE INDEX IF NOT EXISTS sales_invoices_operation_id_idx
  ON public.sales_invoices (operation_id);

GRANT SELECT ON public.offline_operation_receipts TO authenticated;
GRANT ALL ON public.offline_operation_receipts TO service_role;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.offline_operation_receipts;

-- ----------------------------------------------------------------------------
-- 4) set_stock: تكوين لجرد/تعيين مخزون أصبح آمانًا لإعادة التشغيل
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_stock(
  _product uuid,
  _warehouse uuid,
  _qty numeric,
  _kind text DEFAULT 'count',
  _operation_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  old_qty numeric;
  delta numeric;
BEGIN
  IF NOT public.can_manage_stock(auth.uid()) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  IF _qty < 0 THEN
    RAISE EXCEPTION 'الكمية لا يمكن أن تكون سالبة';
  END IF;

  SELECT quantity INTO old_qty
  FROM public.stock
  WHERE product_id = _product AND warehouse_id = _warehouse;

  IF old_qty IS DISTINCT FROM _qty THEN
    delta := _qty - coalesce(old_qty, 0);
    INSERT INTO public.stock (product_id, warehouse_id, quantity, updated_at)
    VALUES (_product, _warehouse, _qty, now())
    ON CONFLICT (product_id, warehouse_id) DO UPDATE
      SET quantity = excluded.quantity, updated_at = now();

    INSERT INTO public.stock_movements (product_id, warehouse_id, kind, quantity, user_id, operation_id)
    VALUES (_product, _warehouse, _kind, delta, auth.uid(), _operation_id);
  ELSE
    UPDATE public.stock
    SET updated_at = now()
    WHERE product_id = _product AND warehouse_id = _warehouse;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.set_stock(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock(uuid, uuid, numeric, text, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) أفراد أوفلاين مرتبطة بـ offline_operation_receipts لضمان التأثير مرة واحدة
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_stock_offline(
  _operation_id uuid,
  _product uuid,
  _warehouse uuid,
  _qty numeric,
  _kind text DEFAULT 'count'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.offline_operation_receipts
    WHERE operation_id = _operation_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.offline_operation_receipts (operation_id, operation_kind, user_id)
  VALUES (_operation_id, 'set_stock_offline', auth.uid())
  ON CONFLICT (operation_id) DO NOTHING;

  PERFORM public.set_stock(_product, _warehouse, _qty, coalesce(_kind, 'count'), _operation_id);
END
$$;

CREATE OR REPLACE FUNCTION public.set_stock_batch_offline(
  _operation_id uuid,
  _warehouse uuid,
  _kind text,
  _items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  item jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.offline_operation_receipts
    WHERE operation_id = _operation_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.offline_operation_receipts (operation_id, operation_kind, user_id)
  VALUES (_operation_id, 'set_stock_batch_offline', auth.uid())
  ON CONFLICT (operation_id) DO NOTHING;

  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    PERFORM public.set_stock(
      (item->>'product_id')::uuid,
      _warehouse,
      (item->>'quantity')::numeric,
      _kind,
      _operation_id
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.transfer_shelf_stock_offline(
  _operation_id uuid,
  _product uuid,
  _from_wh uuid,
  _to_wh uuid,
  _qty numeric,
  _from_shelf text DEFAULT '',
  _to_shelf text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.offline_operation_receipts
    WHERE operation_id = _operation_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.offline_operation_receipts (operation_id, operation_kind, user_id, note)
  VALUES (
    _operation_id,
    'transfer_shelf_stock_offline',
    auth.uid(),
    concat(_from_shelf, ' -> ', _to_shelf)
  )
  ON CONFLICT (operation_id) DO NOTHING;

  PERFORM public.transfer_stock(_product, _from_wh, _to_wh, _qty);
END
$$;

REVOKE ALL ON FUNCTION public.set_stock_offline(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_stock_batch_offline(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_shelf_stock_offline(uuid, uuid, uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock_offline(uuid, uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_stock_batch_offline(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_shelf_stock_offline(uuid, uuid, uuid, uuid, numeric, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) بذور لفائدة استخدامها: المستودعات، العملات، أسعار الصرف المطلوبة حاليًا
-- ----------------------------------------------------------------------------
INSERT INTO public.warehouses (name)
VALUES ('المستودع الرئيسي'), ('فرع المبيعات')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.exchange_rates (currency_code, rate_to_yer)
SELECT code, expected_rate
FROM (VALUES ('YER', 1), ('SAR', 140), ('USD', 532)) AS v(code, expected_rate)
WHERE NOT EXISTS (
  SELECT 1 FROM public.exchange_rates e WHERE e.currency_code = v.code
);

ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.warehouses;
