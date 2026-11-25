-- ============================================================================
-- الدفعة الرابعة: تخصيص المبيعات والطباعة، ملصقات الباركود، ماسح الباركود،
-- التخصيص الشامل، المشاركة، وتوحيد التوقيت الزمني
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) إعدادات المبيعات الافتراضية (Sales Defaults)
-- فصل الإعدادات الافتراضية بين صفحة المبيعات السريعة (POS) وصفحة فاتورة المبيعات
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sales_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_type text NOT NULL DEFAULT 'quick_sales'
    CHECK (page_type IN ('quick_sales', 'sales_invoice')),
  default_tier text NOT NULL DEFAULT 'price'
    CHECK (default_tier IN ('price_special','price','price_half','price_wholesale','price_bulk')),
  default_currency_code text NOT NULL DEFAULT 'YER'
    REFERENCES public.currencies(code),
  default_payment_method text NOT NULL DEFAULT 'نقدي YER',
  default_discount numeric NOT NULL DEFAULT 0 CHECK (default_discount >= 0),
  default_tax numeric NOT NULL DEFAULT 0 CHECK (default_tax >= 0),
  auto_print_receipt boolean NOT NULL DEFAULT false,
  print_printer_type text DEFAULT NULL
    CHECK (print_printer_type IN ('thermal','a4','a5','pos','none')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_type)
);

GRANT SELECT ON public.sales_defaults TO authenticated;
GRANT ALL ON public.sales_defaults TO service_role;
ALTER TABLE public.sales_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read sales defaults" ON public.sales_defaults;
CREATE POLICY "read sales defaults" ON public.sales_defaults FOR SELECT TO authenticated
  USING (public.employee_can(auth.uid(),'pages','sales')
    OR public.employee_can(auth.uid(),'pages','settings'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sales_defaults'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_defaults;
  END IF;
END $$;

-- إدخال قيم افتراضية لكل نوع صفحة
INSERT INTO public.sales_defaults (page_type, default_tier, default_currency_code, default_payment_method, default_discount, default_tax, auto_print_receipt, print_printer_type)
VALUES ('quick_sales', 'price', 'YER', 'نقدي YER', 0, 0, false, NULL),
       ('sales_invoice', 'price', 'YER', 'نقدي YER', 0, 0, true, 'thermal')
ON CONFLICT (page_type) DO NOTHING;

-- تحديث إعدادات المبيعات الافتراضية
CREATE OR REPLACE FUNCTION public.save_sales_defaults(
  _page_type text,
  _default_tier text,
  _default_currency_code text,
  _default_payment_method text,
  _default_discount numeric,
  _default_tax numeric,
  _auto_print_receipt boolean,
  _print_printer_type text
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

  INSERT INTO public.sales_defaults (
    page_type, default_tier, default_currency_code, default_payment_method,
    default_discount, default_tax, auto_print_receipt, print_printer_type, updated_at
  ) VALUES (
    _page_type, _default_tier, _default_currency_code, _default_payment_method,
    _default_discount, _default_tax, _auto_print_receipt, _print_printer_type, now()
  )
  ON CONFLICT (page_type) DO UPDATE
    SET default_tier = excluded.default_tier,
        default_currency_code = excluded.default_currency_code,
        default_payment_method = excluded.default_payment_method,
        default_discount = excluded.default_discount,
        default_tax = excluded.default_tax,
        auto_print_receipt = excluded.auto_print_receipt,
        print_printer_type = excluded.print_printer_type,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_sales_defaults(text,text,text,text,numeric,numeric,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_sales_defaults(text,text,text,text,numeric,numeric,boolean,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) إعدادات طباعة السندات والفواتير (Print Settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.print_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL DEFAULT 'invoice'
    CHECK (document_type IN ('invoice','receipt','voucher','label','report')),
  paper_size text NOT NULL DEFAULT 'a4'
    CHECK (paper_size IN ('a4','a5','receipt_80','receipt_58','pos_58','custom')),
  orientation text NOT NULL DEFAULT 'portrait'
    CHECK (orientation IN ('portrait','landscape')),
  margin_top numeric NOT NULL DEFAULT 10 CHECK (margin_top >= 0),
  margin_bottom numeric NOT NULL DEFAULT 10 CHECK (margin_bottom >= 0),
  margin_left numeric NOT NULL DEFAULT 10 CHECK (margin_left >= 0),
  margin_right numeric NOT NULL DEFAULT 10 CHECK (margin_right >= 0),
  font_family text NOT NULL DEFAULT 'Tahoma',
  font_size numeric NOT NULL DEFAULT 12 CHECK (font_size > 0 AND font_size <= 72),
  primary_color text NOT NULL DEFAULT '#000000',
  secondary_color text NOT NULL DEFAULT '#666666',
  accent_color text NOT NULL DEFAULT '#000000',
  show_logo boolean NOT NULL DEFAULT true,
  show_shop_name boolean NOT NULL DEFAULT true,
  show_shop_address boolean NOT NULL DEFAULT true,
  show_shop_phone boolean NOT NULL DEFAULT true,
  show_customer_info boolean NOT NULL DEFAULT true,
  show_items_table boolean NOT NULL DEFAULT true,
  show_totals boolean NOT NULL DEFAULT true,
  show_tax boolean NOT NULL DEFAULT true,
  show_discount boolean NOT NULL DEFAULT true,
  show_payment_method boolean NOT NULL DEFAULT true,
  show_date_time boolean NOT NULL DEFAULT true,
  show_qr_code boolean NOT NULL DEFAULT false,
  show_barcode boolean NOT NULL DEFAULT false,
  show_footer boolean NOT NULL DEFAULT true,
  footer_text text DEFAULT NULL,
  printer_type text DEFAULT NULL
    CHECK (printer_type IN ('thermal','a4','a5','pos','network','none')),
  copies numeric NOT NULL DEFAULT 1 CHECK (copies >= 1 AND copies <= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type)
);

GRANT SELECT ON public.print_settings TO authenticated;
GRANT ALL ON public.print_settings TO service_role;
ALTER TABLE public.print_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read print settings" ON public.print_settings;
CREATE POLICY "read print settings" ON public.print_settings FOR SELECT TO authenticated
  USING (public.employee_can(auth.uid(),'pages','settings')
    OR public.employee_can(auth.uid(),'pages','sales')
    OR public.employee_can(auth.uid(),'pages','cash'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='print_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.print_settings;
  END IF;
END $$;

-- إدخال قيم افتراضية لأنواع الوثائق
INSERT INTO public.print_settings (document_type, paper_size, orientation, font_family, font_size, printer_type, copies)
VALUES
  ('invoice', 'a4', 'portrait', 'Tahoma', 12, 'thermal', 1),
  ('receipt', 'receipt_80', 'portrait', 'Tahoma', 10, 'thermal', 1),
  ('voucher', 'a5', 'portrait', 'Tahoma', 12, 'a4', 1),
  ('label', 'a4', 'portrait', 'Tahoma', 10, 'thermal', 1),
  ('report', 'a4', 'portrait', 'Tahoma', 11, 'a4', 1)
ON CONFLICT (document_type) DO NOTHING;

-- تحديث إعدادات الطباعة
CREATE OR REPLACE FUNCTION public.save_print_settings(
  _document_type text,
  _paper_size text,
  _orientation text,
  _margin_top numeric,
  _margin_bottom numeric,
  _margin_left numeric,
  _margin_right numeric,
  _font_family text,
  _font_size numeric,
  _primary_color text,
  _secondary_color text,
  _accent_color text,
  _show_logo boolean,
  _show_shop_name boolean,
  _show_shop_address boolean,
  _show_shop_phone boolean,
  _show_customer_info boolean,
  _show_items_table boolean,
  _show_totals boolean,
  _show_tax boolean,
  _show_discount boolean,
  _show_payment_method boolean,
  _show_date_time boolean,
  _show_qr_code boolean,
  _show_barcode boolean,
  _show_footer boolean,
  _footer_text text,
  _printer_type text,
  _copies numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','settings')
     OR NOT public.employee_can(auth.uid(),'actions','settings.manage') THEN
    RAISE EXCEPTION 'غير مصرح بتعديل إعدادات الطباعة';
  END IF;
  IF _document_type NOT IN ('invoice','receipt','voucher','label','report') THEN
    RAISE EXCEPTION 'نوع وثيقة غير صالح';
  END IF;
  IF _paper_size NOT IN ('a4','a5','receipt_80','receipt_58','pos_58','custom') THEN
    RAISE EXCEPTION 'حجم الورق غير صالح';
  END IF;
  IF _orientation NOT IN ('portrait','landscape') THEN
    RAISE EXCEPTION 'اتجاه الورق غير صالح';
  END IF;
  IF _font_size IS NULL OR _font_size <= 0 OR _font_size > 72 THEN
    RAISE EXCEPTION 'حجم الخط غير صالح';
  END IF;
  IF _printer_type IS NOT NULL
     AND _printer_type NOT IN ('thermal','a4','a5','pos','network','none') THEN
    RAISE EXCEPTION 'نوع الطابعة غير صالح';
  END IF;
  IF _copies IS NULL OR _copies < 1 OR _copies > 10 THEN
    RAISE EXCEPTION 'عدد النسخ غير صالح';
  END IF;

  INSERT INTO public.print_settings (
    document_type, paper_size, orientation, margin_top, margin_bottom,
    margin_left, margin_right, font_family, font_size, primary_color,
    secondary_color, accent_color, show_logo, show_shop_name, show_shop_address,
    show_shop_phone, show_customer_info, show_items_table, show_totals,
    show_tax, show_discount, show_payment_method, show_date_time,
    show_qr_code, show_barcode, show_footer, footer_text,
    printer_type, copies, updated_at
  ) VALUES (
    _document_type, _paper_size, _orientation, _margin_top, _margin_bottom,
    _margin_left, _margin_right, _font_family, _font_size, _primary_color,
    _secondary_color, _accent_color, _show_logo, _show_shop_name, _show_shop_address,
    _show_shop_phone, _show_customer_info, _show_items_table, _show_totals,
    _show_tax, _show_discount, _show_payment_method, _show_date_time,
    _show_qr_code, _show_barcode, _show_footer, _footer_text,
    _printer_type, _copies, now()
  )
  ON CONFLICT (document_type) DO UPDATE
    SET paper_size = excluded.paper_size,
        orientation = excluded.orientation,
        margin_top = excluded.margin_top,
        margin_bottom = excluded.margin_bottom,
        margin_left = excluded.margin_left,
        margin_right = excluded.margin_right,
        font_family = excluded.font_family,
        font_size = excluded.font_size,
        primary_color = excluded.primary_color,
        secondary_color = excluded.secondary_color,
        accent_color = excluded.accent_color,
        show_logo = excluded.show_logo,
        show_shop_name = excluded.show_shop_name,
        show_shop_address = excluded.show_shop_address,
        show_shop_phone = excluded.show_shop_phone,
        show_customer_info = excluded.show_customer_info,
        show_items_table = excluded.show_items_table,
        show_totals = excluded.show_totals,
        show_tax = excluded.show_tax,
        show_discount = excluded.show_discount,
        show_payment_method = excluded.show_payment_method,
        show_date_time = excluded.show_date_time,
        show_qr_code = excluded.show_qr_code,
        show_barcode = excluded.show_barcode,
        show_footer = excluded.show_footer,
        footer_text = excluded.footer_text,
        printer_type = excluded.printer_type,
        copies = excluded.copies,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_print_settings(text,text,text,numeric,numeric,numeric,numeric,text,numeric,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_print_settings(text,text,text,numeric,numeric,numeric,numeric,text,numeric,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,numeric) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) إعدادات ملصقات الباركود (Barcode Label Settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.barcode_label_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_name text NOT NULL DEFAULT '',
  product_name_field text NOT NULL DEFAULT 'name'
    CHECK (product_name_field IN ('name','code','model_no')),
  price_source text NOT NULL DEFAULT 'category'
    CHECK (price_source IN ('category','manual','none')),
  price_category text DEFAULT NULL
    CHECK (price_category IN ('price_special','price','price_half','price_wholesale','price_bulk')),
  custom_price numeric DEFAULT NULL CHECK (custom_price >= 0),
  title text NOT NULL DEFAULT '',
  show_logo boolean NOT NULL DEFAULT true,
  show_barcode_image boolean NOT NULL DEFAULT true,
  show_qr_code boolean NOT NULL DEFAULT false,
  label_width_mm numeric NOT NULL DEFAULT 50 CHECK (label_width_mm > 0),
  label_height_mm numeric NOT NULL DEFAULT 30 CHECK (label_height_mm > 0),
  labels_per_page numeric NOT NULL DEFAULT 10 CHECK (labels_per_page >= 1 AND labels_per_page <= 100),
  printer_type text DEFAULT NULL
    CHECK (printer_type IN ('thermal','a4','a5','pos','none')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.barcode_label_settings TO authenticated;
GRANT ALL ON public.barcode_label_settings TO service_role;
ALTER TABLE public.barcode_label_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read barcode label settings" ON public.barcode_label_settings;
CREATE POLICY "read barcode label settings" ON public.barcode_label_settings FOR SELECT TO authenticated
  USING (public.employee_can(auth.uid(),'pages','settings')
    OR public.employee_can(auth.uid(),'pages','labels'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='barcode_label_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.barcode_label_settings;
  END IF;
END $$;

-- تحديث إعدادات ملصقات الباركود
CREATE OR REPLACE FUNCTION public.save_barcode_label_settings(
  _shop_name text,
  _product_name_field text,
  _price_source text,
  _price_category text,
  _custom_price numeric,
  _title text,
  _show_logo boolean,
  _show_barcode_image boolean,
  _show_qr_code boolean,
  _label_width_mm numeric,
  _label_height_mm numeric,
  _labels_per_page numeric,
  _printer_type text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','settings')
     OR NOT public.employee_can(auth.uid(),'actions','settings.manage') THEN
    RAISE EXCEPTION 'غير مصرح بتعديل إعدادات ملصقات الباركود';
  END IF;
  IF _product_name_field NOT IN ('name','code','model_no') THEN
    RAISE EXCEPTION 'حقل اسم الصنف غير صالح';
  END IF;
  IF _price_source NOT IN ('category','manual','none') THEN
    RAISE EXCEPTION 'مصدر السعر غير صالح';
  END IF;
  IF _price_category IS NOT NULL
     AND _price_category NOT IN ('price_special','price','price_half','price_wholesale','price_bulk') THEN
    RAISE EXCEPTION 'فئة السعر غير صالحة';
  END IF;
  IF _custom_price IS NOT NULL AND _custom_price < 0 THEN
    RAISE EXCEPTION 'السعر اليدوي غير صالح';
  END IF;
  IF _label_width_mm IS NULL OR _label_width_mm <= 0 THEN
    RAISE EXCEPTION 'عرض الملصق غير صالح';
  END IF;
  IF _label_height_mm IS NULL OR _label_height_mm <= 0 THEN
    RAISE EXCEPTION 'ارتفاع الملصق غير صالح';
  END IF;
  IF _labels_per_page IS NULL OR _labels_per_page < 1 OR _labels_per_page > 100 THEN
    RAISE EXCEPTION 'عدد الملصقات في الصفحة غير صالح';
  END IF;
  IF _printer_type IS NOT NULL
     AND _printer_type NOT IN ('thermal','a4','a5','pos','none') THEN
    RAISE EXCEPTION 'نوع الطابعة غير صالح';
  END IF;

  INSERT INTO public.barcode_label_settings (
    shop_name, product_name_field, price_source, price_category, custom_price,
    title, show_logo, show_barcode_image, show_qr_code,
    label_width_mm, label_height_mm, labels_per_page, printer_type, updated_at
  ) VALUES (
    _shop_name, _product_name_field, _price_source, _price_category, _custom_price,
    _title, _show_logo, _show_barcode_image, _show_qr_code,
    _label_width_mm, _label_height_mm, _labels_per_page, _printer_type, now()
  )
  ON CONFLICT (id) DO UPDATE
    SET shop_name = excluded.shop_name,
        product_name_field = excluded.product_name_field,
        price_source = excluded.price_source,
        price_category = excluded.price_category,
        custom_price = excluded.custom_price,
        title = excluded.title,
        show_logo = excluded.show_logo,
        show_barcode_image = excluded.show_barcode_image,
        show_qr_code = excluded.show_qr_code,
        label_width_mm = excluded.label_width_mm,
        label_height_mm = excluded.label_height_mm,
        labels_per_page = excluded.labels_per_page,
        printer_type = excluded.printer_type,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_barcode_label_settings(text,text,text,text,numeric,text,boolean,boolean,boolean,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_barcode_label_settings(text,text,text,text,numeric,text,boolean,boolean,boolean,numeric,numeric,numeric,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4) إعدادات ماسح الباركود لكل صفحة (Scanner Settings per Page)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scanner_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path text NOT NULL UNIQUE,
  scanner_action text NOT NULL DEFAULT 'find_product'
    CHECK (scanner_action IN ('find_product','add_to_cart','search_invoice','add_expense','add_stock_adjustment','open_page','none')),
  target_page text DEFAULT NULL,
  auto_execute boolean NOT NULL DEFAULT true,
  beep_on_scan boolean NOT NULL DEFAULT true,
  vibrate_on_scan boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scanner_settings TO authenticated;
GRANT ALL ON public.scanner_settings TO service_role;
ALTER TABLE public.scanner_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read scanner settings" ON public.scanner_settings;
CREATE POLICY "read scanner settings" ON public.scanner_settings FOR SELECT TO authenticated
  USING (public.employee_can(auth.uid(),'pages','settings')
    OR public.employee_can(auth.uid(),'pages','sales')
    OR public.employee_can(auth.uid(),'pages','inventory')
    OR public.employee_can(auth.uid(),'pages','stocktake')
    OR public.employee_can(auth.uid(),'pages','expenses'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='scanner_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scanner_settings;
  END IF;
END $$;

-- إدخال قيم افتراضية للصفحات الرئيسية
INSERT INTO public.scanner_settings (page_path, scanner_action, target_page, auto_execute, beep_on_scan, vibrate_on_scan)
VALUES
  ('/sales', 'add_to_cart', NULL, true, true, false),
  ('/purchases', 'add_to_cart', NULL, true, true, false),
  ('/stocktake', 'find_product', NULL, true, true, false),
  ('/inventory', 'find_product', NULL, true, true, false),
  ('/expenses', 'none', NULL, false, true, false),
  ('/returns', 'find_product', NULL, true, true, false)
ON CONFLICT (page_path) DO NOTHING;

-- تحديث إعدادات الماسح
CREATE OR REPLACE FUNCTION public.save_scanner_settings(
  _page_path text,
  _scanner_action text,
  _target_page text,
  _auto_execute boolean,
  _beep_on_scan boolean,
  _vibrate_on_scan boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','settings')
     OR NOT public.employee_can(auth.uid(),'actions','settings.manage') THEN
    RAISE EXCEPTION 'غير مصرح بتعديل إعدادات الماسح';
  END IF;
  IF _scanner_action NOT IN ('find_product','add_to_cart','search_invoice','add_expense','add_stock_adjustment','open_page','none') THEN
    RAISE EXCEPTION 'إجراء الماسح غير صالح';
  END IF;
  IF _scanner_action = 'open_page' AND _target_page IS NULL THEN
    RAISE EXCEPTION 'يجب تحديد صفحة الهدف عند اختيار إجراء فتح صفحة';
  END IF;

  INSERT INTO public.scanner_settings (
    page_path, scanner_action, target_page, auto_execute, beep_on_scan, vibrate_on_scan, updated_at
  ) VALUES (
    _page_path, _scanner_action, _target_page, _auto_execute, _beep_on_scan, _vibrate_on_scan, now()
  )
  ON CONFLICT (page_path) DO UPDATE
    SET scanner_action = excluded.scanner_action,
        target_page = excluded.target_page,
        auto_execute = excluded.auto_execute,
        beep_on_scan = excluded.beep_on_scan,
        vibrate_on_scan = excluded.vibrate_on_scan,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_scanner_settings(text,text,text,boolean,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_scanner_settings(text,text,text,boolean,boolean,boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) التخصيص الشامل للمظهر (UI Theme / Customization)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ui_theme_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_mode text NOT NULL DEFAULT 'light'
    CHECK (theme_mode IN ('light','dark','system')),
  primary_color text NOT NULL DEFAULT '#0f172a',
  secondary_color text NOT NULL DEFAULT '#64748b',
  accent_color text NOT NULL DEFAULT '#3b82f6',
  font_family text NOT NULL DEFAULT 'Tahoma',
  font_size text NOT NULL DEFAULT 'medium'
    CHECK (font_size IN ('small','medium','large')),
  language text NOT NULL DEFAULT 'ar'
    CHECK (language IN ('ar','en')),
  rtl_layout boolean NOT NULL DEFAULT true,
  compact_mode boolean NOT NULL DEFAULT false,
  show_avatars boolean NOT NULL DEFAULT true,
  show_animations boolean NOT NULL DEFAULT true,
  notification_enabled boolean NOT NULL DEFAULT true,
  notification_importance text NOT NULL DEFAULT 'normal'
    CHECK (notification_importance IN ('low','normal','high','critical')),
  notification_sound boolean NOT NULL DEFAULT true,
  notification_vibrate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT ON public.ui_theme_settings TO authenticated;
GRANT ALL ON public.ui_theme_settings TO service_role;
ALTER TABLE public.ui_theme_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read ui theme settings" ON public.ui_theme_settings;
CREATE POLICY "read ui theme settings" ON public.ui_theme_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.employee_can(auth.uid(),'pages','settings'));
CREATE POLICY "manage own ui theme settings" ON public.ui_theme_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='ui_theme_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ui_theme_settings;
  END IF;
END $$;

-- تحديث إعدادات التخصيص الشامل
CREATE OR REPLACE FUNCTION public.save_ui_theme_settings(
  _theme_mode text,
  _primary_color text,
  _secondary_color text,
  _accent_color text,
  _font_family text,
  _font_size text,
  _language text,
  _rtl_layout boolean,
  _compact_mode boolean,
  _show_avatars boolean,
  _show_animations boolean,
  _notification_enabled boolean,
  _notification_importance text,
  _notification_sound boolean,
  _notification_vibrate boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF _theme_mode NOT IN ('light','dark','system') THEN
    RAISE EXCEPTION 'وضع السمة غير صالح';
  END IF;
  IF _font_size NOT IN ('small','medium','large') THEN
    RAISE EXCEPTION 'حجم الخط غير صالح';
  END IF;
  IF _language NOT IN ('ar','en') THEN
    RAISE EXCEPTION 'اللغة غير صالحة';
  END IF;
  IF _notification_importance NOT IN ('low','normal','high','critical') THEN
    RAISE EXCEPTION 'أهمية الإشعارات غير صالحة';
  END IF;

  INSERT INTO public.ui_theme_settings (
    user_id, theme_mode, primary_color, secondary_color, accent_color,
    font_family, font_size, language, rtl_layout, compact_mode,
    show_avatars, show_animations, notification_enabled,
    notification_importance, notification_sound, notification_vibrate,
    updated_at
  ) VALUES (
    auth.uid(), _theme_mode, _primary_color, _secondary_color, _accent_color,
    _font_family, _font_size, _language, _rtl_layout, _compact_mode,
    _show_avatars, _show_animations, _notification_enabled,
    _notification_importance, _notification_sound, _notification_vibrate, now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET theme_mode = excluded.theme_mode,
        primary_color = excluded.primary_color,
        secondary_color = excluded.secondary_color,
        accent_color = excluded.accent_color,
        font_family = excluded.font_family,
        font_size = excluded.font_size,
        language = excluded.language,
        rtl_layout = excluded.rtl_layout,
        compact_mode = excluded.compact_mode,
        show_avatars = excluded.show_avatars,
        show_animations = excluded.show_animations,
        notification_enabled = excluded.notification_enabled,
        notification_importance = excluded.notification_importance,
        notification_sound = excluded.notification_sound,
        notification_vibrate = excluded.notification_vibrate,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_ui_theme_settings(text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_ui_theme_settings(text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) اختصارات الصفحة الرئيسية (Home Shortcuts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.home_shortcuts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  page_path text NOT NULL,
  label text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'LayoutDashboard',
  sort_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, page_path)
);

GRANT SELECT ON public.home_shortcuts TO authenticated;
GRANT ALL ON public.home_shortcuts TO service_role;
ALTER TABLE public.home_shortcuts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read home shortcuts" ON public.home_shortcuts;
CREATE POLICY "read home shortcuts" ON public.home_shortcuts FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.employee_can(auth.uid(),'pages','settings'));
CREATE POLICY "manage own home shortcuts" ON public.home_shortcuts FOR ALL TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='home_shortcuts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.home_shortcuts;
  END IF;
END $$;

-- إضافة اختصار للصفحة الرئيسية
CREATE OR REPLACE FUNCTION public.add_home_shortcut(
  _page_path text,
  _label text,
  _icon text,
  _sort_order integer,
  _is_visible boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE shortcut_id uuid;
BEGIN
  INSERT INTO public.home_shortcuts (user_id, page_path, label, icon, sort_order, is_visible)
    VALUES (auth.uid(), _page_path, _label, _icon, _sort_order, _is_visible)
    RETURNING id INTO shortcut_id;
  RETURN shortcut_id;
END $$;

-- تحديث اختصار موجود
CREATE OR REPLACE FUNCTION public.update_home_shortcut(
  _id uuid,
  _label text,
  _icon text,
  _sort_order integer,
  _is_visible boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.home_shortcuts
    SET label = _label, icon = _icon, sort_order = _sort_order,
        is_visible = _is_visible, updated_at = now()
  WHERE id = _id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'الاختصار غير موجود أو غير خاص بك'; END IF;
END $$;

-- حذف اختصار
CREATE OR REPLACE FUNCTION public.remove_home_shortcut(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  DELETE FROM public.home_shortcuts WHERE id = _id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'الاختصار غير موجود أو غير خاص بك'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.add_home_shortcut(text,text,text,integer,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_home_shortcut(uuid,text,text,integer,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.remove_home_shortcut(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_home_shortcut(text,text,text,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_home_shortcut(uuid,text,text,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_home_shortcut(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) إعدادات مشاركة السندات والفواتير (Share Settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.share_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL DEFAULT 'invoice'
    CHECK (document_type IN ('invoice','receipt','voucher','quote')),
  auto_share boolean NOT NULL DEFAULT false,
  share_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_message text DEFAULT NULL,
  require_confirmation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type)
);

GRANT SELECT ON public.share_settings TO authenticated;
GRANT ALL ON public.share_settings TO service_role;
ALTER TABLE public.share_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read share settings" ON public.share_settings;
CREATE POLICY "read share settings" ON public.share_settings FOR SELECT TO authenticated
  USING (public.employee_can(auth.uid(),'pages','settings')
    OR public.employee_can(auth.uid(),'pages','sales')
    OR public.employee_can(auth.uid(),'pages','cash'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='share_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.share_settings;
  END IF;
END $$;

-- إدخال قيم افتراضية لأنواع الوثائق
INSERT INTO public.share_settings (document_type, auto_share, share_methods, default_message, require_confirmation)
VALUES
  ('invoice', false, '["whatsapp","sms","email"]'::jsonb, 'فاتورة مبيعات مرفقة.', true),
  ('receipt', false, '["whatsapp","sms"]'::jsonb, 'إيصال استلام مرفق.', true),
  ('voucher', false, '["whatsapp","email"]'::jsonb, 'سند نقدي مرفق.', true),
  ('quote', false, '["whatsapp","sms","email"]'::jsonb, 'عرض سعر مرفق.', true)
ON CONFLICT (document_type) DO NOTHING;

-- تحديث إعدادات المشاركة
CREATE OR REPLACE FUNCTION public.save_share_settings(
  _document_type text,
  _auto_share boolean,
  _share_methods jsonb,
  _default_message text,
  _require_confirmation boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','settings')
     OR NOT public.employee_can(auth.uid(),'actions','settings.manage') THEN
    RAISE EXCEPTION 'غير مصرح بتعديل إعدادات المشاركة';
  END IF;
  IF _document_type NOT IN ('invoice','receipt','voucher','quote') THEN
    RAISE EXCEPTION 'نوع وثيقة غير صالح';
  END IF;
  IF _share_methods IS NOT NULL AND jsonb_typeof(_share_methods) <> 'array' THEN
    RAISE EXCEPTION 'طرق المشاركة يجب أن تكون مصفوفة';
  END IF;

  INSERT INTO public.share_settings (
    document_type, auto_share, share_methods, default_message,
    require_confirmation, updated_at
  ) VALUES (
    _document_type, _auto_share, _share_methods, _default_message,
    _require_confirmation, now()
  )
  ON CONFLICT (document_type) DO UPDATE
    SET auto_share = excluded.auto_share,
        share_methods = excluded.share_methods,
        default_message = excluded.default_message,
        require_confirmation = excluded.require_confirmation,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_share_settings(text,boolean,jsonb,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_share_settings(text,boolean,jsonb,text,boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8) التوقيت الزمني الموحد (System Timezone)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_timezone (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone text NOT NULL DEFAULT 'Asia/Aden',
  auto_detect boolean NOT NULL DEFAULT true,
  use_24h_format boolean NOT NULL DEFAULT true,
  date_format text NOT NULL DEFAULT 'DD/MM/YYYY'
    CHECK (date_format IN ('DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD')),
  time_format text NOT NULL DEFAULT 'HH:mm'
    CHECK (time_format IN ('HH:mm','hh:mm A')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.system_timezone TO authenticated;
GRANT ALL ON public.system_timezone TO service_role;
ALTER TABLE public.system_timezone ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read system timezone" ON public.system_timezone;
CREATE POLICY "read system timezone" ON public.system_timezone FOR SELECT TO authenticated
  USING (public.employee_can(auth.uid(),'pages','settings')
    OR public.employee_can(auth.uid(),'pages','reports'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='system_timezone'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_timezone;
  END IF;
END $$;

-- إدخال القيمة الافتراضية
INSERT INTO public.system_timezone (id, timezone, auto_detect, use_24h_format, date_format, time_format)
VALUES (1, 'Asia/Aden', true, true, 'DD/MM/YYYY', 'HH:mm')
ON CONFLICT (id) DO NOTHING;

-- تحديث التوقيت الزمني
CREATE OR REPLACE FUNCTION public.save_system_timezone(
  _timezone text,
  _auto_detect boolean,
  _use_24h_format boolean,
  _date_format text,
  _time_format text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','settings')
     OR NOT public.employee_can(auth.uid(),'actions','settings.manage') THEN
    RAISE EXCEPTION 'غير مصرح بتعديل التوقيت الزمني';
  END IF;
  IF _date_format NOT IN ('DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD') THEN
    RAISE EXCEPTION 'صيغة التاريخ غير صالحة';
  END IF;
  IF _time_format NOT IN ('HH:mm','hh:mm A') THEN
    RAISE EXCEPTION 'صيغة الوقت غير صالحة';
  END IF;

  INSERT INTO public.system_timezone (id, timezone, auto_detect, use_24h_format, date_format, time_format, updated_at)
    VALUES (1, _timezone, _auto_detect, _use_24h_format, _date_format, _time_format, now())
  ON CONFLICT (id) DO UPDATE
    SET timezone = excluded.timezone,
        auto_detect = excluded.auto_detect,
        use_24h_format = excluded.use_24h_format,
        date_format = excluded.date_format,
        time_format = excluded.time_format,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_system_timezone(text,boolean,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_system_timezone(text,boolean,boolean,text,text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9) الصلاحيات: إضافة صفحات وإجراءات جديدة إلى employee_can
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employee_can(_user_id uuid, _kind text, _key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg public.employee_permissions; manager boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.has_role(_user_id, 'admin') THEN RETURN true; END IF;
  SELECT * INTO cfg FROM public.employee_permissions WHERE user_id = _user_id;
  IF FOUND THEN
    RETURN CASE _kind
      WHEN 'pages' THEN _key = ANY(cfg.pages)
      WHEN 'actions' THEN _key = ANY(cfg.actions)
      WHEN 'fields' THEN _key = ANY(cfg.fields)
      ELSE false
    END;
  END IF;
  manager := public.has_role(_user_id, 'storekeeper');
  IF _kind = 'fields' THEN RETURN true; END IF;
  IF _kind = 'pages' THEN
    RETURN _key = ANY(CASE WHEN manager
      THEN ARRAY['dashboard','inventory','purchases','prices','alerts','labels','catalog','stocktake','transfers','reorders','settings','sales','customers','cash','reports','suppliers','purchase_orders','returns','expenses','sales_reps','activity_log','print_settings','barcode_labels','scanner_settings','ui_theme','home_shortcuts','share_settings','system_timezone']
      ELSE ARRAY['dashboard','inventory','alerts','labels','catalog','sales','customers','cash','returns','expenses']
    END);
  END IF;
  IF _kind = 'actions' THEN
    RETURN _key = ANY(CASE WHEN manager
      THEN ARRAY['inventory.create','inventory.edit','inventory.import','inventory.export','prices.update','purchases.post','stocktake.adjust','transfers.post','reorders.receive','settings.manage','catalog.print','labels.print','sales.draft','sales.post','sales.override_price','customers.manage','cash.manage','cash.close','reports.view','suppliers.manage','purchase_orders.manage','returns.manage','expenses.manage','sales_reps.manage']
      ELSE ARRAY['inventory.export','catalog.print','labels.print','sales.draft','sales.post','customers.manage','cash.manage','returns.manage','expenses.manage']
    END);
  END IF;
  RETURN false;
END $$;
