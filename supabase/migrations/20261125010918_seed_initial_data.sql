INSERT INTO public.warehouses (name)
VALUES ('المستودع الرئيسي'), ('فرع المبيعات')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.currencies (code, name, active, is_base)
VALUES
  ('YER', 'ريال يمني', true, true),
  ('SAR', 'ريال سعودي', false, false),
  ('USD', 'دولار أمريكي', false, false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.exchange_rates (currency_code, rate_to_yer, created_by)
SELECT 'YER', 1, id FROM auth.users LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.exchange_rates (currency_code, rate_to_yer, created_by)
SELECT 'SAR', 140, id FROM auth.users LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.exchange_rates (currency_code, rate_to_yer, created_by)
SELECT 'USD', 532, id FROM auth.users LIMIT 1
ON CONFLICT DO NOTHING;
