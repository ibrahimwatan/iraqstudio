CREATE OR REPLACE FUNCTION public.admin_set_role(_username text, _role public.app_role, _grant boolean)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.profiles;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF _role = 'admin' THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  SELECT * INTO target FROM public.profiles
  WHERE username = lower(regexp_replace(_username, '\s+', '', 'g'));

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target.id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = target.id AND role = _role;
  END IF;

  RETURN target;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_role(text, public.app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(text, public.app_role, boolean) TO authenticated;

DROP POLICY IF EXISTS "merchants insert own products" ON public.products;
CREATE POLICY "merchants insert own products" ON public.products
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'merchant') AND created_by = auth.uid());

DROP POLICY IF EXISTS "merchants update own products" ON public.products;
CREATE POLICY "merchants update own products" ON public.products
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'merchant') AND created_by = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'merchant') AND created_by = auth.uid());

DROP POLICY IF EXISTS "merchants delete own products" ON public.products;
CREATE POLICY "merchants delete own products" ON public.products
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'merchant') AND created_by = auth.uid());

DROP POLICY IF EXISTS "members read active products" ON public.products;
CREATE POLICY "members read active products" ON public.products
FOR SELECT TO authenticated
USING (active OR public.has_role(auth.uid(), 'admin') OR created_by = auth.uid());

ALTER TABLE public.products ALTER COLUMN created_by SET DEFAULT auth.uid();