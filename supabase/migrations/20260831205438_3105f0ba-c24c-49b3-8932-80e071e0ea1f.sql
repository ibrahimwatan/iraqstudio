ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_text text,
  ADD COLUMN IF NOT EXISTS delivery_file text;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS delivery_text text,
  ADD COLUMN IF NOT EXISTS delivery_file text;

CREATE OR REPLACE FUNCTION public.buy_product(_product_id uuid)
 RETURNS purchases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  INSERT INTO public.purchases (user_id, product_id, product_title, price, delivery_text, delivery_file)
    VALUES (me.id, pr.id, pr.title, pr.price, pr.delivery_text, pr.delivery_file) RETURNING * INTO res;
  RETURN res;
END;
$function$;

-- storage policies for product-files
CREATE POLICY "merchants upload own product files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-files' AND owner = auth.uid());

CREATE POLICY "owners read own product files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-files' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "owners delete own product files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-files' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "buyers read purchased product files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-files' AND EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.user_id = auth.uid() AND p.delivery_file = storage.objects.name
  )
);