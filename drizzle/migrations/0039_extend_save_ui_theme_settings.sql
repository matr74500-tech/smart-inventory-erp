-- Batch 4 follow-up: extend save_ui_theme_settings with extra prefs
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
  _notification_vibrate boolean,
  _start_screen_path text DEFAULT '/',
  _visible_columns jsonb DEFAULT '{}'::jsonb,
  _max_discount_percent numeric DEFAULT 100,
  _feature_flags jsonb DEFAULT '{}'::jsonb
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
  IF _start_screen_path IS NULL OR length(trim(_start_screen_path)) = 0 THEN
    _start_screen_path := '/';
  END IF;
  IF _max_discount_percent IS NULL THEN
    _max_discount_percent := 100;
  END IF;
  IF _max_discount_percent < 0 OR _max_discount_percent > 100 THEN
    RAISE EXCEPTION 'نسبة الخصم القصوى غير صالحة';
  END IF;

  INSERT INTO public.ui_theme_settings (
    user_id, theme_mode, primary_color, secondary_color, accent_color,
    font_family, font_size, language, rtl_layout, compact_mode,
    show_avatars, show_animations, notification_enabled,
    notification_importance, notification_sound, notification_vibrate,
    start_screen_path, visible_columns, max_discount_percent, feature_flags,
    updated_at
  ) VALUES (
    auth.uid(), _theme_mode, _primary_color, _secondary_color, _accent_color,
    _font_family, _font_size, _language, _rtl_layout, _compact_mode,
    _show_avatars, _show_animations, _notification_enabled,
    _notification_importance, _notification_sound, _notification_vibrate,
    _start_screen_path, coalesce(_visible_columns,'{}'::jsonb), _max_discount_percent, coalesce(_feature_flags,'{}'::jsonb), now()
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
        start_screen_path = excluded.start_screen_path,
        visible_columns = excluded.visible_columns,
        max_discount_percent = excluded.max_discount_percent,
        feature_flags = excluded.feature_flags,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.save_ui_theme_settings(text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,text,jsonb,numeric,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_ui_theme_settings(text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,text,jsonb,numeric,jsonb) TO authenticated;
