-- Correct receipt writes and add atomic offline operations for stocktake and cash.
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
  insert into public.offline_operation_receipts (operation_id, operation_kind, user_id)
  values (_operation_id, 'set_stock', auth.uid());
  perform public.set_stock(_product, _warehouse, _qty, _kind);
end $$;

create or replace function public.transfer_shelf_stock_offline(
  _operation_id uuid, _product uuid, _from_wh uuid, _from_shelf text,
  _to_wh uuid, _to_shelf text, _qty numeric
) returns void language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return; end if;
  insert into public.offline_operation_receipts (operation_id, operation_kind, user_id)
  values (_operation_id, 'transfer_shelf_stock', auth.uid());
  perform public.transfer_shelf_stock(_product, _from_wh, _from_shelf, _to_wh, _to_shelf, _qty);
end $$;

create or replace function public.post_purchase_offline(
  _operation_id uuid, _supplier text, _warehouse uuid, _items jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  select null::uuid into result;
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return result; end if;
  insert into public.offline_operation_receipts (operation_id, operation_kind, user_id)
  values (_operation_id, 'post_purchase', auth.uid());
  result := public.post_purchase(_supplier, _warehouse, _items);
  return result;
end $$;

create or replace function public.post_sale_offline(_operation_id uuid, _id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return; end if;
  if exists (select 1 from public.sales_invoices where id=_id and status='posted') then return; end if;
  insert into public.offline_operation_receipts (operation_id, operation_kind, user_id)
  values (_operation_id, 'post_sale', auth.uid());
  perform public.post_sale(_id);
end $$;

create or replace function public.set_stock_batch_offline(
  _operation_id uuid, _warehouse uuid, _kind text, _items jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare item jsonb;
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return; end if;
  if jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then raise exception 'بيانات الجرد غير صالحة'; end if;
  insert into public.offline_operation_receipts (operation_id, operation_kind, user_id)
  values (_operation_id, 'set_stock_batch', auth.uid());
  for item in select value from jsonb_array_elements(_items) loop
    perform public.set_stock((item->>'product_id')::uuid, _warehouse, (item->>'quantity')::numeric, _kind);
  end loop;
end $$;

create or replace function public.close_daily_cash_offline(
  _operation_id uuid, _business_date date, _counts jsonb, _notes text
) returns void language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return; end if;
  insert into public.offline_operation_receipts (operation_id, operation_kind, user_id)
  values (_operation_id, 'close_daily_cash', auth.uid());
  perform public.close_daily_cash(_business_date, _counts, _notes);
end $$;

create or replace function public.save_voucher_draft_offline(
  _operation_id uuid, _id uuid, _kind text, _customer_id uuid, _payee text, _category text,
  _amount numeric, _currency_code text, _rate_to_yer numeric, _payment_method text,
  _affects_drawer boolean, _notes text
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return _id; end if;
  insert into public.offline_operation_receipts (operation_id, operation_kind, user_id)
  values (_operation_id, 'save_voucher_draft', auth.uid());
  insert into public.vouchers (id, kind, amount, currency_code, exchange_rate_to_yer, created_by)
  values (_id, _kind, _amount, _currency_code, _rate_to_yer, auth.uid()) on conflict (id) do nothing;
  return public.save_voucher_draft(_id, _kind, _customer_id, _payee, _category, _amount,
    _currency_code, _rate_to_yer, _payment_method, _affects_drawer, _notes);
end $$;

create or replace function public.post_voucher_offline(_operation_id uuid, _id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return; end if;
  if exists (select 1 from public.vouchers where id=_id and status='posted') then return; end if;
  insert into public.offline_operation_receipts (operation_id, operation_kind, user_id)
  values (_operation_id, 'post_voucher', auth.uid());
  perform public.post_voucher(_id);
end $$;

create or replace function public.save_customer_offline(
  _operation_id uuid, _id uuid, _name text, _phone text, _secondary_phone text,
  _address text, _customer_type text, _credit_limit_yer numeric, _inactive_alert_enabled boolean
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return _id; end if;
  insert into public.offline_operation_receipts (operation_id, operation_kind, user_id)
  values (_operation_id, 'save_customer', auth.uid());
  insert into public.customers (id, name, phone, address) values (_id, 'قيد المزامنة', '', '')
  on conflict (id) do nothing;
  return public.save_customer(_id, _name, _phone, _secondary_phone, _address,
    _customer_type, _credit_limit_yer, _inactive_alert_enabled);
end $$;

grant execute on function public.set_stock_batch_offline(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.close_daily_cash_offline(uuid,date,jsonb,text) to authenticated;
grant execute on function public.save_voucher_draft_offline(uuid,uuid,text,uuid,text,text,numeric,text,numeric,text,boolean,text) to authenticated;
grant execute on function public.post_voucher_offline(uuid,uuid) to authenticated;
grant execute on function public.save_customer_offline(uuid,uuid,text,text,text,text,text,numeric,boolean) to authenticated;
