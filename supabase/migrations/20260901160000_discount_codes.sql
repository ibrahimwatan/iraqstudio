CREATE TABLE public.discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code = upper(code) AND code ~ '^[A-Z0-9_-]{3,32}$'),
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discount_codes ALTER COLUMN created_by SET DEFAULT auth.uid();

GRANT SELECT, INSERT, DELETE ON public.discount_codes TO authenticated;
GRANT ALL ON public.discount_codes TO service_role;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read discount codes" ON public.discount_codes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins create discount codes" ON public.discount_codes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY "admins delete discount codes" ON public.discount_codes
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS original_price bigint,
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) NOT NULL DEFAULT 0;

UPDATE public.purchases
SET original_price = COALESCE(original_price, price),
    discount_percent = COALESCE(discount_percent, 0)
WHERE original_price IS NULL;

ALTER TABLE public.purchases
  ALTER COLUMN original_price SET DEFAULT 0;

DROP FUNCTION IF EXISTS public.buy_product(uuid);
CREATE OR REPLACE FUNCTION public.buy_product(_product_id uuid, _discount_code text DEFAULT NULL)
RETURNS public.purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr public.products;
  me public.profiles;
  dc public.discount_codes;
  res public.purchases;
  normalized_code text;
  final_price bigint;
  applied_percent numeric(5,2) := 0;
BEGIN
  SELECT * INTO me FROM public.profiles WHERE id = auth.uid();
  IF me.id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF me.banned THEN RAISE EXCEPTION 'banned'; END IF;

  SELECT * INTO pr FROM public.products WHERE id = _product_id AND active FOR UPDATE;
  IF pr.id IS NULL THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF pr.stock <= 0 THEN RAISE EXCEPTION 'out_of_stock'; END IF;

  normalized_code := upper(regexp_replace(btrim(COALESCE(_discount_code, '')), '\s+', '', 'g'));
  IF normalized_code <> '' THEN
    SELECT * INTO dc FROM public.discount_codes
    WHERE code = normalized_code AND active
    FOR SHARE;
    IF dc.id IS NULL THEN RAISE EXCEPTION 'invalid_discount_code'; END IF;
    applied_percent := dc.discount_percent;
  ELSE
    normalized_code := NULL;
  END IF;

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

REVOKE ALL ON FUNCTION public.buy_product(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_product(uuid, text) TO authenticated;
