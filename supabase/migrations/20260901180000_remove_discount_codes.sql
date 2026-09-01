-- Remove the discount-code feature from deployed databases.
DROP FUNCTION IF EXISTS public.buy_product(uuid, text);
DROP FUNCTION IF EXISTS public.buy_product(uuid);
DROP FUNCTION IF EXISTS public.buy_product_with_local_discount(uuid, uuid, numeric, text);
DROP TABLE IF EXISTS public.discount_codes;

ALTER TABLE public.purchases
  DROP COLUMN IF EXISTS original_price,
  DROP COLUMN IF EXISTS discount_code,
  DROP COLUMN IF EXISTS discount_percent;

CREATE OR REPLACE FUNCTION public.buy_product(_product_id uuid)
RETURNS public.purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr public.products;
  me public.profiles;
  res public.purchases;
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

REVOKE ALL ON FUNCTION public.buy_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_product(uuid) TO authenticated;
