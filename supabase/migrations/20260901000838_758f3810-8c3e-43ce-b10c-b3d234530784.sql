REVOKE ALL ON FUNCTION public.can_access_purchase(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_chat_open(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM anon;