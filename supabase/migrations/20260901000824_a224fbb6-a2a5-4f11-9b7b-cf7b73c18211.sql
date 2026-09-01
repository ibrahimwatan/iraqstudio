ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS merchant_id uuid;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS chat_expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours');

UPDATE public.purchases p SET merchant_id = pr.created_by
FROM public.products pr WHERE pr.id = p.product_id AND p.merchant_id IS NULL;

CREATE POLICY "merchants read own sales" ON public.purchases
  FOR SELECT TO authenticated USING (merchant_id = auth.uid());

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
  INSERT INTO public.purchases (user_id, product_id, product_title, price, delivery_text, delivery_file, merchant_id, chat_expires_at)
    VALUES (me.id, pr.id, pr.title, pr.price, pr.delivery_text, pr.delivery_file, pr.created_by, now() + interval '24 hours')
    RETURNING * INTO res;
  RETURN res;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_access_purchase(_purchase_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchases p
    WHERE p.id = _purchase_id
      AND (p.user_id = auth.uid() OR p.merchant_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
$$;

CREATE OR REPLACE FUNCTION public.purchase_chat_open(_purchase_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.purchases p WHERE p.id = _purchase_id AND p.chat_expires_at > now()
  )
$$;

CREATE TABLE public.purchase_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX purchase_messages_purchase_idx ON public.purchase_messages (purchase_id, created_at);

GRANT SELECT, INSERT ON public.purchase_messages TO authenticated;
GRANT ALL ON public.purchase_messages TO service_role;

ALTER TABLE public.purchase_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants read purchase messages" ON public.purchase_messages
  FOR SELECT TO authenticated USING (public.can_access_purchase(purchase_id));

CREATE POLICY "participants send purchase messages" ON public.purchase_messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_purchase(purchase_id)
    AND public.purchase_chat_open(purchase_id)
  );