CREATE FUNCTION public.save_product_attributes(_product uuid,_attributes jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record;
BEGIN
IF NOT public.employee_can(auth.uid(),'pages','inventory') OR NOT public.employee_can(auth.uid(),'actions','inventory.edit') THEN RAISE EXCEPTION 'غير مصرح'; END IF;
FOR a IN SELECT * FROM jsonb_each(_attributes) LOOP IF NOT public.employee_can(auth.uid(),'fields','attribute:'||a.key) THEN RAISE EXCEPTION 'غير مصرح'; END IF; END LOOP;
UPDATE public.products SET attributes=attributes||_attributes WHERE id=_product;
END $$;
REVOKE ALL ON FUNCTION public.save_product_attributes(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_product_attributes(uuid,jsonb) TO authenticated;
DO $$ DECLARE def text; BEGIN
SELECT pg_get_functiondef('public.guard_product_permissions()'::regprocedure) INTO def;
def:=replace(def,'IF NOT public.employee_can(auth.uid(),''fields'',e.key) THEN','IF TG_OP=''UPDATE'' AND e.key <> ALL(ARRAY[''cost'',''price'',''price_special'',''price_half'',''price_wholesale'',''price_bulk'']) AND NOT public.employee_can(auth.uid(),''actions'',''inventory.edit'') THEN RAISE EXCEPTION ''لا تملك صلاحية تعديل الصنف''; END IF; IF e.key<>''attributes'' AND NOT public.employee_can(auth.uid(),''fields'',e.key) THEN');
def:=replace(def,'AND NOT public.employee_can(auth.uid(),''actions'',''prices.update'') THEN','AND NOT (public.employee_can(auth.uid(),''actions'',''prices.update'') OR (e.key=''cost'' AND public.employee_can(auth.uid(),''pages'',''purchases'') AND public.employee_can(auth.uid(),''actions'',''purchases.post''))) THEN');
EXECUTE def;
END $$;