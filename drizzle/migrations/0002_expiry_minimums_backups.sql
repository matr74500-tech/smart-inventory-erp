ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry_date date;

CREATE TABLE public.stock_minimums (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  min_qty numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, warehouse_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_minimums TO authenticated;
GRANT ALL ON public.stock_minimums TO service_role;
ALTER TABLE public.stock_minimums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read minimums" ON public.stock_minimums FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers write minimums" ON public.stock_minimums FOR ALL TO authenticated USING (public.can_manage_stock(auth.uid())) WITH CHECK (public.can_manage_stock(auth.uid()));
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_minimums;

CREATE TABLE public.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  size_bytes integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL
);
GRANT SELECT, INSERT, DELETE ON public.backups TO authenticated;
GRANT ALL ON public.backups TO service_role;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage backups" ON public.backups FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));