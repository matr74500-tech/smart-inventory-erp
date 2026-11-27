-- Extend sales_items with per-line controls (batch 2)
ALTER TABLE public.sales_items
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_name text,
  ADD COLUMN IF NOT EXISTS bonus_qty numeric NOT NULL DEFAULT 0 CHECK (bonus_qty >= 0),
  ADD COLUMN IF NOT EXISTS line_discount_yer numeric NOT NULL DEFAULT 0 CHECK (line_discount_yer >= 0),
  ADD COLUMN IF NOT EXISTS line_tax_yer numeric NOT NULL DEFAULT 0 CHECK (line_tax_yer >= 0),
  ADD COLUMN IF NOT EXISTS note text;

CREATE INDEX IF NOT EXISTS sales_items_warehouse_idx ON public.sales_items (warehouse_id);
