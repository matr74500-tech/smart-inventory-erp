-- Add auto_add_on_scan to sales_defaults for POS / invoice default behavior
ALTER TABLE public.sales_defaults
  ADD COLUMN IF NOT EXISTS auto_add_on_scan boolean NOT NULL DEFAULT true;

-- Replace save_sales_defaults to include _auto_add_on_scan
CREATE OR REPLACE FUNCTION public.save_sales_defaults(
  _page_type text,
  _default_tier text,
  _default_currency_code text,
  _default_payment_method text,
  _default_discount numeric,
  _default_tax numeric,
  _auto_print_receipt boolean,
  _print_printer_type text,
  _auto_add_on_scan boolean DEFAULT true
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','settings')
     OR NOT public.employee_can(auth.uid(),'actions','settings.manage') THEN
    RAISE EXCEPTION 'غير مصرح بتعديل إعدادات المبيعات';
  END IF;
  IF _page_type NOT IN ('quick_sales','sales_invoice') THEN
    RAISE EXCEPTION 'نوع صفحة غير صالح';
  END IF;
  IF _default_tier NOT IN ('price_special','price','price_half','price_wholesale','price_bulk') THEN
    RAISE EXCEPTION 'سعر افتراضي غير صالح';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.currencies WHERE code=_default_currency_code AND active) THEN
    RAISE EXCEPTION 'العملة غير موجودة أو غير نشطة';
  END IF;
  IF _default_discount IS NULL OR _default_discount < 0 THEN
    RAISE EXCEPTION 'الخصم الافتراضي غير صالح';
  END IF;
  IF _default_tax IS NULL OR _default_tax < 0 THEN
    RAISE EXCEPTION 'الضريبة الافتراضية غير صالحة';
  END IF;
  IF _print_printer_type IS NOT NULL
     AND _print_printer_type NOT IN ('thermal','a4','a5','pos','none') THEN
    RAISE EXCEPTION 'نوع الطابعة غير صالح';
  END IF;
  IF _auto_add_on_scan IS NULL THEN
    _auto_add_on_scan := true;
  END IF;

  INSERT INTO public.sales_defaults (
    page_type, default_tier, default_currency_code, default_payment_method,
    default_discount, default_tax, auto_print_receipt, print_printer_type, auto_add_on_scan, updated_at
  ) VALUES (
    _page_type, _default_tier, _default_currency_code, _default_payment_method,
    _default_discount, _default_tax, _auto_print_receipt, _print_printer_type, _auto_add_on_scan, now()
  )
  ON CONFLICT (page_type) DO UPDATE
    SET default_tier = excluded.default_tier,
        default_currency_code = excluded.default_currency_code,
        default_payment_method = excluded.default_payment_method,
        default_discount = excluded.default_discount,
        default_tax = excluded.default_tax,
        auto_print_receipt = excluded.auto_print_receipt,
        print_printer_type = excluded.print_printer_type,
        auto_add_on_scan = excluded.auto_add_on_scan,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_sales_defaults(text,text,text,text,numeric,numeric,boolean,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_sales_defaults(text,text,text,text,numeric,numeric,boolean,text,boolean) TO authenticated;
