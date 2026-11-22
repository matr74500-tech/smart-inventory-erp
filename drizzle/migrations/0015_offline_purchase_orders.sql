-- Create a stable purchase-order identity before replaying the existing draft transaction.
create or replace function public.save_purchase_order_draft_offline(
  _id uuid, _supplier_id uuid, _warehouse uuid, _notes text, _items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
