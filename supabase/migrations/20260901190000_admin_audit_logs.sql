CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read audit logs" ON public.admin_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX admin_audit_logs_created_at_idx
  ON public.admin_audit_logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.log_new_user_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname text;
BEGIN
  uname := coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  INSERT INTO public.admin_audit_logs (event_type, target_user_id, username, metadata)
  VALUES (
    'account_created',
    NEW.id,
    uname,
    jsonb_build_object('provider', coalesce(NEW.raw_app_meta_data->>'provider', 'password'))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_audit
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.log_new_user_audit();

CREATE OR REPLACE FUNCTION public.log_profile_admin_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  event_name text;
  details jsonb;
BEGIN
  IF OLD.banned IS DISTINCT FROM NEW.banned THEN
    event_name := CASE WHEN NEW.banned THEN 'user_banned' ELSE 'user_unbanned' END;
    details := jsonb_build_object('banned', NEW.banned);
  ELSIF OLD.coins IS DISTINCT FROM NEW.coins THEN
    event_name := 'coins_changed';
    details := jsonb_build_object('old_coins', OLD.coins, 'new_coins', NEW.coins);
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.admin_audit_logs (event_type, actor_user_id, target_user_id, username, metadata)
  VALUES (event_name, auth.uid(), NEW.id, NEW.username, details);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_admin_change_audit
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_profile_admin_change();
