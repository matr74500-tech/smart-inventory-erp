-- Smart Inventory ERP
-- Offline sync bundle: migrations 0014, 0015 and 0016
-- Apply this file after migrations 0012 and 0013.

-- 0014: stable sales draft identity
create or replace function public.save_sale_draft_offline(
  _id uuid, _customer_id uuid, _customer_name text, _warehouse uuid,
  _currency_code text, _rate_to_yer numeric, _payment_method text,
  _affects_drawer boolean, _paid_amount numeric, _discount_yer numeric,
  _tax_yer numeric, _notes text, _items jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.employee_can(auth.uid(), 'pages', 'sales')
    or not public.employee_can(auth.uid(), 'actions', 'sales.draft') then
    raise exception 'غير مصرح بحفظ فواتير البيع';
  end if;
  insert into public.sales_invoices (id, warehouse_id, currency_code, exchange_rate_to_yer, created_by)
  values (_id, _warehouse, _currency_code, _rate_to_yer, auth.uid())
  on conflict (id) do nothing;
  return public.save_sale_draft(
    _id, _customer_id, _customer_name, _warehouse, _currency_code,
    _rate_to_yer, _payment_method, _affects_drawer, _paid_amount,
    _discount_yer, _tax_yer, _notes, _items
  );
end;
$$;
grant execute on function public.save_sale_draft_offline(
  uuid, uuid, text, uuid, text, numeric, text, boolean, numeric, numeric,
  numeric, text, jsonb
) to authenticated;

-- 0015: stable purchase-order draft identity
create or replace function public.save_purchase_order_draft_offline(
  _id uuid, _supplier_id uuid, _warehouse uuid, _notes text, _items jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.employee_can(auth.uid(),'pages','purchase_orders')
    or not public.employee_can(auth.uid(),'actions','purchase_orders.manage') then
    raise exception 'غير مصرح بإدارة أوامر الشراء';
  end if;
  insert into public.purchase_orders (id, supplier_id, warehouse_id, created_by)
  values (_id, _supplier_id, _warehouse, auth.uid())
  on conflict (id) do nothing;
  return public.save_purchase_order_draft(_id, _supplier_id, _warehouse, _notes, _items);
end;
$$;
grant execute on function public.save_purchase_order_draft_offline(uuid,uuid,uuid,text,jsonb)
to authenticated;

-- 0016: atomic idempotency receipts for inventory operations
create table if not exists public.offline_operation_receipts (
  operation_id uuid primary key,
  operation_kind text not null,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
grant all on public.offline_operation_receipts to service_role;
alter table public.offline_operation_receipts enable row level security;
drop policy if exists "read own operation receipts" on public.offline_operation_receipts;
create policy "read own operation receipts" on public.offline_operation_receipts
  for select to authenticated using (user_id = auth.uid());

create or replace function public.set_stock_offline(
  _operation_id uuid, _product uuid, _warehouse uuid, _qty numeric, _kind text default 'count'
) returns void language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return; end if;
  insert into public.offline_operation_receipts values (_operation_id, 'set_stock', auth.uid());
  perform public.set_stock(_product, _warehouse, _qty, _kind);
end $$;

create or replace function public.transfer_shelf_stock_offline(
  _operation_id uuid, _product uuid, _from_wh uuid, _from_shelf text,
  _to_wh uuid, _to_shelf text, _qty numeric
) returns void language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return; end if;
  insert into public.offline_operation_receipts values (_operation_id, 'transfer_shelf_stock', auth.uid());
  perform public.transfer_shelf_stock(_product, _from_wh, _from_shelf, _to_wh, _to_shelf, _qty);
end $$;

create or replace function public.post_purchase_offline(
  _operation_id uuid, _supplier text, _warehouse uuid, _items jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return null; end if;
  insert into public.offline_operation_receipts values (_operation_id, 'post_purchase', auth.uid());
  result := public.post_purchase(_supplier, _warehouse, _items);
  return result;
end $$;

create or replace function public.post_sale_offline(_operation_id uuid, _id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return; end if;
  if exists (select 1 from public.sales_invoices where id=_id and status='posted') then return; end if;
  insert into public.offline_operation_receipts values (_operation_id, 'post_sale', auth.uid());
  perform public.post_sale(_id);
end $$;

grant execute on function public.set_stock_offline(uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function public.transfer_shelf_stock_offline(uuid,uuid,uuid,text,uuid,text,numeric) to authenticated;
grant execute on function public.post_purchase_offline(uuid,text,uuid,jsonb) to authenticated;
grant execute on function public.post_sale_offline(uuid,uuid) to authenticated;
