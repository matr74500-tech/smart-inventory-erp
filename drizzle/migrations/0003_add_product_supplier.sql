ALTER TABLE public.products ADD COLUMN supplier text;
COMMENT ON COLUMN public.products.supplier IS 'اسم المورد الافتراضي للصنف';