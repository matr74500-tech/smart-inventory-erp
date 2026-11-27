-- Batch 4: establishment/marketing, print extensions, user UI prefs copy, review helpers
-- ----------------------------------------------------------------------------
-- 1) App settings: establishment + marketing slogans
-- ----------------------------------------------------------------------------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS business_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS business_activity text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS address text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_numbers text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS logo_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS marketing_slogans jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS active_marketing_slogan_index integer NOT NULL DEFAULT 0;

-- Ensure row exists
INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2) Print settings: extra flags
-- ----------------------------------------------------------------------------
ALTER TABLE public.print_settings
  ADD COLUMN IF NOT EXISTS show_cashier_name boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_customer_balance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_tasqit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_mode text NOT NULL DEFAULT 'footer'
    CHECK (marketing_mode IN ('footer','header','none'));

-- ----------------------------------------------------------------------------
-- 3) ui_theme_settings: extra user prefs (start screen, columns, discount cap, feature flags)
-- ----------------------------------------------------------------------------
ALTER TABLE public.ui_theme_settings
  ADD COLUMN IF NOT EXISTS start_screen_path text NOT NULL DEFAULT '/',
  ADD COLUMN IF NOT EXISTS visible_columns jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_discount_percent numeric NOT NULL DEFAULT 100 CHECK (max_discount_percent >= 0 AND max_discount_percent <= 100),
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

-- RPC to save/copy handled below; ensure policies allow users to update own row
-- (existing policies may vary; keep simple: user can manage own via app logic, admin copy via RPC)

-- ----------------------------------------------------------------------------
-- 4) Copy UI settings between users (admin only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.copy_user_ui_settings(_from_user uuid, _to_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE src public.ui_theme_settings;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'غير مصرح بنسخ الإعدادات بين المستخدمين';
  END IF;
  IF _from_user IS NULL OR _to_user IS NULL OR _from_user = _to_user THEN
    RAISE EXCEPTION 'بيانات نسخ الإعدادات غير صالحة';
  END IF;
  SELECT * INTO src FROM public.ui_theme_settings WHERE user_id = _from_user;
  IF src.id IS NULL THEN
    RAISE EXCEPTION 'لا توجد إعدادات مصدر لهذا المستخدم';
  END IF;
  INSERT INTO public.ui_theme_settings (
    user_id, theme_mode, primary_color, secondary_color, accent_color, font_family, font_size, language,
    rtl_layout, compact_mode, show_avatars, show_animations, notification_enabled, notification_importance,
    notification_sound, notification_vibrate, start_screen_path, visible_columns, max_discount_percent, feature_flags
  ) VALUES (
    _to_user, src.theme_mode, src.primary_color, src.secondary_color, src.accent_color, src.font_family, src.font_size, src.language,
    src.rtl_layout, src.compact_mode, src.show_avatars, src.show_animations, src.notification_enabled, src.notification_importance,
    src.notification_sound, src.notification_vibrate, src.start_screen_path, src.visible_columns, src.max_discount_percent, src.feature_flags
  )
  ON CONFLICT (user_id) DO UPDATE SET
    theme_mode = excluded.theme_mode,
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
    start_screen_path = excluded.start_screen_path,
    visible_columns = excluded.visible_columns,
    max_discount_percent = excluded.max_discount_percent,
    feature_flags = excluded.feature_flags,
    updated_at = now();
  PERFORM public.log_system_activity('ui_settings.copied', 'user', _to_user, jsonb_build_object('from_user', _from_user));
END $$;

REVOKE ALL ON FUNCTION public.copy_user_ui_settings(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.copy_user_ui_settings(uuid,uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) Index for sales_returns document_date (was missed in 0037)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS sales_returns_document_date_idx ON public.sales_returns (document_date DESC);

-- ----------------------------------------------------------------------------
-- 6) Update save_print_settings to include new flags
-- ----------------------------------------------------------------------------
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
  _copies numeric,
  _show_cashier_name boolean DEFAULT true,
  _show_customer_balance boolean DEFAULT false,
  _show_tasqit boolean DEFAULT false,
  _marketing_mode text DEFAULT 'footer'
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
  IF _printer_type IS NOT NULL AND _printer_type NOT IN ('thermal','a4','a5','pos','network','none') THEN
    RAISE EXCEPTION 'نوع الطابعة غير صالح';
  END IF;
  IF _copies IS NULL OR _copies < 1 OR _copies > 10 THEN
    RAISE EXCEPTION 'عدد النسخ غير صالح';
  END IF;
  IF _marketing_mode NOT IN ('footer','header','none') THEN
    RAISE EXCEPTION 'وضع التسويق غير صالح';
  END IF;

  INSERT INTO public.print_settings (
    document_type, paper_size, orientation, margin_top, margin_bottom,
    margin_left, margin_right, font_family, font_size, primary_color,
    secondary_color, accent_color, show_logo, show_shop_name, show_shop_address,
    show_shop_phone, show_customer_info, show_items_table, show_totals,
    show_tax, show_discount, show_payment_method, show_date_time,
    show_qr_code, show_barcode, show_footer, footer_text,
    printer_type, copies,
    show_cashier_name, show_customer_balance, show_tasqit, marketing_mode,
    updated_at
  ) VALUES (
    _document_type, _paper_size, _orientation, _margin_top, _margin_bottom,
    _margin_left, _margin_right, _font_family, _font_size, _primary_color,
    _secondary_color, _accent_color, _show_logo, _show_shop_name, _show_shop_address,
    _show_shop_phone, _show_customer_info, _show_items_table, _show_totals,
    _show_tax, _show_discount, _show_payment_method, _show_date_time,
    _show_qr_code, _show_barcode, _show_footer, _footer_text,
    _printer_type, _copies,
    coalesce(_show_cashier_name,true), coalesce(_show_customer_balance,false), coalesce(_show_tasqit,false), coalesce(_marketing_mode,'footer'),
    now()
  )
  ON CONFLICT (document_type) DO UPDATE
    SET paper_size=excluded.paper_size, orientation=excluded.orientation,
        margin_top=excluded.margin_top, margin_bottom=excluded.margin_bottom,
        margin_left=excluded.margin_left, margin_right=excluded.margin_right,
        font_family=excluded.font_family, font_size=excluded.font_size,
        primary_color=excluded.primary_color, secondary_color=excluded.secondary_color,
        accent_color=excluded.accent_color,
        show_logo=excluded.show_logo, show_shop_name=excluded.show_shop_name,
        show_shop_address=excluded.show_shop_address, show_shop_phone=excluded.show_shop_phone,
        show_customer_info=excluded.show_customer_info, show_items_table=excluded.show_items_table,
        show_totals=excluded.show_totals, show_tax=excluded.show_tax,
        show_discount=excluded.show_discount, show_payment_method=excluded.show_payment_method,
        show_date_time=excluded.show_date_time, show_qr_code=excluded.show_qr_code,
        show_barcode=excluded.show_barcode, show_footer=excluded.show_footer,
        footer_text=excluded.footer_text, printer_type=excluded.printer_type,
        copies=excluded.copies,
        show_cashier_name=excluded.show_cashier_name, show_customer_balance=excluded.show_customer_balance,
        show_tasqit=excluded.show_tasqit, marketing_mode=excluded.marketing_mode,
        updated_at=now();
END $$;

REVOKE ALL ON FUNCTION public.save_print_settings(text,text,text,numeric,numeric,numeric,numeric,text,numeric,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,numeric,boolean,boolean,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_print_settings(text,text,text,numeric,numeric,numeric,numeric,text,numeric,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text,text,numeric,boolean,boolean,boolean,text) TO authenticated;
