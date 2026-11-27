-- Allow 'count' kind for opening/initial stock movements (matches set_initial_stocks and stocktake usage).
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_kind_check
  CHECK (kind IN (
    'count','purchase','sale','transfer_in','transfer_out','restock',
    'adjustment','shelf_in','shelf_out','return_in','return_out',
    'رصيد افتتاحي','initial'
  ));
