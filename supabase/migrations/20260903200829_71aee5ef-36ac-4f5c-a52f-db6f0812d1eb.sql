ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS merchant_scope text NOT NULL DEFAULT 'all';

CREATE OR REPLACE FUNCTION public.admin_set_role(_username text, _role app_role, _grant boolean, _scope text DEFAULT 'all')
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target public.profiles;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF _role = 'admin' THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  IF _scope NOT IN ('all','accounts','maps','scripts','studio','other') THEN
    RAISE EXCEPTION 'invalid_scope';
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
    IF _role = 'merchant' THEN
      UPDATE public.profiles SET merchant_scope = _scope WHERE id = target.id RETURNING * INTO target;
    END IF;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = target.id AND role = _role;
    IF _role = 'merchant' THEN
      UPDATE public.profiles SET merchant_scope = 'all' WHERE id = target.id RETURNING * INTO target;
    END IF;
  END IF;

  RETURN target;
END;
$function$;

DROP FUNCTION IF EXISTS public.admin_set_role(text, app_role, boolean);