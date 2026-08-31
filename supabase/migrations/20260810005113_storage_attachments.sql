-- Private bucket + admin-only policies for transaction / expense attachments.
INSERT INTO storage.buckets (id, name, public)
VALUES ('transaction-attachments', 'transaction-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins read transaction attachments"   ON storage.objects;
DROP POLICY IF EXISTS "Admins upload transaction attachments" ON storage.objects;
DROP POLICY IF EXISTS "Admins update transaction attachments" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete transaction attachments" ON storage.objects;

CREATE POLICY "Admins read transaction attachments"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'transaction-attachments' AND private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins upload transaction attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'transaction-attachments' AND private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update transaction attachments" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'transaction-attachments' AND private.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (bucket_id = 'transaction-attachments' AND private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete transaction attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'transaction-attachments' AND private.has_role(auth.uid(), 'admin'::public.app_role));
