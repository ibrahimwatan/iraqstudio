ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS account_username text,
  ADD COLUMN IF NOT EXISTS script_content text,
  ADD COLUMN IF NOT EXISTS file_path text,
  ADD COLUMN IF NOT EXISTS file_name text;

CREATE OR REPLACE FUNCTION public.validate_product_details()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.category = 'accounts' AND (
    nullif(trim(NEW.account_name), '') IS NULL OR
    nullif(trim(NEW.account_username), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'account_details_required';
  END IF;

  IF NEW.category = 'scripts' AND nullif(trim(NEW.script_content), '') IS NULL THEN
    RAISE EXCEPTION 'script_required';
  END IF;

  IF NEW.category IN ('maps', 'studio') AND nullif(trim(NEW.file_path), '') IS NULL THEN
    RAISE EXCEPTION 'file_required';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_validate_details ON public.products;
CREATE TRIGGER products_validate_details
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_details();

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('product-files', 'product-files', false, 52428800)
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "merchants upload product files" ON storage.objects;
CREATE POLICY "merchants upload product files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-files' AND
  public.has_role(auth.uid(), 'merchant') AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "merchants read product files" ON storage.objects;
CREATE POLICY "merchants read product files" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'product-files' AND
  (owner_id = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
);

DROP POLICY IF EXISTS "merchants delete product files" ON storage.objects;
CREATE POLICY "merchants delete product files" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-files' AND
  (owner_id = auth.uid()::text OR public.has_role(auth.uid(), 'admin'))
);
