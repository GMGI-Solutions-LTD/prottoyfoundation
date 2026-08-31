-- Trigger-only functions: never callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_receipt_no() FROM anon, authenticated;

-- Role helpers: needed by RLS policies for signed-in users only
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

-- Admin-only import RPC: signed-in only (function itself enforces admin role)
REVOKE ALL ON FUNCTION public.import_reg_and_monthly(jsonb, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_reg_and_monthly(jsonb, text, uuid) TO authenticated;

-- Login screen needs this before auth; keep anon access (returns only a boolean)
GRANT EXECUTE ON FUNCTION public.bootstrap_needed() TO anon, authenticated;