-- 0030_audit_log.sql
--
-- مرحلة 30: تفعيل سجل التحركات (system_activity_log) تلقائياً على العمليات الأساسية
-- - إضافة تحفيزات (triggers) تُسجل إنشاء/تعديل/حذف السجلات في سجل التحركات
-- - تُغطى الجداول: الأصناف، العملاء، الموردين، فواتير المبيعات، السندات
-- - تُستدعى دالة log_system_activity الموجودة (الهجرة 0024) لتسجيل العملية والمستخدم والتفاصيل

-- ----------------------------------------------------------------------------
-- 1) دالة تحفيز عامة تُسجل أي عملية في system_activity_log
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_log_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_action text;
  v_details jsonb := '{}'::jsonb;
  v_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_details := jsonb_build_object('old', to_jsonb(OLD));
    v_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_details := jsonb_build_object('new', to_jsonb(NEW));
    v_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_details := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
    v_id := NEW.id;
  END IF;

  PERFORM public.log_system_activity(
    v_action,
    TG_TABLE_NAME,
    v_id,
    v_details
  );

  RETURN COALESCE(NEW, OLD);
END
$$;

-- ----------------------------------------------------------------------------
-- 2) تحفيز على جدول الأصناف (products)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_audit_log_products ON public.products;
CREATE TRIGGER trigger_audit_log_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_trigger();

-- ----------------------------------------------------------------------------
-- 3) تحفيز على جدول العملاء (customers)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_audit_log_customers ON public.customers;
CREATE TRIGGER trigger_audit_log_customers
  AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_trigger();

-- ----------------------------------------------------------------------------
-- 4) تحفيز على جدول الموردين (suppliers)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_audit_log_suppliers ON public.suppliers;
CREATE TRIGGER trigger_audit_log_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_trigger();

-- ----------------------------------------------------------------------------
-- 5) تحفيز على جدول فواتير المبيعات (sales_invoices)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_audit_log_sales_invoices ON public.sales_invoices;
CREATE TRIGGER trigger_audit_log_sales_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_trigger();

-- ----------------------------------------------------------------------------
-- 6) تحفيز على جدول السندات (vouchers)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_audit_log_vouchers ON public.vouchers;
CREATE TRIGGER trigger_audit_log_vouchers
  AFTER INSERT OR UPDATE OR DELETE ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_log_trigger();
