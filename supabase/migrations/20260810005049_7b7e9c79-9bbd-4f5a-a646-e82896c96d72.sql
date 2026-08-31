CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_super_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.bootstrap_needed() SET SCHEMA private;
ALTER FUNCTION public.import_reg_and_monthly(jsonb, text, uuid) SET SCHEMA private;
ALTER FUNCTION public.handle_new_user() SET SCHEMA private;

-- keep RLS / trigger / edge-function callers working
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.import_reg_and_monthly(jsonb, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.bootstrap_needed() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.import_reg_and_monthly(jsonb, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.bootstrap_needed() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.handle_new_user() TO service_role;

-- internal definers must resolve public objects explicitly
ALTER FUNCTION private.has_role(uuid, public.app_role) SET search_path = public, private;
ALTER FUNCTION private.is_super_admin(uuid) SET search_path = public, private;
ALTER FUNCTION private.bootstrap_needed() SET search_path = public, private;
ALTER FUNCTION private.import_reg_and_monthly(jsonb, text, uuid) SET search_path = public, private;
ALTER FUNCTION private.handle_new_user() SET search_path = public, private;

-- public, non-privileged wrappers for the two client-called routines
CREATE OR REPLACE FUNCTION public.bootstrap_needed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.bootstrap_needed() $$;

CREATE OR REPLACE FUNCTION public.import_reg_and_monthly(p_rows jsonb, p_file_name text DEFAULT NULL, p_batch_id uuid DEFAULT gen_random_uuid())
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.import_reg_and_monthly(p_rows, p_file_name, p_batch_id) $$;

REVOKE ALL ON FUNCTION public.bootstrap_needed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_reg_and_monthly(jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_needed() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_reg_and_monthly(jsonb, text, uuid) TO authenticated, service_role;