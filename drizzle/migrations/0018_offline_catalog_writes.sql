-- Idempotent wrappers for retryable catalog changes made while offline.
CREATE OR REPLACE FUNCTION public.save_supplier_offline(
  _operation_id uuid, _id uuid, _name text, _phone text, _address text, _notes text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN _id; END IF;
  INSERT INTO public.offline_operation_receipts(operation_id,operation_kind,user_id)
    VALUES(_operation_id,'save_supplier',auth.uid());
  result := public.save_supplier(_id,_name,_phone,_address,_notes);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.save_product_supplier_offline(
  _operation_id uuid, _product_id uuid, _supplier_id uuid, _supplier_sku text,
  _last_cost numeric, _is_primary boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN; END IF;
  INSERT INTO public.offline_operation_receipts(operation_id,operation_kind,user_id)
    VALUES(_operation_id,'save_product_supplier',auth.uid());
  PERFORM public.save_product_supplier(_product_id,_supplier_id,_supplier_sku,_last_cost,_is_primary);
END $$;

CREATE OR REPLACE FUNCTION public.save_product_offline(
  _operation_id uuid, _id uuid, _product jsonb, _attributes jsonb, _balances jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products%ROWTYPE; item jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN _id; END IF;
  IF NOT public.employee_can(auth.uid(),'pages','inventory')
    AND NOT public.employee_can(auth.uid(),'pages','prices') THEN RAISE EXCEPTION 'غير مصرح بإدارة الأصناف'; END IF;
  INSERT INTO public.offline_operation_receipts(operation_id,operation_kind,user_id)
    VALUES(_operation_id,'save_product',auth.uid());
  SELECT * INTO p FROM jsonb_populate_record(null::public.products,_product);
  IF _id IS NULL THEN RAISE EXCEPTION 'معرف الصنف مطلوب'; END IF;
  IF EXISTS(SELECT 1 FROM public.products WHERE id=_id) THEN
    IF NOT public.employee_can(auth.uid(),'actions','inventory.edit')
      AND NOT public.employee_can(auth.uid(),'actions','prices.update') THEN RAISE EXCEPTION 'غير مصرح بتعديل الصنف'; END IF;
  ELSE
    IF NOT public.employee_can(auth.uid(),'pages','inventory')
      OR NOT public.employee_can(auth.uid(),'actions','inventory.create') THEN RAISE EXCEPTION 'غير مصرح بإضافة صنف'; END IF;
    INSERT INTO public.products(id,name) VALUES(_id,p.name);
  END IF;
  UPDATE public.products SET
    name=CASE WHEN _product?'name' THEN p.name ELSE name END,
    description=CASE WHEN _product?'description' THEN p.description ELSE description END,
    model_no=CASE WHEN _product?'model_no' THEN p.model_no ELSE model_no END,
    barcode=CASE WHEN _product?'barcode' THEN p.barcode ELSE barcode END,
    category_id=CASE WHEN _product?'category_id' THEN p.category_id ELSE category_id END,
    warehouse_id=CASE WHEN _product?'warehouse_id' THEN p.warehouse_id ELSE warehouse_id END,
    shelf=CASE WHEN _product?'shelf' THEN p.shelf ELSE shelf END,
    unit=CASE WHEN _product?'unit' THEN p.unit ELSE unit END,
    major_unit=CASE WHEN _product?'major_unit' THEN p.major_unit ELSE major_unit END,
    pack_capacity=CASE WHEN _product?'pack_capacity' THEN p.pack_capacity ELSE pack_capacity END,
    cost=CASE WHEN _product?'cost' THEN p.cost ELSE cost END,
    price=CASE WHEN _product?'price' THEN p.price ELSE price END,
    price_special=CASE WHEN _product?'price_special' THEN p.price_special ELSE price_special END,
    price_half=CASE WHEN _product?'price_half' THEN p.price_half ELSE price_half END,
    price_wholesale=CASE WHEN _product?'price_wholesale' THEN p.price_wholesale ELSE price_wholesale END,
    price_bulk=CASE WHEN _product?'price_bulk' THEN p.price_bulk ELSE price_bulk END,
    reorder_level=CASE WHEN _product?'reorder_level' THEN p.reorder_level ELSE reorder_level END,
    reorder_qty=CASE WHEN _product?'reorder_qty' THEN p.reorder_qty ELSE reorder_qty END,
    expiry_date=CASE WHEN _product?'expiry_date' THEN p.expiry_date ELSE expiry_date END,
    supplier=CASE WHEN _product?'supplier' THEN p.supplier ELSE supplier END,
    updated_at=now() WHERE id=_id;
  IF _attributes IS NOT NULL AND _attributes <> '{}'::jsonb THEN PERFORM public.save_product_attributes(_id,_attributes); END IF;
  IF _balances IS NOT NULL AND jsonb_array_length(_balances)>0 THEN PERFORM public.set_initial_stocks(_id,_balances); END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.save_catalog_setting_offline(
  _operation_id uuid, _table text, _id uuid, _record jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb := _record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN _id; END IF;
  IF NOT public.employee_can(auth.uid(),'pages','settings')
    OR NOT public.employee_can(auth.uid(),'actions','settings.manage') THEN RAISE EXCEPTION 'غير مصرح بإدارة الإعدادات'; END IF;
  IF _table='categories' THEN
    IF EXISTS(SELECT 1 FROM public.categories WHERE id=_id) THEN
      UPDATE public.categories SET name=coalesce(r->>'name',name),prefix=coalesce(r->>'prefix',prefix) WHERE id=_id;
    ELSE INSERT INTO public.categories(id,name,prefix) VALUES(_id,r->>'name',coalesce(r->>'prefix','ITM')); END IF;
  ELSIF _table='warehouses' THEN
    IF EXISTS(SELECT 1 FROM public.warehouses WHERE id=_id) THEN
      UPDATE public.warehouses SET name=coalesce(r->>'name',name) WHERE id=_id;
    ELSE INSERT INTO public.warehouses(id,name) VALUES(_id,r->>'name'); END IF;
  ELSIF _table='units' THEN
    IF EXISTS(SELECT 1 FROM public.units WHERE id=_id) THEN
      UPDATE public.units SET name=coalesce(r->>'name',name),factor=coalesce((r->>'factor')::numeric,factor) WHERE id=_id;
    ELSE INSERT INTO public.units(id,name,factor) VALUES(_id,r->>'name',coalesce((r->>'factor')::numeric,1)); END IF;
  ELSIF _table='custom_fields' THEN
    IF EXISTS(SELECT 1 FROM public.custom_fields WHERE id=_id) THEN
      UPDATE public.custom_fields SET name=coalesce(r->>'name',name),kind=coalesce(r->>'kind',kind),
        options=CASE WHEN r?'options' THEN ARRAY(SELECT jsonb_array_elements_text(r->'options')) ELSE options END WHERE id=_id;
    ELSE INSERT INTO public.custom_fields(id,name,kind,options)
      VALUES(_id,r->>'name',coalesce(r->>'kind','text'),coalesce(ARRAY(SELECT jsonb_array_elements_text(r->'options')),ARRAY[]::text[]));
    END IF;
  ELSE RAISE EXCEPTION 'نوع إعداد غير مدعوم';
  END IF;
  INSERT INTO public.offline_operation_receipts(operation_id,operation_kind,user_id)
    VALUES(_operation_id,'save_catalog_setting',auth.uid());
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.save_supplier_offline(uuid,uuid,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_product_supplier_offline(uuid,uuid,uuid,text,numeric,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_product_offline(uuid,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_supplier_offline(uuid,uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_supplier_offline(uuid,uuid,uuid,text,numeric,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_offline(uuid,uuid,jsonb,jsonb,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.save_catalog_setting_offline(uuid,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_catalog_setting_offline(uuid,text,uuid,jsonb) TO authenticated;

-- upload product image offline (stores image as data URL on product row)
CREATE OR REPLACE FUNCTION public.upload_product_image_offline(
  _operation_id uuid, _product_id uuid, _image_data_url text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN; END IF;
  IF NOT public.employee_can(auth.uid(),'pages','inventory')
    AND NOT public.employee_can(auth.uid(),'pages','prices') THEN RAISE EXCEPTION 'غير مصرح بتعديل الصور'; END IF;
  INSERT INTO public.offline_operation_receipts(operation_id,operation_kind,user_id)
    VALUES(_operation_id,'upload_product_image',auth.uid());
  UPDATE public.products SET image_url=_image_data_url, updated_at=now() WHERE id=_product_id;
END $$;

REVOKE ALL ON FUNCTION public.upload_product_image_offline(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upload_product_image_offline(uuid,uuid,text) TO authenticated;
