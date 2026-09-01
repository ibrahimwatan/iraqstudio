ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS original_price bigint,
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0;

UPDATE public.purchases
SET original_price = COALESCE(original_price, price),
    discount_percent = COALESCE(discount_percent, 0)
WHERE original_price IS NULL;

ALTER TABLE public.purchases ALTER COLUMN original_price SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.buy_product_with_local_discount(
  _product_id uuid,
  _buyer_id uuid,
  _discount_percent numeric(5,2) DEFAULT 0,
  _discount_code text DEFAULT NULL
)
RETURNS public.purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr public.products;
  me public.profiles;
  res public.purchases;
  normalized_code text;
  final_price bigint;
  applied_percent numeric(5,2) := COALESCE(_discount_percent, 0);
BEGIN
  IF _buyer_id IS NULL OR _product_id IS NULL THEN RAISE EXCEPTION 'invalid_purchase_request'; END IF;
  IF applied_percent < 0 OR applied_percent > 100 THEN RAISE EXCEPTION 'invalid_discount_percent'; END IF;

  SELECT * INTO me FROM public.profiles WHERE id = _buyer_id FOR UPDATE;
  IF me.id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF me.banned THEN RAISE EXCEPTION 'banned'; END IF;

  SELECT * INTO pr FROM public.products WHERE id = _product_id AND active FOR UPDATE;
  IF pr.id IS NULL THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF pr.stock <= 0 THEN RAISE EXCEPTION 'out_of_stock'; END IF;

  normalized_code := NULLIF(upper(regexp_replace(btrim(COALESCE(_discount_code, '')), '\s+', '', 'g')), '');
  IF applied_percent > 0 AND normalized_code IS NULL THEN RAISE EXCEPTION 'invalid_discount_code'; END IF;

  final_price := floor(pr.price * (100 - applied_percent) / 100)::bigint;
  IF me.coins < final_price THEN RAISE EXCEPTION 'insufficient_coins'; END IF;

  UPDATE public.profiles SET coins = coins - final_price WHERE id = me.id;
  UPDATE public.products SET stock = stock - 1 WHERE id = pr.id;
  INSERT INTO public.purchases (
    user_id, product_id, product_title, product_category, product_description, product_images,
    price, original_price, discount_code, discount_percent, delivery_text, delivery_file,
    merchant_id, chat_opened_at, chat_expires_at
  )
  VALUES (
    me.id, pr.id, pr.title, pr.category, pr.description, COALESCE(pr.images, '{}'),
    final_price, pr.price, normalized_code, applied_percent, pr.delivery_text, pr.delivery_file,
    pr.created_by, NULL, NULL
  )
  RETURNING * INTO res;
  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.buy_product_with_local_discount(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buy_product_with_local_discount(uuid, uuid, numeric, text) TO service_role;
