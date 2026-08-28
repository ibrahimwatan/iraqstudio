CREATE TYPE public.app_role AS ENUM ('admin','member');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  coins bigint NOT NULL DEFAULT 0,
  banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  price bigint NOT NULL DEFAULT 0,
  image_url text,
  stock integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read active products" ON public.products FOR SELECT TO authenticated
  USING (active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins insert products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update products" ON public.products FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete products" ON public.products FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_title text NOT NULL,
  price bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own purchases read" ON public.purchases FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname text;
BEGIN
  uname := coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  INSERT INTO public.profiles (id, username) VALUES (NEW.id, uname);
  IF lower(uname) = 'watanjax' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'member')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.admin_add_coins(_username text, _amount bigint)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE public.profiles SET coins = greatest(0, coins + _amount)
    WHERE lower(username) = lower(trim(_username)) RETURNING * INTO p;
  IF p.id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  RETURN p;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_ban(_username text, _banned boolean)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'not_admin'; END IF;
  UPDATE public.profiles SET banned = _banned
    WHERE lower(username) = lower(trim(_username)) RETURNING * INTO p;
  IF p.id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  RETURN p;
END;
$$;

CREATE OR REPLACE FUNCTION public.buy_product(_product_id uuid)
RETURNS public.purchases LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  INSERT INTO public.purchases (user_id, product_id, product_title, price)
    VALUES (me.id, pr.id, pr.title, pr.price) RETURNING * INTO res;
  RETURN res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_coins(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ban(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;