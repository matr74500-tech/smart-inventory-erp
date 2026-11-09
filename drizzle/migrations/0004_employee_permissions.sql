CREATE TABLE public.employee_permissions (user_id uuid PRIMARY KEY, pages text[] NOT NULL DEFAULT '{}', actions text[] NOT NULL DEFAULT '{}', fields text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.employee_permissions TO authenticated;
GRANT ALL ON public.employee_permissions TO service_role;
ALTER TABLE public.employee_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own permissions or admin" ON public.employee_permissions FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin configure permissions" ON public.employee_permissions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.employee_can(_user_id uuid,_kind text,_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg public.employee_permissions; manager boolean;
BEGIN
IF _user_id IS NULL THEN RETURN false; END IF;
IF public.has_role(_user_id,'admin') THEN RETURN true; END IF;
SELECT * INTO cfg FROM public.employee_permissions WHERE user_id=_user_id;
IF FOUND THEN RETURN CASE _kind WHEN 'pages' THEN _key=ANY(cfg.pages) WHEN 'actions' THEN _key=ANY(cfg.actions) WHEN 'fields' THEN _key=ANY(cfg.fields) ELSE false END; END IF;
manager:=public.has_role(_user_id,'storekeeper');
IF _kind='fields' THEN RETURN true; END IF;
IF _kind='pages' THEN RETURN _key=ANY(CASE WHEN manager THEN ARRAY['dashboard','inventory','purchases','prices','alerts','labels','catalog','stocktake','transfers','reorders','settings'] ELSE ARRAY['dashboard','inventory','alerts','labels','catalog'] END); END IF;
IF _kind='actions' THEN RETURN _key=ANY(CASE WHEN manager THEN ARRAY['inventory.create','inventory.edit','inventory.import','inventory.export','prices.update','purchases.post','stocktake.adjust','transfers.post','reorders.receive','settings.manage','catalog.print','labels.print'] ELSE ARRAY['inventory.export','catalog.print','labels.print'] END); END IF;
RETURN false; END $$;
REVOKE ALL ON FUNCTION public.employee_can(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_can(uuid,text,text) TO authenticated,service_role;
CREATE FUNCTION public.visible_products() RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
IF NOT EXISTS(SELECT 1 FROM unnest(ARRAY['inventory','dashboard','prices','purchases','stocktake','transfers','reorders','catalog','labels','alerts','settings']) x WHERE public.employee_can(auth.uid(),'pages',x)) THEN RETURN; END IF;
RETURN QUERY SELECT (SELECT jsonb_object_agg(e.key,CASE WHEN e.key IN ('id','created_at','updated_at') OR public.employee_can(auth.uid(),'fields',e.key) THEN CASE WHEN e.key='attributes' AND EXISTS(SELECT 1 FROM public.employee_permissions WHERE user_id=auth.uid()) AND NOT public.has_role(auth.uid(),'admin') THEN COALESCE((SELECT jsonb_object_agg(a.key,a.value) FROM jsonb_each(e.value) a WHERE public.employee_can(auth.uid(),'fields','attribute:'||a.key)),'{}'::jsonb) ELSE e.value END ELSE 'null'::jsonb END) FROM jsonb_each(to_jsonb(p)) e) FROM public.products p ORDER BY p.name;
END $$;
REVOKE ALL ON FUNCTION public.visible_products() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.visible_products() TO authenticated;
REVOKE SELECT ON public.products FROM authenticated;
GRANT SELECT(id) ON public.products TO authenticated;
CREATE FUNCTION public.guard_product_permissions() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; a record; old_row jsonb;
BEGIN
IF auth.uid() IS NULL THEN IF current_setting('request.jwt.claim.role',true)='service_role' OR current_setting('role',true)='service_role' THEN RETURN NEW; END IF; RAISE EXCEPTION 'غير مصرح'; END IF;
IF public.has_role(auth.uid(),'admin') THEN RETURN NEW; END IF;
old_row:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
FOR e IN SELECT * FROM jsonb_each(to_jsonb(NEW)) LOOP
IF e.key IN ('id','code','custom_barcode','created_at','updated_at') THEN CONTINUE; END IF;
IF TG_OP='UPDATE' AND e.value IS NOT DISTINCT FROM old_row->e.key THEN CONTINUE; END IF;
IF TG_OP='INSERT' AND (e.value='null'::jsonb OR e.value='0'::jsonb OR e.value='{}'::jsonb OR (e.key='unit' AND e.value='"حبة"'::jsonb) OR (e.key='pack_capacity' AND e.value='1'::jsonb)) THEN CONTINUE; END IF;
IF NOT public.employee_can(auth.uid(),'fields',e.key) THEN RAISE EXCEPTION 'لا تملك صلاحية الحقل %',e.key; END IF;
IF e.key=ANY(ARRAY['cost','price','price_special','price_half','price_wholesale','price_bulk']) AND NOT public.employee_can(auth.uid(),'actions','prices.update') THEN RAISE EXCEPTION 'لا تملك صلاحية تغيير الأسعار'; END IF;
IF e.key='attributes' THEN
FOR a IN SELECT * FROM jsonb_each(e.value) LOOP
IF a.value IS DISTINCT FROM old_row->'attributes'->a.key AND NOT public.employee_can(auth.uid(),'fields','attribute:'||a.key) THEN RAISE EXCEPTION 'لا تملك صلاحية الحقل الإضافي'; END IF;
END LOOP;
FOR a IN SELECT * FROM jsonb_each(COALESCE(old_row->'attributes','{}'::jsonb)) LOOP
IF NOT e.value ? a.key AND NOT public.employee_can(auth.uid(),'fields','attribute:'||a.key) THEN RAISE EXCEPTION 'لا تملك صلاحية الحقل الإضافي'; END IF;
END LOOP;
END IF;
END LOOP;
RETURN NEW; END $$;
CREATE TRIGGER enforce_product_permissions BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_product_permissions();
ALTER POLICY "stock managers write products" ON public.products WITH CHECK(public.employee_can(auth.uid(),'pages','inventory') AND public.employee_can(auth.uid(),'actions','inventory.create'));
ALTER POLICY "stock managers update products" ON public.products USING((public.employee_can(auth.uid(),'pages','inventory') AND public.employee_can(auth.uid(),'actions','inventory.edit')) OR (public.employee_can(auth.uid(),'pages','prices') AND public.employee_can(auth.uid(),'actions','prices.update')));
ALTER POLICY "admin delete products" ON public.products USING(public.employee_can(auth.uid(),'pages','inventory') AND public.employee_can(auth.uid(),'actions','inventory.delete'));
ALTER POLICY "read stock" ON public.stock USING(public.employee_can(auth.uid(),'fields','quantity'));
ALTER POLICY "read movements" ON public.stock_movements USING(public.employee_can(auth.uid(),'fields','quantity'));
ALTER POLICY "read reorders" ON public.reorder_requests USING(public.employee_can(auth.uid(),'fields','quantity') AND (public.employee_can(auth.uid(),'pages','reorders') OR public.employee_can(auth.uid(),'pages','dashboard') OR public.employee_can(auth.uid(),'pages','alerts')));
ALTER POLICY "read minimums" ON public.stock_minimums USING(public.employee_can(auth.uid(),'fields','reorder_level') AND public.employee_can(auth.uid(),'fields','quantity'));
ALTER POLICY "read purchases" ON public.purchase_invoices USING(public.employee_can(auth.uid(),'pages','purchases') AND public.employee_can(auth.uid(),'fields','cost') AND public.employee_can(auth.uid(),'fields','quantity') AND public.employee_can(auth.uid(),'fields','supplier'));
ALTER POLICY "read purchase items" ON public.purchase_items USING(public.employee_can(auth.uid(),'pages','purchases') AND public.employee_can(auth.uid(),'fields','cost') AND public.employee_can(auth.uid(),'fields','quantity'));
DO $$
DECLARE r record; def text; page_key text; action_key text;
BEGIN
FOR r IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('set_stock','transfer_stock','receive_reorder','post_purchase') LOOP
page_key:=CASE r.proname WHEN 'set_stock' THEN 'stocktake' WHEN 'transfer_stock' THEN 'transfers' WHEN 'receive_reorder' THEN 'reorders' ELSE 'purchases' END;
action_key:=CASE r.proname WHEN 'set_stock' THEN 'stocktake.adjust' WHEN 'transfer_stock' THEN 'transfers.post' WHEN 'receive_reorder' THEN 'reorders.receive' ELSE 'purchases.post' END;
def:=pg_get_functiondef(r.oid);
def:=replace(def,'if not public.can_manage_stock(auth.uid()) then raise exception ''غير مصرح''; end if;',format('if not public.employee_can(auth.uid(),''actions'',%L) or not public.employee_can(auth.uid(),''fields'',''quantity'') or not (public.employee_can(auth.uid(),''pages'',%L)%s) then raise exception ''غير مصرح''; end if;',action_key,page_key,CASE WHEN r.proname='set_stock' THEN ' or (public.employee_can(auth.uid(),''pages'',''inventory'') and public.employee_can(auth.uid(),''actions'',''inventory.create''))' ELSE '' END));
IF r.proname='post_purchase' THEN def:=replace(def,'if jsonb_array_length(_items)','if not public.employee_can(auth.uid(),''fields'',''cost'') or not public.employee_can(auth.uid(),''fields'',''supplier'') then raise exception ''لا تملك صلاحية بيانات الشراء''; end if; if jsonb_array_length(_items)'); END IF;
EXECUTE def;
EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',r.oid::regprocedure);
EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.oid::regprocedure);
END LOOP;
FOR r IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND policyname IN ('managers write categories','managers manage warehouses','managers write units','managers write fields','managers write minimums') LOOP
EXECUTE format('ALTER POLICY %I ON public.%I USING(public.employee_can(auth.uid(),''pages'',''settings'') AND public.employee_can(auth.uid(),''actions'',''settings.manage'')) WITH CHECK(public.employee_can(auth.uid(),''pages'',''settings'') AND public.employee_can(auth.uid(),''actions'',''settings.manage''))',r.policyname,r.tablename);
END LOOP;
END $$;