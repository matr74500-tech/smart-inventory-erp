-- 0029_customer_supplier_codes.sql
--
-- مرحلة 29: إضافة رقم خاص مميز لكل عميل ومورد
-- - إضافة عمود code فريد لجدولي العملاء والموردين
-- - التوليد التلقائي للأرقام (C-1001 للعملاء، S-1001 للموردين)
-- - تعبئة تلقائية للسجلات الحالية
-- - دوال تحفيز للتوليد التلقائي للسجلات الجديدة

-- ----------------------------------------------------------------------------
-- 1) إضافة عمود code لجدول العملاء
-- ----------------------------------------------------------------------------
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS customers_code_unique ON public.customers (code) WHERE code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2) إضافة عمود code لجدول الموردين
-- ----------------------------------------------------------------------------
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_code_unique ON public.suppliers (code) WHERE code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3) دالة توليد الرمز التالي للعملاء (C-1001 وما يليه)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_customer_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  max_num int;
  next_code text;
BEGIN
  SELECT COALESCE(MAX((substring(code from 'C-(\d+)'))::int), 1000) INTO max_num
  FROM public.customers
  WHERE code LIKE 'C-%';
  next_code := 'C-' || (max_num + 1);
  RETURN next_code;
END
$$;

-- ----------------------------------------------------------------------------
-- 4) دالة توليد الرمز التالي للموردين (S-1001 وما يليه)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_supplier_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  max_num int;
  next_code text;
BEGIN
  SELECT COALESCE(MAX((substring(code from 'S-(\d+)'))::int), 1000) INTO max_num
  FROM public.suppliers
  WHERE code LIKE 'S-%';
  next_code := 'S-' || (max_num + 1);
  RETURN next_code;
END
$$;

-- ----------------------------------------------------------------------------
-- 5) تعبئة السجلات الحالية للأ工作اء
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  i int := 1001;
BEGIN
  FOR r IN SELECT id FROM public.customers WHERE code IS NULL ORDER BY name LOOP
    UPDATE public.customers SET code = 'C-' || i WHERE id = r.id;
    i := i + 1;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 6) تعبئة السجلات الحالية للموردين
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  i int := 1001;
BEGIN
  FOR r IN SELECT id FROM public.suppliers WHERE code IS NULL ORDER BY name LOOP
    UPDATE public.suppliers SET code = 'S-' || i WHERE id = r.id;
    i := i + 1;
  END LOOP;
END
$$;

-- ----------------------------------------------------------------------------
-- 7) تحفيز التوليد التلقائي للعملاء الجدد
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_customer_code_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := public.next_customer_code();
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trigger_set_customer_code_on_insert
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_customer_code_on_insert();

-- ----------------------------------------------------------------------------
-- 8) تحفيز التوليد التلقائي للموردين الجدد
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_supplier_code_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := public.next_supplier_code();
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trigger_set_supplier_code_on_insert
  BEFORE INSERT ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_supplier_code_on_insert();

-- ----------------------------------------------------------------------------
-- 9) تحديث دالة save_customer لقبول حقل الرمز الخاص
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_customer(
  _id uuid, _name text, _phone text, _secondary_phone text, _address text,
  _customer_type text, _credit_limit_yer numeric, _inactive_alert_enabled boolean,
  _code text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE customer_id uuid;
BEGIN
  IF NOT public.employee_can(auth.uid(), 'pages', 'customers')
    OR NOT public.employee_can(auth.uid(), 'actions', 'customers.manage') THEN
    RAISE EXCEPTION 'غير مصرح بإدارة العملاء';
  END IF;
  IF nullif(btrim(_name), '') IS NULL OR _customer_type NOT IN ('cash','credit','wholesale')
    OR _credit_limit_yer < 0 THEN
    RAISE EXCEPTION 'بيانات العميل غير صالحة';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.customers (name, phone, secondary_phone, address, customer_type, credit_limit_yer, inactive_alert_enabled, code)
    VALUES (btrim(_name), btrim(coalesce(_phone,'')), nullif(btrim(_secondary_phone),''), btrim(coalesce(_address,'')), _customer_type, _credit_limit_yer, coalesce(_inactive_alert_enabled,true), nullif(btrim(_code),''))
    RETURNING id INTO customer_id;
  ELSE
    UPDATE public.customers SET name=btrim(_name), phone=btrim(coalesce(_phone,'')),
      secondary_phone=nullif(btrim(_secondary_phone),''), address=btrim(coalesce(_address,'')),
      customer_type=_customer_type, credit_limit_yer=_credit_limit_yer,
      inactive_alert_enabled=coalesce(_inactive_alert_enabled,true),
      code=nullif(btrim(_code),''),
      updated_at=now()
    WHERE id=_id AND active RETURNING id INTO customer_id;
    IF customer_id IS NULL THEN RAISE EXCEPTION 'العميل غير موجود أو غير نشط'; END IF;
  END IF;
  RETURN customer_id;
END $$;

REVOKE ALL ON FUNCTION public.save_customer(uuid,text,text,text,text,text,numeric,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_customer(uuid,text,text,text,text,text,numeric,boolean,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11) تحديث دالة save_supplier لقبول حقل الرمز الخاص
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_supplier(
  _id uuid, _name text, _phone text, _address text, _notes text, _code text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE supplier_id uuid;
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','suppliers')
    OR NOT public.employee_can(auth.uid(),'actions','suppliers.manage') THEN
    RAISE EXCEPTION 'غير مصرح بإدارة الموردين';
  END IF;
  IF nullif(btrim(_name),'') IS NULL THEN RAISE EXCEPTION 'اسم المورد مطلوب'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.suppliers (name,phone,address,notes,code)
    VALUES (btrim(_name),btrim(coalesce(_phone,'')),btrim(coalesce(_address,'')),nullif(btrim(_notes),''),nullif(btrim(_code),''))
    RETURNING id INTO supplier_id;
  ELSE
    UPDATE public.suppliers SET name=btrim(_name),phone=btrim(coalesce(_phone,'')),
      address=btrim(coalesce(_address,'')),notes=nullif(btrim(_notes),''),
      code=nullif(btrim(_code),''),updated_at=now()
    WHERE id=_id AND active RETURNING id INTO supplier_id;
    IF supplier_id IS NULL THEN RAISE EXCEPTION 'المورد غير موجود أو غير نشط'; END IF;
  END IF;
  RETURN supplier_id;
END $$;

REVOKE ALL ON FUNCTION public.save_supplier(uuid,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_supplier(uuid,text,text,text,text,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 12) تحديث دالة save_supplier_offline لقبول حقل الرمز الخاص
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_supplier_offline(
  _operation_id uuid, _id uuid, _name text, _phone text, _address text, _notes text, _code text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.offline_operation_receipts WHERE operation_id=_operation_id) THEN RETURN _id; END IF;
  INSERT INTO public.offline_operation_receipts(operation_id,operation_kind,user_id)
    VALUES(_operation_id,'save_supplier',auth.uid());
  result := public.save_supplier(_id,_name,_phone,_address,_notes,_code);
  RETURN result;
END $$;

-- ----------------------------------------------------------------------------
-- 13) الصلاحيات النهائية
-- ----------------------------------------------------------------------------
GRANT SELECT ON public.customers TO authenticated;
GRANT SELECT ON public.suppliers TO authenticated;
GRANT UPDATE (code) ON public.customers TO authenticated;
GRANT UPDATE (code) ON public.suppliers TO authenticated;
