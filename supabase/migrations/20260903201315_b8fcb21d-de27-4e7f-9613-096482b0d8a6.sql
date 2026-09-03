CREATE OR REPLACE FUNCTION public.admin_set_role(_username text, _role app_role, _grant boolean, _scope text DEFAULT 'all'::text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target public.profiles;
  parts text[];
  p text;
  cleaned text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_admin';
  END IF;

  IF _role = 'admin' THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  parts := string_to_array(regexp_replace(coalesce(_scope, 'all'), '\s+', '', 'g'), ',');
  parts := array_remove(parts, '');
  IF array_length(parts, 1) IS NULL THEN
    parts := ARRAY['all'];
  END IF;

  FOREACH p IN ARRAY parts LOOP
    IF p NOT IN ('all','accounts','maps','scripts','studio','other') THEN
      RAISE EXCEPTION 'invalid_scope';
    END IF;
  END LOOP;

  IF 'all' = ANY(parts) THEN
    cleaned := 'all';
  ELSE
    SELECT string_agg(DISTINCT s, ',') INTO cleaned FROM unnest(parts) AS s;
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
      UPDATE public.profiles SET merchant_scope = cleaned WHERE id = target.id RETURNING * INTO target;
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