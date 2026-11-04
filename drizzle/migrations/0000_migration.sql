create type public.app_role as enum ('admin','storekeeper','cashier');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.can_manage_stock(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','storekeeper'))
$$;

create policy "staff read profiles" on public.profiles for select to authenticated using (true);
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "read own or admin roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin add roles" on public.user_roles for insert to authenticated
  with check (public.has_role(auth.uid(),'admin'));
create policy "admin remove roles" on public.user_roles for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
          new.raw_user_meta_data->>'full_name');
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'cashier');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.warehouses to authenticated;
grant all on public.warehouses to service_role;
alter table public.warehouses enable row level security;
create policy "read warehouses" on public.warehouses for select to authenticated using (true);
create policy "admin manage warehouses" on public.warehouses for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  barcode text unique,
  unit text not null default 'حبة',
  price numeric(12,2) not null default 0,
  reorder_level numeric not null default 0,
  reorder_qty numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "read products" on public.products for select to authenticated using (true);
create policy "stock managers write products" on public.products for insert to authenticated
  with check (public.can_manage_stock(auth.uid()));
create policy "stock managers update products" on public.products for update to authenticated
  using (public.can_manage_stock(auth.uid()));
create policy "admin delete products" on public.products for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

create table public.stock (
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  quantity numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, warehouse_id)
);
grant select on public.stock to authenticated;
grant all on public.stock to service_role;
alter table public.stock enable row level security;
create policy "read stock" on public.stock for select to authenticated using (true);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  kind text not null,
  quantity numeric not null,
  note text,
  user_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;
alter table public.stock_movements enable row level security;
create policy "read movements" on public.stock_movements for select to authenticated using (true);

create table public.reorder_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  quantity numeric not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  received_at timestamptz
);
grant select on public.reorder_requests to authenticated;
grant all on public.reorder_requests to service_role;
alter table public.reorder_requests enable row level security;
create policy "read reorders" on public.reorder_requests for select to authenticated using (true);

-- auto reorder when stock reaches reorder level
create or replace function public.check_reorder()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select reorder_level, reorder_qty into p from public.products where id = new.product_id;
  if p.reorder_level > 0 and new.quantity <= p.reorder_level
     and not exists (select 1 from public.reorder_requests
                     where product_id = new.product_id and warehouse_id = new.warehouse_id and status = 'pending') then
    insert into public.reorder_requests (product_id, warehouse_id, quantity)
    values (new.product_id, new.warehouse_id, greatest(p.reorder_qty, p.reorder_level * 2 - new.quantity, 1));
  end if;
  return new;
end $$;
create trigger stock_reorder after insert or update of quantity on public.stock
  for each row execute function public.check_reorder();

-- set quantity (initial entry / physical count)
create or replace function public.set_stock(_product uuid, _warehouse uuid, _qty numeric, _kind text default 'count')
returns void language plpgsql security definer set search_path = public as $$
declare old_qty numeric;
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'غير مصرح'; end if;
  if _qty < 0 then raise exception 'الكمية لا يمكن أن تكون سالبة'; end if;
  select quantity into old_qty from public.stock where product_id=_product and warehouse_id=_warehouse;
  insert into public.stock (product_id, warehouse_id, quantity, updated_at) values (_product,_warehouse,_qty,now())
  on conflict (product_id, warehouse_id) do update set quantity = excluded.quantity, updated_at = now();
  insert into public.stock_movements (product_id, warehouse_id, kind, quantity, user_id)
  values (_product,_warehouse,_kind,_qty - coalesce(old_qty,0), auth.uid());
end $$;

create or replace function public.transfer_stock(_product uuid, _from uuid, _to uuid, _qty numeric)
returns void language plpgsql security definer set search_path = public as $$
declare avail numeric;
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'غير مصرح'; end if;
  if _qty <= 0 then raise exception 'الكمية يجب أن تكون أكبر من صفر'; end if;
  if _from = _to then raise exception 'اختر مستودعين مختلفين'; end if;
  select quantity into avail from public.stock where product_id=_product and warehouse_id=_from for update;
  if coalesce(avail,0) < _qty then raise exception 'الكمية المتوفرة غير كافية'; end if;
  update public.stock set quantity = quantity - _qty, updated_at = now() where product_id=_product and warehouse_id=_from;
  insert into public.stock (product_id, warehouse_id, quantity) values (_product,_to,_qty)
  on conflict (product_id, warehouse_id) do update set quantity = public.stock.quantity + excluded.quantity, updated_at = now();
  insert into public.stock_movements (product_id, warehouse_id, kind, quantity, user_id) values
    (_product,_from,'transfer_out',-_qty,auth.uid()), (_product,_to,'transfer_in',_qty,auth.uid());
end $$;

create or replace function public.receive_reorder(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.can_manage_stock(auth.uid()) then raise exception 'غير مصرح'; end if;
  select * into r from public.reorder_requests where id=_id and status='pending' for update;
  if not found then raise exception 'الطلب غير موجود'; end if;
  update public.reorder_requests set status='received', received_at=now() where id=_id;
  insert into public.stock (product_id, warehouse_id, quantity) values (r.product_id,r.warehouse_id,r.quantity)
  on conflict (product_id, warehouse_id) do update set quantity = public.stock.quantity + excluded.quantity, updated_at = now();
  insert into public.stock_movements (product_id, warehouse_id, kind, quantity, user_id)
  values (r.product_id,r.warehouse_id,'restock',r.quantity,auth.uid());
end $$;

revoke execute on function public.set_stock, public.transfer_stock, public.receive_reorder from anon, public;
grant execute on function public.set_stock, public.transfer_stock, public.receive_reorder to authenticated;

alter publication supabase_realtime add table public.products, public.stock, public.reorder_requests, public.stock_movements;

insert into public.warehouses (name) values ('المستودع الرئيسي'), ('فرع المبيعات');