-- Fix set_initial_stocks to call set_stock with explicit operation_id NULL (avoids overload ambiguity).
CREATE OR REPLACE FUNCTION public.set_initial_stocks(_product uuid, _balances jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; warehouse_id uuid; quantity numeric;
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','inventory')
    OR NOT public.employee_can(auth.uid(),'actions','inventory.create')
    OR NOT public.employee_can(auth.uid(),'actions','stocktake.adjust')
    OR NOT public.employee_can(auth.uid(),'fields','quantity') THEN
    RAISE EXCEPTION 'غير مصرح بإدخال أرصدة افتتاحية';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id=_product)
    OR jsonb_typeof(_balances) <> 'array' THEN
    RAISE EXCEPTION 'بيانات الأرصدة الافتتاحية غير صالحة';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(_balances) LOOP
    warehouse_id := (item->>'warehouse_id')::uuid;
    quantity := (item->>'quantity')::numeric;
    IF warehouse_id IS NULL OR quantity IS NULL OR quantity < 0
      OR NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=warehouse_id) THEN
      RAISE EXCEPTION 'المستودع أو الكمية غير صالح';
    END IF;
    IF quantity > 0 THEN
      PERFORM public.set_stock(_product,warehouse_id,quantity,'رصيد افتتاحي'::text, NULL::uuid);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.set_initial_stocks(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_initial_stocks(uuid,jsonb) TO authenticated;

-- Ensure only the canonical 5-arg set_stock remains (drop legacy 4-arg if present)
DROP FUNCTION IF EXISTS public.set_stock(uuid, uuid, numeric, text);
