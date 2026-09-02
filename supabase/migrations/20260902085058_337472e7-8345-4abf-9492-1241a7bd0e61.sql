CREATE TABLE public.signup_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  password text not null,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT ON public.signup_logs TO authenticated;
GRANT ALL ON public.signup_logs TO service_role;
ALTER TABLE public.signup_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read signup logs" ON public.signup_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "self insert signup log" ON public.signup_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  percent integer not null,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_codes TO authenticated;
GRANT ALL ON public.discount_codes TO service_role;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage discount codes" ON public.discount_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.check_discount(_code text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT percent FROM public.discount_codes
  WHERE active AND lower(code) = lower(trim(_code)) LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.buy_product(_product_id uuid, _code text DEFAULT NULL)
RETURNS purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE pr public.products; me public.profiles; res public.purchases; disc integer := 0; final_price bigint;
BEGIN
  SELECT * INTO me FROM public.profiles WHERE id = auth.uid();
  IF me.id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF me.banned THEN RAISE EXCEPTION 'banned'; END IF;
  SELECT * INTO pr FROM public.products WHERE id = _product_id AND active FOR UPDATE;
  IF pr.id IS NULL THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF pr.stock <= 0 THEN RAISE EXCEPTION 'out_of_stock'; END IF;

  IF _code IS NOT NULL AND length(trim(_code)) > 0 THEN
    SELECT percent INTO disc FROM public.discount_codes
      WHERE active AND lower(code) = lower(trim(_code));
    IF disc IS NULL THEN RAISE EXCEPTION 'invalid_code'; END IF;
  END IF;
  disc := coalesce(disc, 0);
  final_price := greatest(0, floor(pr.price - (pr.price * disc / 100.0))::bigint);

  IF me.coins < final_price THEN RAISE EXCEPTION 'insufficient_coins'; END IF;
  UPDATE public.profiles SET coins = coins - final_price WHERE id = me.id;
  UPDATE public.products SET stock = stock - 1 WHERE id = pr.id;
  INSERT INTO public.purchases (user_id, product_id, product_title, price, delivery_text, delivery_file, merchant_id, chat_expires_at)
    VALUES (me.id, pr.id, pr.title, final_price, pr.delivery_text, pr.delivery_file, pr.created_by, now() + interval '24 hours')
    RETURNING * INTO res;
  RETURN res;
END;
$function$;