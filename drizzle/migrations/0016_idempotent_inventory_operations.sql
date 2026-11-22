create table if not exists public.offline_operation_receipts (
  operation_id uuid primary key,
  operation_kind text not null,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
grant all on public.offline_operation_receipts to service_role;
alter table public.offline_operation_receipts enable row level security;
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
  select null::uuid into result;
  if exists (select 1 from public.offline_operation_receipts where operation_id=_operation_id) then return result; end if;
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
