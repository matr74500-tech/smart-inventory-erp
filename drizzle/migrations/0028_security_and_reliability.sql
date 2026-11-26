-- 0028_security_and_reliability.sql
--
-- مرحلة 2 (Security) + 3 (Reliability):
-- - قوائم سماح خصائص وظيفية جديدة.
-- - قفل صفوف واقعي من داخل الدوال لمنع السباق.
-- - ضغط صلاحيات التنفيذ.
-- - ازدواجية التنبيهات والمحاولة التلقائية أكثر احترامًا للحالة.

-- ----------------------------------------------------------------------------
-- 1) Allowlist الجداول للنسخ الاحتياطي + حد حجم البيانات
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_allowed_tables (
  table_name text PRIMARY KEY,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.backup_allowed_tables TO authenticated;
GRANT ALL ON public.backup_allowed_tables TO service_role;
ALTER TABLE public.backup_allowed_tables ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS allowed_tables text[] NOT NULL DEFAULT ARRAY['app_settings','profiles','user_roles','employee_permissions','categories','units','custom_fields','warehouses','currencies','exchange_rates','products','stock','stock_minimums','stock_movements','purchase_invoices','purchase_items','purchase_orders','purchase_order_items','suppliers','product_suppliers','reorder_requests','customers','customer_payment_plans','sales_invoices','sales_items','vouchers','cash_transactions','daily_cash_closings'];

INSERT INTO public.backup_allowed_tables (table_name, allowed)
VALUES
  ('app_settings', true), ('profiles', true), ('user_roles', true), ('employee_permissions', true),
  ('categories', true), ('units', true), ('custom_fields', true), ('warehouses', true),
  ('currencies', true), ('exchange_rates', true), ('products', true), ('stock', true),
  ('stock_minimums', true), ('stock_movements', true), ('purchase_invoices', true),
  ('purchase_items', true), ('purchase_orders', true), ('purchase_order_items', true),
  ('suppliers', true), ('product_suppliers', true), ('reorder_requests', true),
  ('customers', true), ('customer_payment_plans', true), ('sales_invoices', true),
  ('sales_items', true), ('vouchers', true), ('cash_transactions', true),
  ('daily_cash_closings', true)
ON CONFLICT (table_name) DO UPDATE SET allowed = excluded.allowed;

CREATE OR REPLACE FUNCTION public.backup_allowed_tables()
RETURNS SETOF public.backup_allowed_tables
LANGUAGE sql
STABLE AS $$
  SELECT table_name, allowed, created_at FROM public.backup_allowed_tables ORDER BY table_name
$$;

CREATE OR REPLACE FUNCTION public.backup_create_if_allowed(
  _allowed_tables text[],
  _data jsonb,
  _user_id uuid,
  _size_bytes integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE id uuid;
BEGIN
  IF NOT public.employee_can(auth.uid(), 'pages', 'settings')
     AND NOT public.has_role(auth.uid(), 'admin')
     AND NOT public.has_role(auth.uid(), 'storekeeper') THEN
    RAISE EXCEPTION 'غير مصرح بإنشاء النسخ الاحتياطية';
  END IF;
  IF cardinality(_allowed_tables) = 0
     OR EXISTS (SELECT 1 FROM unnest(_allowed_tables) t WHERE NOT EXISTS (SELECT 1 FROM public.backup_allowed_tables a WHERE a.table_name = t)) THEN
    RAISE EXCEPTION 'الجدول مسموح به ليس موجودًا في قائمة السماح';
  END IF;
  IF _size_bytes > (SELECT coalesce(value::bigint, 4 * 1024 * 1024) FROM public.app_settings WHERE key = 'backup_max_bytes') THEN
    RAISE EXCEPTION 'حجم البيانات المدعوم للنسخ الاحتياطي أكبر من حد السماح';
  END IF;
  INSERT INTO public.backups (allowed_tables, data, user_id, size_bytes)
  VALUES (_allowed_tables, _data, _user_id, _size_bytes) RETURNING id INTO id;
  RETURN id;
END $$;
REVOKE ALL ON FUNCTION public.backup_create_if_allowed(text[], jsonb, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backup_create_if_allowed(text[], jsonb, uuid, integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) Allowlist أسماء RPCs للطابور الأوفلاين (عمليات قابلة للترحيل دون تكرار)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offline_rpc_allowlist (
  rpc_name text PRIMARY KEY,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.offline_rpc_allowlist TO authenticated;
GRANT ALL ON public.offline_rpc_allowlist TO service_role;
ALTER TABLE public.offline_rpc_allowlist ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_offline_rpc_allowed(_rpc_name text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce((SELECT allowed FROM public.offline_rpc_allowlist WHERE rpc_name = _rpc_name), false) $$;

-- ----------------------------------------------------------------------------
-- 3) قفل صفوف + فحوصات دور داخل الدوال (Stage 2/3)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_stock_for_update(_product uuid, _warehouse uuid)
RETURNS void LANGUAGE sql AS $$
SELECT pg_advisory_xact_lock(hashtextextended('stock:' || _product::text || ':' || _warehouse::text, 0));
$$;

CREATE OR REPLACE FUNCTION public.set_stock(
  _product uuid,
  _warehouse uuid,
  _qty numeric,
  _kind text DEFAULT 'count',
  _operation_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE old_qty numeric; delta numeric;
BEGIN
  IF NOT public.can_manage_stock(auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  PERFORM public.lock_stock_for_update(_product, _warehouse);
  IF _qty < 0 THEN RAISE EXCEPTION 'الكمية لا يمكن أن تكون سالبة'; END IF;
  SELECT quantity INTO old_qty FROM public.stock WHERE product_id = _product AND warehouse_id = _warehouse FOR UPDATE;
  IF old_qty IS DISTINCT FROM _qty THEN
    delta := _qty - coalesce(old_qty, 0);
    INSERT INTO public.stock (product_id, warehouse_id, quantity, updated_at) VALUES (_product, _warehouse, _qty, now())
    ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = excluded.quantity, updated_at = now();
    INSERT INTO public.stock_movements (product_id, warehouse_id, kind, quantity, user_id, operation_id)
    VALUES (_product, _warehouse, _kind, delta, auth.uid(), _operation_id);
  ELSE
    UPDATE public.stock SET updated_at = now() WHERE product_id = _product AND warehouse_id = _warehouse;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_stock(uuid, uuid, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock(uuid, uuid, numeric, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_stock(
  _product uuid, _from uuid, _to uuid, _qty numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE avail numeric;
BEGIN
  IF NOT public.can_manage_stock(auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  PERFORM public.lock_stock_for_update(_product, _from);
  IF _qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;
  IF _from = _to THEN RAISE EXCEPTION 'اختر مستودعين مختلفين'; END IF;
  SELECT quantity INTO avail FROM public.stock WHERE product_id=_product AND warehouse_id=_from FOR UPDATE;
  IF coalesce(avail,0) < _qty THEN RAISE EXCEPTION 'الكمية المتوفرة غير كافية'; END IF;
  UPDATE public.stock SET quantity = quantity - _qty, updated_at = now() WHERE product_id=_product AND warehouse_id=_from;
  INSERT INTO public.stock (product_id, warehouse_id, quantity) VALUES (_product,_to,_qty)
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = public.stock.quantity + excluded.quantity, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.transfer_stock(uuid, uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_stock(uuid, uuid, uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_reorder(_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT public.can_manage_stock(auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO r FROM public.reorder_requests WHERE id=_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  UPDATE public.reorder_requests SET status='received', received_at=now() WHERE id=_id;
  INSERT INTO public.stock (product_id, warehouse_id, quantity) VALUES (r.product_id, r.warehouse_id, r.quantity)
  ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = public.stock.quantity + excluded.quantity, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.receive_reorder(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_reorder(uuid) TO authenticated;

-- Offline wrappers: قفل + تحقق دور + تأثير مرة واحدة
CREATE OR REPLACE FUNCTION public.set_stock_offline(
  _operation_id uuid, _product uuid, _warehouse uuid, _qty numeric, _kind text DEFAULT 'count'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'storekeeper') AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'غير مصرح بتشغيل الأوفلاين'; END IF;
  PERFORM public.lock_stock_for_update(_product, _warehouse);
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN; END IF;
  INSERT INTO public.offline_operation_receipts (operation_id, operation_kind, user_id)
    VALUES (_operation_id, 'set_stock_offline', auth.uid()) ON CONFLICT (operation_id) DO NOTHING;
  PERFORM public.set_stock(_product,_warehouse,_qty,coalesce(_kind,'count'),_operation_id);
END $$;

CREATE OR REPLACE FUNCTION public.set_stock_batch_offline(
  _operation_id uuid, _warehouse uuid, _kind text, _items jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'storekeeper') AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'غير مصرح بتشغيل الأوفلاين'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('set_stock_batch_offline:'||_operation_id::text));
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN; END IF;
  INSERT INTO public.offline_operation_receipts (operation_id, operation_kind, user_id)
    VALUES (_operation_id, 'set_stock_batch_offline', auth.uid()) ON CONFLICT (operation_id) DO NOTHING;
  FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
    PERFORM public.set_stock((item->>'product_id')::uuid,_warehouse,(item->>'quantity')::numeric,_kind,_operation_id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.transfer_shelf_stock_offline(
  _operation_id uuid, _product uuid, _from_wh uuid, _to_wh uuid, _qty numeric,
  _from_shelf text DEFAULT '', _to_shelf text DEFAULT ''
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'storekeeper') AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'غير مصرح بتشغيل الأوفلاين'; END IF;
  PERFORM public.lock_stock_for_update(_product, _from_wh);
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN; END IF;
  INSERT INTO public.offline_operation_receipts (operation_id, operation_kind, user_id, note)
    VALUES (_operation_id,'transfer_shelf_stock_offline',auth.uid(),concat(_from_shelf,' -> ',_to_shelf))
    ON CONFLICT (operation_id) DO NOTHING;
  PERFORM public.transfer_stock(_product,_from_wh,_to_wh,_qty);
END $$;
REVOKE ALL ON FUNCTION public.set_stock_offline(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_stock_batch_offline(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_shelf_stock_offline(uuid, uuid, uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock_offline(uuid, uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_stock_batch_offline(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_shelf_stock_offline(uuid, uuid, uuid, uuid, numeric, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) جدول المحاولات المتأخرة للمحاولات الأوفلاين (recordRpcFailure reliability view)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offline_rpc_failures (
  operation_id uuid PRIMARY KEY REFERENCES public.offline_operation_receipts(operation_id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  last_attempted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.offline_rpc_failures TO authenticated;
GRANT ALL ON public.offline_rpc_failures TO service_role;
ALTER TABLE public.offline_rpc_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own failures" ON public.offline_rpc_failures FOR SELECT TO authenticated USING (operation_id IN (SELECT operation_id FROM public.offline_operation_receipts WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS offline_rpc_failures_attempts_idx ON public.offline_rpc_failures (attempts, last_attempted_at);
