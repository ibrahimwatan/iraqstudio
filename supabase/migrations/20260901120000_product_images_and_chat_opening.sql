INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('product-files', 'product-files', false, 52428800),
  ('product-images', 'product-images', false, 5242880)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "merchants upload own product files" ON storage.objects;
CREATE POLICY "merchants upload own product files" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-files'
  AND public.has_role(auth.uid(), 'merchant')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "merchants upload own product images" ON storage.objects;
CREATE POLICY "merchants upload own product images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND public.has_role(auth.uid(), 'merchant')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "members view product images" ON storage.objects;
CREATE POLICY "members view product images" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'product-images');

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS chat_opened_at timestamptz;
ALTER TABLE public.purchases
  ALTER COLUMN chat_expires_at DROP NOT NULL,
  ALTER COLUMN chat_expires_at DROP DEFAULT;

UPDATE public.purchases
SET chat_opened_at = COALESCE(chat_opened_at, created_at),
    chat_expires_at = COALESCE(chat_expires_at, created_at + interval '24 hours')
WHERE chat_opened_at IS NULL;

CREATE OR REPLACE FUNCTION public.buy_product(_product_id uuid)
RETURNS public.purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE pr public.products; me public.profiles; res public.purchases;
BEGIN
  SELECT * INTO me FROM public.profiles WHERE id = auth.uid();
  IF me.id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF me.banned THEN RAISE EXCEPTION 'banned'; END IF;
  SELECT * INTO pr FROM public.products WHERE id = _product_id AND active FOR UPDATE;
  IF pr.id IS NULL THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF pr.stock <= 0 THEN RAISE EXCEPTION 'out_of_stock'; END IF;
  IF me.coins < pr.price THEN RAISE EXCEPTION 'insufficient_coins'; END IF;
  UPDATE public.profiles SET coins = coins - pr.price WHERE id = me.id;
  UPDATE public.products SET stock = stock - 1 WHERE id = pr.id;
  INSERT INTO public.purchases (
    user_id, product_id, product_title, price, delivery_text, delivery_file,
    merchant_id, chat_opened_at, chat_expires_at
  )
  VALUES (
    me.id, pr.id, pr.title, pr.price, pr.delivery_text, pr.delivery_file,
    pr.created_by, NULL, NULL
  )
  RETURNING * INTO res;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_purchase_chat(_purchase_id uuid)
RETURNS public.purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result_row public.purchases;
BEGIN
  IF NOT public.can_access_purchase(_purchase_id) THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  UPDATE public.purchases
  SET chat_opened_at = COALESCE(chat_opened_at, now()),
      chat_expires_at = COALESCE(chat_expires_at, now() + interval '24 hours')
  WHERE id = _purchase_id
  RETURNING * INTO result_row;

  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_chat_open(_purchase_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = _purchase_id
      AND p.chat_opened_at IS NOT NULL
      AND p.chat_expires_at > now()
  )
$$;

REVOKE ALL ON FUNCTION public.open_purchase_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_purchase_chat(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.purchase_chat_open(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_chat_open(uuid) TO authenticated;
