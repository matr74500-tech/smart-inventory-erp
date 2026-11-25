DROP FUNCTION IF EXISTS public.post_sale_offline(uuid, uuid);

CREATE OR REPLACE FUNCTION public.post_sale_offline(_id uuid, _operation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.sales_invoices;
  line record;
  available numeric;
  paid_in_yer numeric;
  due_yer numeric;
BEGIN
  IF NOT public.employee_can(auth.uid(), 'pages', 'sales')
    OR NOT public.employee_can(auth.uid(), 'actions', 'sales.post')
    OR NOT public.employee_can(auth.uid(), 'fields', 'quantity') THEN
    RAISE EXCEPTION 'غير مصرح بترحيل فاتورة البيع';
  END IF;

  SELECT * INTO inv
  FROM public.sales_invoices
  WHERE id = _id
  FOR UPDATE;

  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة';
  END IF;

  IF inv.status = 'posted' THEN
    RETURN;
  END IF;

  IF inv.status <> 'draft' THEN
    RAISE EXCEPTION 'لا يمكن ترحيل الفاتورة بحالتها الحالية: %', inv.status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sales_items WHERE invoice_id = inv.id) THEN
    RAISE EXCEPTION 'الفاتورة فارغة';
  END IF;

  IF coalesce(inv.affects_drawer, false) AND EXISTS (
    SELECT 1
    FROM public.daily_cash_closings
    WHERE business_date = current_date
      AND currency_code = inv.currency_code
  ) THEN
    RAISE EXCEPTION 'تم إقفال الصندوق لهذه العملة اليوم';
  END IF;

  FOR line IN
    SELECT product_id, sum(quantity) AS quantity
    FROM public.sales_items
    WHERE invoice_id = inv.id
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    SELECT quantity INTO available
    FROM public.stock
    WHERE product_id = line.product_id
      AND warehouse_id = inv.warehouse_id
    FOR UPDATE;

    IF coalesce(available, 0) < line.quantity THEN
      RAISE EXCEPTION 'الرصيد غير كافٍ للصنف %', line.product_id;
    END IF;

    UPDATE public.stock
    SET quantity = quantity - line.quantity,
        updated_at = now()
    WHERE product_id = line.product_id
      AND warehouse_id = inv.warehouse_id;

    INSERT INTO public.stock_movements (
      product_id, warehouse_id, kind, quantity, user_id, note
    )
    VALUES (
      line.product_id,
      inv.warehouse_id,
      'sale',
      -line.quantity,
      auth.uid(),
      'فاتورة بيع ' || coalesce(inv.number, inv.id::text)
        || CASE WHEN _operation_id IS NOT NULL THEN ' [op:' || _operation_id::text || ']' ELSE '' END
    );
  END LOOP;

  paid_in_yer := coalesce(inv.paid_amount, 0) * coalesce(inv.exchange_rate_to_yer, 1);
  due_yer := greatest(0, coalesce(inv.total_yer, 0) - paid_in_yer);

  IF inv.customer_id IS NOT NULL AND due_yer > 0 THEN
    UPDATE public.customers
    SET balance_yer = coalesce(balance_yer, 0) + due_yer,
        last_sale_at = now(),
        updated_at = now()
    WHERE id = inv.customer_id;
  ELSIF inv.customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET last_sale_at = now(),
        updated_at = now()
    WHERE id = inv.customer_id;
  END IF;

  IF coalesce(inv.paid_amount, 0) > 0 AND coalesce(inv.affects_drawer, false) THEN
    INSERT INTO public.cash_transactions (
      source_type, source_id, currency_code, amount, rate_to_yer,
      payment_method, affects_drawer, created_by
    )
    VALUES (
      'sale',
      inv.id,
      inv.currency_code,
      inv.paid_amount,
      coalesce(inv.exchange_rate_to_yer, 1),
      inv.payment_method,
      true,
      auth.uid()
    );
  END IF;

  UPDATE public.sales_invoices
  SET status = 'posted',
      posted_at = now(),
      updated_at = now()
  WHERE id = inv.id;
END $$;

GRANT EXECUTE ON FUNCTION public.post_sale_offline(uuid, uuid) TO authenticated;
