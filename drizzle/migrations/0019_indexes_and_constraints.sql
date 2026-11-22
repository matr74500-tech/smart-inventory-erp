-- Add missing indexes for foreign keys and performance
CREATE INDEX IF NOT EXISTS purchase_order_items_order_id_idx ON public.purchase_order_items (order_id);
CREATE INDEX IF NOT EXISTS purchase_order_items_product_id_idx ON public.purchase_order_items (product_id);
CREATE INDEX IF NOT EXISTS product_suppliers_supplier_id_idx ON public.product_suppliers (supplier_id);
CREATE INDEX IF NOT EXISTS shelf_stock_warehouse_id_idx ON public.shelf_stock (warehouse_id);
CREATE INDEX IF NOT EXISTS stock_movements_product_id_warehouse_id_idx ON public.stock_movements (product_id, warehouse_id);
CREATE INDEX IF NOT EXISTS stock_movements_created_at_idx ON public.stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS sales_items_product_id_idx ON public.sales_items (product_id);
CREATE INDEX IF NOT EXISTS cash_transactions_source_idx ON public.cash_transactions (source_type, source_id);
CREATE INDEX IF NOT EXISTS vouchers_customer_id_idx ON public.vouchers (customer_id);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON public.customers (phone);
CREATE INDEX IF NOT EXISTS products_category_id_idx ON public.products (category_id);
CREATE INDEX IF NOT EXISTS products_warehouse_id_idx ON public.products (warehouse_id);

-- Add CHECK constraint for stock_movements.kind
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_movements_kind_check'
    AND conrelid = 'public.stock_movements'::regclass
  ) THEN
    ALTER TABLE public.stock_movements
    ADD CONSTRAINT stock_movements_kind_check
    CHECK (kind IN ('count','purchase','sale','transfer_in','transfer_out','restock','adjustment','shelf_in','shelf_out'));
  END IF;
END $$;

-- Add payment_methods to app_settings
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS payment_methods jsonb NOT NULL DEFAULT '["نقدي YER", "سعودي SAR", "تحويلات شبكات محلية", "آجل"]'::jsonb;

-- Fix warehouses RLS: allow storekeepers without explicit permissions to manage warehouses
DROP POLICY IF EXISTS "managers manage warehouses" ON public.warehouses;
CREATE POLICY "managers manage warehouses" ON public.warehouses FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'storekeeper') OR
    (public.employee_can(auth.uid(),'pages','settings') AND public.employee_can(auth.uid(),'actions','settings.manage'))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR
    public.has_role(auth.uid(),'storekeeper') OR
    (public.employee_can(auth.uid(),'pages','settings') AND public.employee_can(auth.uid(),'actions','settings.manage'))
  );