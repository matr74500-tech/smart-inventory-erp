create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  prefix text not null default 'ITM',
  next_seq integer not null default 1,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "read categories" on public.categories for select to authenticated using (true);
create policy "managers write categories" on public.categories for all to authenticated
  using (public.can_manage_stock(auth.uid())) with check (public.can_manage_stock(auth.uid()));

create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  factor numeric not null default 1,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.units to authenticated;
grant all on public.units to service_role;
alter table public.units enable row level security;
create policy "read units" on public.units for select to authenticated using (true);
create policy "managers write units" on public.units for all to authenticated
  using (public.can_manage_stock(auth.uid())) with check (public.can_manage_stock(auth.uid()));

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'text',
  options text[] not null default '{}',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.custom_fields to authenticated;
grant all on public.custom_fields to service_role;
alter table public.custom_fields enable row level security;
create policy "read fields" on public.custom_fields for select to authenticated using (true);
create policy "managers write fields" on public.custom_fields for all to authenticated
  using (public.can_manage_stock(auth.uid())) with check (public.can_manage_stock(auth.uid()));

create table public.app_settings (
  id integer primary key default 1,
  shop_name text not null default 'سهيل سوفت',
  phone text,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "read settings" on public.app_settings for select to authenticated using (true);
create policy "admin write settings" on public.app_settings for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
insert into public.app_settings (id) values (1) on conflict do nothing;

alter table public.products
  add column code text unique,
  add column model_no text,
  add column custom_barcode text unique,
  add column description text,
  add column category_id uuid references public.categories(id) on delete set null,
  add column warehouse_id uuid references public.warehouses(id) on delete set null,
  add column shelf text,
  add column major_unit text,
  add column pack_capacity numeric not null default 1,
  add column cost numeric not null default 0,
  add column price_special numeric not null default 0,
  add column price_half numeric not null default 0,
  add column price_wholesale numeric not null default 0,
  add column price_bulk numeric not null default 0,
  add column image_url text,
  add column attributes jsonb not null default '{}'::jsonb;

create sequence public.product_barcode_seq;
create sequence public.product_code_seq;

create or replace function public.ean13(_d12 text) returns text language plpgsql immutable as $$
declare s int := 0; i int;
begin
  for i in 1..12 loop
    s := s + substr(_d12, i, 1)::int * (case when i % 2 = 0 then 3 else 1 end);
  end loop;
  return _d12 || ((10 - s % 10) % 10)::text;
end $$;

create or replace function public.product_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare pre text; n int;
begin
  if new.code is null or new.code = '' then
    if new.category_id is not null then
      update public.categories set next_seq = next_seq + 1 where id = new.category_id
        returning prefix, next_seq - 1 into pre, n;
    end if;
    if pre is null then pre := 'ITM'; n := nextval('public.product_code_seq'); end if;
    new.code := pre || '-' || lpad(n::text, 4, '0');
  end if;
  if new.custom_barcode is null or new.custom_barcode = '' then
    new.custom_barcode := public.ean13('628' || lpad(nextval('public.product_barcode_seq')::text, 9, '0'));
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger products_defaults before insert on public.products
  for each row execute function public.product_defaults();

update public.products set code = 'ITM-' || lpad(nextval('public.product_code_seq')::text, 4, '0') where code is null;
update public.products set custom_barcode = public.ean13('628' || lpad(nextval('public.product_barcode_seq')::text, 9, '0')) where custom_barcode is null;

create table public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  number serial,
  supplier text,
  warehouse_id uuid not null references public.warehouses(id),
  total numeric not null default 0,
  user_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.purchase_invoices to authenticated;
grant all on public.purchase_invoices to service_role;
alter table public.purchase_invoices enable row level security;
create policy "read purchases" on public.purchase_invoices for select to authenticated using (true);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric not null,
  cost numeric not null default 0
);
grant select on public.purchase_items to authenticated;
grant all on public.purchase_items to service_role;
alter table public.purchase_items enable row level security;
create policy "read purchase items" on public.purchase_items for select to authenticated using (true);

-- items: [{product_id, qty (base units), cost, price, price_special, price_half, price_wholesale, price_bulk}]
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
revoke execute on function public.post_purchase from anon, public;
grant execute on function public.post_purchase to authenticated;

-- warehouses: storekeepers may also manage
drop policy "admin manage warehouses" on public.warehouses;
create policy "managers manage warehouses" on public.warehouses for all to authenticated
  using (public.can_manage_stock(auth.uid())) with check (public.can_manage_stock(auth.uid()));

alter publication supabase_realtime add table public.categories, public.units, public.custom_fields, public.warehouses, public.app_settings, public.purchase_invoices;