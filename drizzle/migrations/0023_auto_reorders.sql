-- ============================================================================
-- طلبات وأوامر الشراء التلقائية (Automatic Purchase Orders)
-- يولّد أوامر شراء تلقائية لكل مورد حسب الأصناف التي بلغت حد الطلب، ويراعي
-- أولوية المورد (المورد الرئيسي) لكل صنف، ثم يحوّلها إلى أوامر شراء معتمدة
-- تلقائيًا أو يدويًا حسب إعداد الطريقة لكل مورد.
-- ============================================================================

-- 1) طريقة التحويل لكل مورد: auto (إرسال تلقائي) أو manual (مسودة للمراجعة)
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS po_method text NOT NULL DEFAULT 'manual'
  CHECK (po_method IN ('auto','manual'));

-- 2) توليد أوامر الشراء التلقائية
--    يجمع الأصناف التي انخفضت إلى حد الطلب (stock.quantity <= reorder_level)
--    حسب مورّدها الرئيسي (product_suppliers.is_primary) والمستودع،
--    ويتجاهل الأصناف التي لديها أمر شراء مفتوح (draft/ordered) لتجنب التكرار.
--    للمتاجر التي طريقتها auto يُرسل الأمر تلقائيًا (ordered)، وللأخرى يُنشأ كمسودة.
CREATE OR REPLACE FUNCTION public.generate_purchase_orders()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  grp record;
  v_items jsonb;
  v_order uuid;
  v_method text;
  v_drafts int := 0;
  v_submitted int := 0;
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','purchase_orders')
    OR NOT public.employee_can(auth.uid(),'actions','purchase_orders.manage') THEN
    RAISE EXCEPTION 'غير مصرح بتوليد أوامر الشراء';
  END IF;

  -- كل مجموعة (مورد رئيسي + مستودع) لديها أصناف ناقصة
  FOR grp IN
    SELECT DISTINCT ps.supplier_id, st.warehouse_id
    FROM public.stock st
    JOIN public.products p ON p.id = st.product_id
    JOIN public.product_suppliers ps ON ps.product_id = st.product_id AND ps.is_primary
    JOIN public.suppliers s ON s.id = ps.supplier_id AND s.active
    WHERE p.reorder_level > 0 AND p.reorder_qty > 0
      AND st.quantity <= p.reorder_level
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_order_items poi
        JOIN public.purchase_orders po ON po.id = poi.order_id
        WHERE poi.product_id = st.product_id
          AND po.warehouse_id = st.warehouse_id
          AND po.status IN ('draft','ordered')
      )
  LOOP
    -- أصناف هذه المجموعة (مع مراعاة عدم وجود أمر مفتوح لنفس الصنف/المستودع)
    SELECT coalesce(jsonb_agg(
             jsonb_build_object(
               'product_id', x.product_id,
               'quantity', x.qty,
               'unit_cost', x.cost
             ) ORDER BY x.product_id), '[]'::jsonb)
      INTO v_items
    FROM (
      SELECT st.product_id,
             p.reorder_qty AS qty,
             coalesce(nullif(ps.last_cost, 0), p.cost) AS cost
      FROM public.stock st
      JOIN public.products p ON p.id = st.product_id
      JOIN public.product_suppliers ps ON ps.product_id = st.product_id AND ps.is_primary
      WHERE ps.supplier_id = grp.supplier_id
        AND st.warehouse_id = grp.warehouse_id
        AND p.reorder_level > 0 AND p.reorder_qty > 0
        AND st.quantity <= p.reorder_level
        AND NOT EXISTS (
          SELECT 1 FROM public.purchase_order_items poi
          JOIN public.purchase_orders po ON po.id = poi.order_id
          WHERE poi.product_id = st.product_id
            AND po.warehouse_id = st.warehouse_id
            AND po.status IN ('draft','ordered')
        )
    ) x;

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
      CONTINUE;
    END IF;

    -- إنشاء أمر الشراء كمسودة
    INSERT INTO public.purchase_orders (supplier_id, warehouse_id, status, notes, created_by)
      VALUES (grp.supplier_id, grp.warehouse_id, 'draft', 'طلب شراء تلقائي', auth.uid())
      RETURNING id INTO v_order;

    INSERT INTO public.purchase_order_items (order_id, product_id, quantity, unit_cost)
      SELECT v_order,
             (i->>'product_id')::uuid,
             (i->>'quantity')::numeric,
             (i->>'unit_cost')::numeric
      FROM jsonb_array_elements(v_items) i;

    v_drafts := v_drafts + 1;

    -- التحويل إلى أمر شراء معتمد حسب إعداد المورد
    SELECT po_method INTO v_method FROM public.suppliers WHERE id = grp.supplier_id;
    IF v_method = 'auto' THEN
      UPDATE public.purchase_orders SET status = 'ordered', submitted_at = now() WHERE id = v_order;
      v_submitted := v_submitted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('drafts', v_drafts, 'submitted', v_submitted);
END $$;

-- 3) ضبط طريقة التحويل لمورد
CREATE OR REPLACE FUNCTION public.set_supplier_order_method(_id uuid, _method text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (
       (public.employee_can(auth.uid(),'pages','settings') AND public.employee_can(auth.uid(),'actions','settings.manage'))
    OR (public.employee_can(auth.uid(),'pages','purchase_orders') AND public.employee_can(auth.uid(),'actions','purchase_orders.manage'))
    OR (public.employee_can(auth.uid(),'pages','suppliers') AND public.employee_can(auth.uid(),'actions','suppliers.manage'))
  ) THEN
    RAISE EXCEPTION 'غير مصرح بتعديل إعداد المورد';
  END IF;
  IF _method NOT IN ('auto','manual') THEN
    RAISE EXCEPTION 'طريقة غير صالحة';
  END IF;
  UPDATE public.suppliers SET po_method = _method, updated_at = now()
    WHERE id = _id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'المورد غير موجود'; END IF;
END $$;

-- 4) الصلاحيات
REVOKE ALL ON FUNCTION public.generate_purchase_orders() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_supplier_order_method(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_purchase_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_supplier_order_method(uuid,text) TO authenticated;