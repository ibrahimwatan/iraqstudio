ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS product_category text,
  ADD COLUMN IF NOT EXISTS product_description text,
  ADD COLUMN IF NOT EXISTS product_images text[] NOT NULL DEFAULT '{}';

UPDATE public.purchases p
SET product_category = pr.category,
    product_description = pr.description,
    product_images = COALESCE(pr.images, '{}')
FROM public.products pr
WHERE p.product_id = pr.id
  AND (p.product_category IS NULL OR p.product_description IS NULL);

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
    user_id, product_id, product_title, product_category, product_description, product_images,
    price, delivery_text, delivery_file, merchant_id, chat_opened_at, chat_expires_at
  )
  VALUES (
    me.id, pr.id, pr.title, pr.category, pr.description, COALESCE(pr.images, '{}'),
    pr.price, pr.delivery_text, pr.delivery_file, pr.created_by, NULL, NULL
  )
  RETURNING * INTO res;
  RETURN res;
END;
$$;
