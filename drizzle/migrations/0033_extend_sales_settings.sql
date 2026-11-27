-- Extend sales_settings with currency/payment/auto-add controls
ALTER TABLE public.sales_settings
  ADD COLUMN IF NOT EXISTS default_currency_code text REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS is_currency_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_payment_method text,
  ADD COLUMN IF NOT EXISTS is_payment_method_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_add_on_scan boolean NOT NULL DEFAULT true;
