-- Offline operation receipts table for idempotent replay
create table if not exists public.offline_operation_receipts (
  operation_id uuid primary key,
  operation_kind text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select, insert on public.offline_operation_receipts to authenticated;
grant all on public.offline_operation_receipts to service_role;
alter table public.offline_operation_receipts enable row level security;
create policy "users read own receipts" on public.offline_operation_receipts for select to authenticated using (user_id = auth.uid());
create policy "users insert own receipts" on public.offline_operation_receipts for insert to authenticated with check (user_id = auth.uid());

-- Idempotent wrapper for post_purchase to support offline replay
create or replace function public.post_purchase_offline(
  _operation_id uuid,
  _supplier text,
  _warehouse uuid,
  _items jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.offline_operation_receipts where operation_id = _operation_id) then
    return (select id from public.purchase_invoices where operation_id = _operation_id);
  end if;
  insert into public.offline_operation_receipts (operation_id, operation_kind, user_id)
    values (_operation_id, 'post_purchase', auth.uid());
  return public.post_purchase(_supplier, _warehouse, _items);
end $$;

revoke execute on function public.post_purchase from anon, public;
revoke execute on function public.post_purchase_offline(uuid, text, uuid, jsonb) from anon, public;
grant execute on function public.post_purchase(text, uuid, jsonb) to authenticated;
grant execute on function public.post_purchase_offline(uuid, text, uuid, jsonb) to authenticated;

-- Add operation_id column to purchase_invoices for idempotency lookup
alter table public.purchase_invoices add column if not exists operation_id uuid unique;
create index if not exists purchase_invoices_operation_id_idx on public.purchase_invoices(operation_id);

-- Update the original post_purchase to set operation_id
create or replace function public.post_purchase(_supplier text, _warehouse uuid, _items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv uuid; it jsonb; q numeric; c numeric; tot numeric := 0;
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'غير مصرح'; end if;
  if jsonb_array_length(_items) = 0 then raise exception 'الفاتورة فارغة'; end if;
  insert into public.purchase_invoices (supplier, warehouse_id, user_id) values (_supplier, _warehouse, auth.uid()) returning id into inv;
  for it in select * from jsonb_array_elements(_items) loop
    q := (it->>'qty')::numeric; c := coalesce((it->>'cost')::numeric, 0);
    if q is null or q <= 0 then raise exception 'كمية غير صحيحة'; end if;
    insert into public.purchase_items (invoice_id, product_id, quantity, cost) values (inv, (it->>'product_id')::uuid, q, c);
    insert into public.stock (product_id, warehouse_id, quantity) values ((it->>'product_id')::uuid, _warehouse, q)
      on conflict (product_id, warehouse_id) do update set quantity = public.stock.quantity + excluded.quantity, updated_at = now();
    insert into public.stock_movements (product_id, warehouse_id, kind, quantity, user_id, note)
      values ((it->>'product_id')::uuid, _warehouse, 'purchase', q, auth.uid(), 'فاتورة شراء');
    update public.products set
      cost = case when c > 0 then c else cost end,
      price = coalesce(nullif(it->>'price','')::numeric, price),
      price_special = coalesce(nullif(it->>'price_special','')::numeric, price_special),
      price_half = coalesce(nullif(it->>'price_half','')::numeric, price_half),
      price_wholesale = coalesce(nullif(it->>'price_wholesale','')::numeric, price_wholesale),
      price_bulk = coalesce(nullif(it->>'price_bulk','')::numeric, price_bulk),
      updated_at = now()
    where id = (it->>'product_id')::uuid;
    tot := tot + q * c;
  end loop;
  update public.purchase_invoices set total = tot where id = inv;
  return inv;
end $$;

alter publication supabase_realtime add table public.offline_operation_receipts;