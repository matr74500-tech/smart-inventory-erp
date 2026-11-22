-- Reliability foundation: payment plans belong to the customer ledger, not browser storage.
create table if not exists public.customer_payment_plans (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  total_amount_yer numeric not null check (total_amount_yer > 0),
  installments_count integer not null default 3 check (installments_count between 1 and 120),
  due_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'overdue', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.customer_payment_plans to authenticated;
grant all on public.customer_payment_plans to service_role;
alter table public.customer_payment_plans enable row level security;
create policy "read customer payment plans" on public.customer_payment_plans
  for select to authenticated using (true);

create or replace function public.save_payment_plan(
  _customer_id uuid,
  _total_amount_yer numeric,
  _installments_count integer,
  _due_date date
)
returns public.customer_payment_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.customer_payment_plans;
begin
  if not public.employee_can(auth.uid(), 'pages', 'customers')
    or not public.employee_can(auth.uid(), 'actions', 'customers.manage') then
    raise exception 'not authorized';
  end if;

  insert into public.customer_payment_plans (
    customer_id, total_amount_yer, installments_count, due_date, created_by
  ) values (
    _customer_id, _total_amount_yer, _installments_count, _due_date, auth.uid()
  ) returning * into result;

  return result;
end;
$$;

grant execute on function public.save_payment_plan(uuid, numeric, integer, date) to authenticated;

create or replace function public.refresh_payment_plan_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  update public.customer_payment_plans
  set status = 'overdue', updated_at = now()
  where status = 'active' and due_date < current_date;
end;
$$;

create or replace function public.update_payment_plan_status(_id uuid, _status text)
returns public.customer_payment_plans
language plpgsql
security definer
set search_path = public
as $$
declare result public.customer_payment_plans;
begin
  if not public.employee_can(auth.uid(), 'pages', 'customers')
    or not public.employee_can(auth.uid(), 'actions', 'customers.manage') then
    raise exception 'not authorized';
  end if;
  if _status not in ('active', 'completed', 'overdue', 'cancelled') then
    raise exception 'invalid payment plan status';
  end if;
  update public.customer_payment_plans
  set status = _status, updated_at = now()
  where id = _id
  returning * into result;
  if result.id is null then raise exception 'payment plan not found'; end if;
  return result;
end;
$$;

grant execute on function public.refresh_payment_plan_statuses() to authenticated;
grant execute on function public.update_payment_plan_status(uuid, text) to authenticated;

alter table public.customer_payment_plans replica identity full;
alter publication supabase_realtime add table public.customer_payment_plans;
