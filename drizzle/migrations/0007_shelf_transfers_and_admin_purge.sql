CREATE TABLE public.shelf_stock (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  shelf text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id, shelf)
);
GRANT SELECT ON public.shelf_stock TO authenticated;
GRANT ALL ON public.shelf_stock TO service_role;
ALTER TABLE public.shelf_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read shelf stock" ON public.shelf_stock FOR SELECT TO authenticated USING (public.employee_can(auth.uid(),'fields','quantity'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.shelf_stock;

-- Keep shelf breakdown never larger than the warehouse balance.
CREATE FUNCTION public.clamp_shelf_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE excess numeric; r record;
BEGIN
  SELECT coalesce(sum(quantity),0) - NEW.quantity INTO excess FROM public.shelf_stock WHERE product_id=NEW.product_id AND warehouse_id=NEW.warehouse_id;
  IF excess > 0 THEN
    FOR r IN SELECT shelf, quantity FROM public.shelf_stock WHERE product_id=NEW.product_id AND warehouse_id=NEW.warehouse_id ORDER BY quantity LOOP
      EXIT WHEN excess <= 0;
      IF r.quantity <= excess THEN
        DELETE FROM public.shelf_stock WHERE product_id=NEW.product_id AND warehouse_id=NEW.warehouse_id AND shelf=r.shelf;
        excess := excess - r.quantity;
      ELSE
        UPDATE public.shelf_stock SET quantity=quantity-excess, updated_at=now() WHERE product_id=NEW.product_id AND warehouse_id=NEW.warehouse_id AND shelf=r.shelf;
        excess := 0;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER clamp_shelf_stock AFTER UPDATE OF quantity ON public.stock FOR EACH ROW EXECUTE FUNCTION public.clamp_shelf_stock();

CREATE FUNCTION public.transfer_shelf_stock(_product uuid, _from_wh uuid, _from_shelf text, _to_wh uuid, _to_shelf text, _qty numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE total numeric; assigned numeric; src numeric;
  fs text := coalesce(btrim(_from_shelf),''); ts text := coalesce(btrim(_to_shelf),'');
  note_txt text;
BEGIN
  IF NOT (public.employee_can(auth.uid(),'actions','transfers.post') AND public.employee_can(auth.uid(),'fields','quantity') AND public.employee_can(auth.uid(),'pages','transfers')) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;
  IF _from_wh = _to_wh AND fs = ts THEN RAISE EXCEPTION 'اختر رفاً أو مستودعاً مختلفاً'; END IF;
  SELECT quantity INTO total FROM public.stock WHERE product_id=_product AND warehouse_id=_from_wh FOR UPDATE;
  total := coalesce(total,0);
  IF total < _qty THEN RAISE EXCEPTION 'الكمية المتوفرة غير كافية'; END IF;
  IF fs <> '' THEN
    SELECT quantity INTO src FROM public.shelf_stock WHERE product_id=_product AND warehouse_id=_from_wh AND shelf=fs FOR UPDATE;
    IF coalesce(src,0) < _qty THEN RAISE EXCEPTION 'الكمية على الرف المصدر غير كافية'; END IF;
    IF src = _qty THEN
      DELETE FROM public.shelf_stock WHERE product_id=_product AND warehouse_id=_from_wh AND shelf=fs;
    ELSE
      UPDATE public.shelf_stock SET quantity=quantity-_qty, updated_at=now() WHERE product_id=_product AND warehouse_id=_from_wh AND shelf=fs;
    END IF;
  ELSE
    SELECT coalesce(sum(quantity),0) INTO assigned FROM public.shelf_stock WHERE product_id=_product AND warehouse_id=_from_wh;
    IF total - assigned < _qty THEN RAISE EXCEPTION 'الكمية غير الموزعة على الرفوف غير كافية'; END IF;
  END IF;
  note_txt := format('من رف %s إلى رف %s', CASE WHEN fs='' THEN 'غير محدد' ELSE fs END, CASE WHEN ts='' THEN 'غير محدد' ELSE ts END);
  IF _from_wh <> _to_wh THEN
    UPDATE public.stock SET quantity=quantity-_qty, updated_at=now() WHERE product_id=_product AND warehouse_id=_from_wh;
    INSERT INTO public.stock (product_id, warehouse_id, quantity) VALUES (_product,_to_wh,_qty)
      ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity=public.stock.quantity+excluded.quantity, updated_at=now();
    INSERT INTO public.stock_movements (product_id, warehouse_id, kind, quantity, user_id, note) VALUES
      (_product,_from_wh,'transfer_out',-_qty,auth.uid(),note_txt), (_product,_to_wh,'transfer_in',_qty,auth.uid(),note_txt);
  ELSE
    INSERT INTO public.stock_movements (product_id, warehouse_id, kind, quantity, user_id, note) VALUES
      (_product,_from_wh,'shelf_out',-_qty,auth.uid(),note_txt), (_product,_to_wh,'shelf_in',_qty,auth.uid(),note_txt);
  END IF;
  IF ts <> '' THEN
    INSERT INTO public.shelf_stock (product_id, warehouse_id, shelf, quantity) VALUES (_product,_to_wh,ts,_qty)
      ON CONFLICT (product_id, warehouse_id, shelf) DO UPDATE SET quantity=public.shelf_stock.quantity+excluded.quantity, updated_at=now();
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.transfer_shelf_stock(uuid,uuid,text,uuid,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_shelf_stock(uuid,uuid,text,uuid,text,numeric) TO authenticated;

CREATE FUNCTION public.admin_purge(_scope text, _warehouse uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'هذه العملية للمدير فقط'; END IF;
  IF _scope IN ('warehouse','warehouse_remove') THEN
    IF _warehouse IS NULL THEN RAISE EXCEPTION 'اختر المستودع'; END IF;
    DELETE FROM public.shelf_stock WHERE warehouse_id=_warehouse;
    DELETE FROM public.stock_minimums WHERE warehouse_id=_warehouse;
    DELETE FROM public.stock_movements WHERE warehouse_id=_warehouse;
    DELETE FROM public.reorder_requests WHERE warehouse_id=_warehouse;
    DELETE FROM public.purchase_items WHERE invoice_id IN (SELECT id FROM public.purchase_invoices WHERE warehouse_id=_warehouse);
    DELETE FROM public.purchase_invoices WHERE warehouse_id=_warehouse;
    DELETE FROM public.stock WHERE warehouse_id=_warehouse;
    IF _scope = 'warehouse_remove' THEN
      UPDATE public.products SET warehouse_id=NULL WHERE warehouse_id=_warehouse;
      DELETE FROM public.warehouses WHERE id=_warehouse;
    END IF;
  ELSIF _scope = 'movements' THEN
    DELETE FROM public.stock_movements WHERE id IS NOT NULL;
  ELSIF _scope = 'purchases' THEN
    DELETE FROM public.purchase_items WHERE id IS NOT NULL;
    DELETE FROM public.purchase_invoices WHERE id IS NOT NULL;
  ELSIF _scope = 'reorders' THEN
    DELETE FROM public.reorder_requests WHERE id IS NOT NULL;
  ELSIF _scope = 'backups' THEN
    DELETE FROM public.backups WHERE id IS NOT NULL;
  ELSIF _scope = 'stock' THEN
    DELETE FROM public.shelf_stock WHERE product_id IS NOT NULL;
    DELETE FROM public.reorder_requests WHERE id IS NOT NULL;
    DELETE FROM public.stock_movements WHERE id IS NOT NULL;
    DELETE FROM public.stock WHERE product_id IS NOT NULL;
  ELSIF _scope IN ('products','all') THEN
    DELETE FROM public.shelf_stock WHERE product_id IS NOT NULL;
    DELETE FROM public.stock_minimums WHERE product_id IS NOT NULL;
    DELETE FROM public.reorder_requests WHERE id IS NOT NULL;
    DELETE FROM public.stock_movements WHERE id IS NOT NULL;
    DELETE FROM public.purchase_items WHERE id IS NOT NULL;
    DELETE FROM public.purchase_invoices WHERE id IS NOT NULL;
    DELETE FROM public.stock WHERE product_id IS NOT NULL;
    DELETE FROM public.products WHERE id IS NOT NULL;
    IF _scope = 'all' THEN
      DELETE FROM public.backups WHERE id IS NOT NULL;
      DELETE FROM public.custom_fields WHERE id IS NOT NULL;
      DELETE FROM public.units WHERE id IS NOT NULL;
      DELETE FROM public.categories WHERE id IS NOT NULL;
      DELETE FROM public.warehouses WHERE id IS NOT NULL;
    ELSE
      UPDATE public.categories SET next_seq=1 WHERE id IS NOT NULL;
    END IF;
  ELSE
    RAISE EXCEPTION 'نوع حذف غير معروف';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_purge(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge(text,uuid) TO authenticated;