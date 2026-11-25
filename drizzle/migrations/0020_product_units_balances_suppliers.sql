-- Additive migration: multi-unit products, opening balances with shelf, and
-- supplier priority. Existing tables/columns are left untouched; every object
-- here is new or guarded so re-running stays safe.

-- 1) Additional units per product, each with its own conversion factor.
CREATE TABLE IF NOT EXISTS public.product_units (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  unit_name text NOT NULL,
  factor numeric NOT NULL DEFAULT 1 CHECK (factor > 0),
  is_base boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, unit_name)
);
GRANT SELECT ON public.product_units TO authenticated;
GRANT ALL ON public.product_units TO service_role;
ALTER TABLE public.product_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read product units" ON public.product_units;
CREATE POLICY "read product units" ON public.product_units FOR SELECT TO authenticated
  USING (public.employee_can(auth.uid(),'fields','unit'));
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='product_units'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_units;
  END IF;
END $$;

-- 2) Supplier priority on the product<->supplier link.
ALTER TABLE public.product_suppliers ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

-- 3) Replace the full unit list for a product.
CREATE OR REPLACE FUNCTION public.save_product_units(_product uuid, _units jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; uname text; ufactor numeric; uisbase boolean; uorder int;
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','inventory')
     OR NOT public.employee_can(auth.uid(),'fields','unit') THEN
    RAISE EXCEPTION 'غير مصرح بتعديل وحدات الصنف';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=_product) THEN
    RAISE EXCEPTION 'الصنف غير موجود';
  END IF;
  DELETE FROM public.product_units WHERE product_id=_product;
  IF _units IS NOT NULL AND jsonb_typeof(_units)='array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(_units) LOOP
      uname := nullif(btrim(item->>'unit_name'),'');
      ufactor := coalesce((item->>'factor')::numeric,1);
      uisbase := coalesce((item->>'is_base')::boolean,false);
      uorder := coalesce((item->>'sort_order')::int,0);
      IF uname IS NULL OR ufactor IS NULL OR ufactor <= 0 THEN
        RAISE EXCEPTION 'اسم الوحدة أو معامل التحويل غير صالح';
      END IF;
      INSERT INTO public.product_units(product_id,unit_name,factor,is_base,sort_order)
      VALUES(_product,uname,ufactor,uisbase,uorder);
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_product_units_offline(_operation_id uuid, _product uuid, _units jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN; END IF;
  INSERT INTO public.offline_operation_receipts(operation_id,operation_kind,user_id)
    VALUES(_operation_id,'save_product_units',auth.uid());
  PERFORM public.save_product_units(_product,_units);
END $$;

-- 4) Opening balances per warehouse with an optional shelf breakdown.
CREATE OR REPLACE FUNCTION public.save_product_opening_balances(_product uuid, _balances jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; wh uuid; qty numeric; shelf text;
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','inventory')
     OR NOT public.employee_can(auth.uid(),'actions','stocktake.adjust')
     OR NOT public.employee_can(auth.uid(),'fields','quantity') THEN
    RAISE EXCEPTION 'غير مصرح بإدخال الأرصدة الافتتاحية';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=_product)
     OR jsonb_typeof(_balances) <> 'array' THEN
    RAISE EXCEPTION 'بيانات الأرصدة الافتتاحية غير صالحة';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_balances) LOOP
    wh := (item->>'warehouse_id')::uuid;
    qty := (item->>'quantity')::numeric;
    shelf := nullif(btrim(coalesce(item->>'shelf','')),'');
    IF wh IS NULL OR qty IS NULL OR qty < 0
       OR NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=wh) THEN
      RAISE EXCEPTION 'المستودع أو الكمية غير صالح';
    END IF;
    IF qty > 0 THEN
      PERFORM public.set_stock(_product,wh,qty,'رصيد افتتاحي');
      IF shelf IS NOT NULL THEN
        INSERT INTO public.shelf_stock(product_id,warehouse_id,shelf,quantity)
        VALUES(_product,wh,shelf,qty)
        ON CONFLICT (product_id,warehouse_id,shelf)
        DO UPDATE SET quantity=excluded.quantity, updated_at=now();
      END IF;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.save_product_opening_balances_offline(_operation_id uuid, _product uuid, _balances jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN; END IF;
  INSERT INTO public.offline_operation_receipts(operation_id,operation_kind,user_id)
    VALUES(_operation_id,'save_product_opening_balances',auth.uid());
  PERFORM public.save_product_opening_balances(_product,_balances);
END $$;

-- 5) Replace the full supplier list for a product; first entry becomes primary.
CREATE OR REPLACE FUNCTION public.save_product_suppliers(_product uuid, _items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; sid uuid; psku text; pcost numeric; idx int := 0;
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','suppliers')
     OR NOT public.employee_can(auth.uid(),'actions','suppliers.manage') THEN
    RAISE EXCEPTION 'غير مصرح بربط الموردين بالصنف';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=_product) THEN
    RAISE EXCEPTION 'الصنف غير موجود';
  END IF;
  DELETE FROM public.product_suppliers WHERE product_id=_product;
  IF _items IS NOT NULL AND jsonb_typeof(_items)='array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
      sid := (item->>'supplier_id')::uuid;
      psku := nullif(btrim(coalesce(item->>'supplier_sku','')),'');
      pcost := coalesce((item->>'last_cost')::numeric,0);
      IF sid IS NULL OR pcost IS NULL OR pcost < 0
         OR NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id=sid AND active) THEN
        RAISE EXCEPTION 'بيانات ربط المورد غير صالحة';
      END IF;
      INSERT INTO public.product_suppliers(product_id,supplier_id,supplier_sku,last_cost,is_primary,priority)
      VALUES(_product,sid,psku,pcost,(idx = 0),idx);
      idx := idx + 1;
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_product_suppliers_offline(_operation_id uuid, _product uuid, _items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN; END IF;
  INSERT INTO public.offline_operation_receipts(operation_id,operation_kind,user_id)
    VALUES(_operation_id,'save_product_suppliers',auth.uid());
  PERFORM public.save_product_suppliers(_product,_items);
END $$;

REVOKE ALL ON FUNCTION public.save_product_units(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_product_units_offline(uuid,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_product_opening_balances(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_product_opening_balances_offline(uuid,uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_product_suppliers(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_product_suppliers_offline(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_product_units(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_units_offline(uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_opening_balances(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_opening_balances_offline(uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_suppliers(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_suppliers_offline(uuid,uuid,jsonb) TO authenticated;