CREATE TABLE public.transaction_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  fund_id uuid REFERENCES public.funds(id) ON DELETE SET NULL,
  fund_type text,
  for_month date,
  action text NOT NULL DEFAULT 'UPDATE',
  previous_amount numeric,
  new_amount numeric,
  previous_data jsonb,
  new_data jsonb,
  updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_file text,
  import_batch_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transaction_audit_logs TO authenticated;
GRANT ALL ON public.transaction_audit_logs TO service_role;

ALTER TABLE public.transaction_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view transaction audit logs"
  ON public.transaction_audit_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert transaction audit logs"
  ON public.transaction_audit_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Super admins delete transaction audit logs"
  ON public.transaction_audit_logs FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE INDEX idx_txn_audit_logs_transaction ON public.transaction_audit_logs(transaction_id);
CREATE INDEX idx_txn_audit_logs_member ON public.transaction_audit_logs(member_id);
CREATE INDEX idx_txn_audit_logs_batch ON public.transaction_audit_logs(import_batch_id);
CREATE INDEX idx_txn_audit_logs_created_at ON public.transaction_audit_logs(created_at DESC);

CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  file_name text,
  records_processed integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING',
  import_batch_id uuid,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update own audit logs"
  ON public.audit_logs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND user_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND user_id = auth.uid());

CREATE POLICY "Super admins delete audit logs"
  ON public.audit_logs FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);