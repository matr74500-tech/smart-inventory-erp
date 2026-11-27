-- Sales defaults/settings table (single row pattern recommended; allow multiple rows but app will use first)
CREATE TABLE IF NOT EXISTS public.sales_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  default_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  is_customer_required boolean NOT NULL DEFAULT false,
  is_warehouse_required boolean NOT NULL DEFAULT false,
  apply_to_quick_sales boolean NOT NULL DEFAULT true,
  apply_to_new_invoice boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure only one settings row (singleton)
CREATE UNIQUE INDEX IF NOT EXISTS sales_settings_singleton_idx ON public.sales_settings ((true));

GRANT SELECT, INSERT, UPDATE ON public.sales_settings TO authenticated;
GRANT ALL ON public.sales_settings TO service_role;

ALTER TABLE public.sales_settings ENABLE ROW LEVEL SECURITY;

-- Read: users who can access sales or settings pages
CREATE POLICY "read sales settings" ON public.sales_settings
  FOR SELECT TO authenticated
  USING (
    public.employee_can(auth.uid(), 'pages', 'sales')
    OR public.employee_can(auth.uid(), 'pages', 'settings')
  );

-- Manage: users with settings.manage action (and pages.settings)
CREATE POLICY "manage sales settings" ON public.sales_settings
  FOR ALL TO authenticated
  USING (
    public.employee_can(auth.uid(), 'pages', 'settings')
    AND public.employee_can(auth.uid(), 'actions', 'settings.manage')
  )
  WITH CHECK (
    public.employee_can(auth.uid(), 'pages', 'settings')
    AND public.employee_can(auth.uid(), 'actions', 'settings.manage')
  );

-- Updated_at trigger (reuse if exists pattern not required; simple trigger)
CREATE OR REPLACE FUNCTION public.set_sales_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_settings_updated_at ON public.sales_settings;
CREATE TRIGGER trg_sales_settings_updated_at
  BEFORE UPDATE ON public.sales_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_settings_updated_at();
