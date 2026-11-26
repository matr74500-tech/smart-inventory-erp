-- Create offline_rpc_allowlist table for RPC queue permission control
CREATE TABLE IF NOT EXISTS public.offline_rpc_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rpc_name text NOT NULL UNIQUE,
  allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.offline_rpc_allowlist ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read allowlist
CREATE POLICY "Authenticated users can read offline_rpc_allowlist"
  ON public.offline_rpc_allowlist
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert all allowed RPC names used by the offline queue
INSERT INTO public.offline_rpc_allowlist (rpc_name, allowed) VALUES
  ('save_payment_plan', true),
  ('save_sale_draft_offline', true),
  ('save_purchase_order_draft_offline', true),
  ('post_sale_offline', true),
  ('post_return_offline', true),
  ('post_purchase_offline', true),
  ('set_stock_offline', true),
  ('set_stock_batch_offline', true),
  ('transfer_shelf_stock_offline', true),
  ('close_daily_cash_offline', true),
  ('save_voucher_draft_offline', true),
  ('post_voucher_offline', true),
  ('save_customer_offline', true),
  ('save_supplier_offline', true),
  ('save_product_supplier_offline', true),
  ('save_product_offline', true),
  ('save_product_units_offline', true),
  ('save_product_opening_balances_offline', true),
  ('save_product_suppliers_offline', true),
  ('save_catalog_setting_offline', true),
  ('upload_product_image_offline', true),
  ('record_general_expense_offline', true)
ON CONFLICT (rpc_name) DO UPDATE SET allowed = EXCLUDED.allowed;
