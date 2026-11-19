ALTER TABLE public.app_settings
  ADD COLUMN inactive_customer_days integer
  CHECK (inactive_customer_days IS NULL OR inactive_customer_days > 0);
