-- Additive migration: cashier / recipient shifts (ورديات) with cash liquidity
-- tracking and expected-vs-actual comparison on close. Existing tables are
-- untouched; every object here is new or guarded so re-running stays safe.
--
-- A shift aggregates every posted cash movement (sales, receipt/payment
-- vouchers) whose created_at falls inside the shift window, so the shift stays
-- in sync with sales / returns / receipts / expenses without duplicating data.

CREATE TABLE IF NOT EXISTS public.cash_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opening jsonb NOT NULL DEFAULT '{}'::jsonb,
  counted jsonb,
  expected jsonb,
  difference jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- At most one open shift at a time (single cash drawer).
CREATE UNIQUE INDEX IF NOT EXISTS cash_shifts_single_open
  ON public.cash_shifts ((1)) WHERE status = 'open';

GRANT SELECT ON public.cash_shifts TO authenticated;
GRANT ALL ON public.cash_shifts TO service_role;
ALTER TABLE public.cash_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read cash shifts" ON public.cash_shifts;
CREATE POLICY "read cash shifts" ON public.cash_shifts FOR SELECT TO authenticated
  USING (public.employee_can(auth.uid(),'pages','cash') OR public.employee_can(auth.uid(),'pages','reports'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='cash_shifts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_shifts;
  END IF;
END $$;

-- Open a new shift with an opening float per currency: {"YER": 50000, ...}.
CREATE OR REPLACE FUNCTION public.open_cash_shift(_opening jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE shift_id uuid; item record; amt numeric;
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','cash')
     OR NOT public.employee_can(auth.uid(),'actions','cash.manage') THEN
    RAISE EXCEPTION 'غير مصرح بإدارة الورديات';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cash_shifts WHERE status='open') THEN
    RAISE EXCEPTION 'توجد وردية مفتوحة بالفعل';
  END IF;
  IF _opening IS NOT NULL AND jsonb_typeof(_opening) <> 'object' THEN
    RAISE EXCEPTION 'بيانات الرصيد الافتتاحي غير صالحة';
  END IF;
  IF _opening IS NOT NULL AND jsonb_typeof(_opening)='object' THEN
    FOR item IN SELECT key AS k, value AS v FROM jsonb_object_each(_opening) LOOP
      amt := (item.v #>> '{}')::numeric;
      IF amt IS NULL OR amt < 0 THEN
        RAISE EXCEPTION 'قيمة رصيد افتتاحي غير صالحة للعملة %', item.k;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.currencies WHERE currencies.code = item.k AND active) THEN
        RAISE EXCEPTION 'العملة غير موجودة أو غير نشطة: %', item.k;
      END IF;
    END LOOP;
  END IF;
  INSERT INTO public.cash_shifts(opened_by, opening, status)
    VALUES(auth.uid(), coalesce(_opening,'{}'::jsonb), 'open')
    RETURNING id INTO shift_id;
  RETURN shift_id;
END $$;

-- Close a shift: compare the counted cash with the expected cash
-- (opening float + net posted movements inside the shift window).
CREATE OR REPLACE FUNCTION public.close_cash_shift(_id uuid, _counts jsonb, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sh public.cash_shifts; item record; code text; opening numeric; counted numeric;
  expected numeric; difference numeric; cnt_json jsonb := '{}'::jsonb;
  exp_json jsonb := '{}'::jsonb; diff_json jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.employee_can(auth.uid(),'pages','cash')
     OR NOT public.employee_can(auth.uid(),'actions','cash.close') THEN
    RAISE EXCEPTION 'غير مصرح بإقفال الوردية';
  END IF;
  SELECT * INTO sh FROM public.cash_shifts WHERE id=_id FOR UPDATE;
  IF sh.id IS NULL OR sh.status <> 'open' THEN
    RAISE EXCEPTION 'الوردية غير موجودة أو مغلقة بالفعل';
  END IF;
  IF _counts IS NULL OR jsonb_typeof(_counts) <> 'object' THEN
    RAISE EXCEPTION 'بيانات العد الفعلي غير صالحة';
  END IF;
  FOR item IN SELECT key AS k, value AS v FROM jsonb_object_each(_counts) LOOP
    code := item.k;
    counted := (item.v #>> '{}')::numeric;
    IF counted IS NULL OR counted < 0 THEN
      RAISE EXCEPTION 'قيمة عد غير صالحة للعملة %', code;
    END IF;
    opening := coalesce((sh.opening->>code)::numeric, 0);
    SELECT opening + coalesce(sum(ct.amount),0) INTO expected
      FROM public.cash_transactions ct
      WHERE ct.affects_drawer AND ct.currency_code = code
        AND ct.created_at >= sh.opened_at AND ct.created_at <= now();
    difference := counted - expected;
    cnt_json := cnt_json || jsonb_build_object(code, counted);
    exp_json := exp_json || jsonb_build_object(code, expected);
    diff_json := diff_json || jsonb_build_object(code, difference);
  END LOOP;
  UPDATE public.cash_shifts SET status='closed', closed_at=now(), closed_by=auth.uid(),
    counted=cnt_json, expected=exp_json, difference=diff_json,
    notes=coalesce(_notes, notes)
    WHERE id=_id;
END $$;

REVOKE ALL ON FUNCTION public.open_cash_shift(jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.close_cash_shift(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.open_cash_shift(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_shift(uuid,jsonb,text) TO authenticated;