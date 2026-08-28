REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_add_coins(text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_ban(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buy_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_coins(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_ban(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_product(uuid) TO authenticated;