CREATE TABLE public.currencies (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{3,8}$'),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_base boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX currencies_single_base ON public.currencies (is_base) WHERE is_base;

INSERT INTO public.currencies (code, name, is_base) VALUES
  ('YER', 'ريال يمني', true),
  ('SAR', 'ريال سعودي', false),
  ('USD', 'دولار أمريكي', false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code text NOT NULL REFERENCES public.currencies(code) ON DELETE CASCADE,
  rate_to_yer numeric NOT NULL CHECK (rate_to_yer > 0),
  effective_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX exchange_rates_latest ON public.exchange_rates (currency_code, effective_at DESC);

INSERT INTO public.exchange_rates (currency_code, rate_to_yer) VALUES
  ('YER', 1),
  ('SAR', 140),
  ('USD', 532);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.currencies, public.exchange_rates TO authenticated;
GRANT ALL ON public.currencies, public.exchange_rates TO service_role;

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read currencies" ON public.currencies FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin manage currencies" ON public.currencies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "read exchange rates" ON public.exchange_rates FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin add exchange rates" ON public.exchange_rates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND (created_by IS NULL OR created_by = auth.uid()));
CREATE POLICY "admin edit exchange rates" ON public.exchange_rates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete exchange rates" ON public.exchange_rates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.currencies, public.exchange_rates;
