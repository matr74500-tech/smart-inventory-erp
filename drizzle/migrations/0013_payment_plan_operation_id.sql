-- Make payment-plan retries idempotent for offline replay.
drop function if exists public.save_payment_plan(uuid, numeric, integer, date);

create or replace function public.save_payment_plan(
  _id uuid,
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
declare result public.customer_payment_plans;
begin
  if not public.employee_can(auth.uid(), 'pages', 'customers')
    or not public.employee_can(auth.uid(), 'actions', 'customers.manage') then
    raise exception 'not authorized';
  end if;

  insert into public.customer_payment_plans (
    id, customer_id, total_amount_yer, installments_count, due_date, created_by
  ) values (
    _id, _customer_id, _total_amount_yer, _installments_count, _due_date, auth.uid()
  ) on conflict (id) do nothing;

  select * into result from public.customer_payment_plans where id = _id;
  return result;
end;
$$;

grant execute on function public.save_payment_plan(uuid, uuid, numeric, integer, date) to authenticated;
