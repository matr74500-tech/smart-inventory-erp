-- Create the invoice identity before replaying the existing draft-saving transaction.
-- The stable id makes replay safe after a browser or network failure.
create or replace function public.save_sale_draft_offline(
  _id uuid, _customer_id uuid, _customer_name text, _warehouse uuid,
  _currency_code text, _rate_to_yer numeric, _payment_method text,
  _affects_drawer boolean, _paid_amount numeric, _discount_yer numeric,
  _tax_yer numeric, _notes text, _items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.employee_can(auth.uid(), 'pages', 'sales')
    or not public.employee_can(auth.uid(), 'actions', 'sales.draft') then
    raise exception 'غير مصرح بحفظ فواتير البيع';
  end if;

  insert into public.sales_invoices (
    id, warehouse_id, currency_code, exchange_rate_to_yer, created_by
  ) values (
    _id, _warehouse, _currency_code, _rate_to_yer, auth.uid()
  ) on conflict (id) do nothing;

  return public.save_sale_draft(
    _id, _customer_id, _customer_name, _warehouse, _currency_code,
    _rate_to_yer, _payment_method, _affects_drawer, _paid_amount,
    _discount_yer, _tax_yer, _notes, _items
  );
end;
$$;

grant execute on function public.save_sale_draft_offline(
  uuid, uuid, text, uuid, text, numeric, text, boolean, numeric, numeric, numeric, text, jsonb
) to authenticated;
