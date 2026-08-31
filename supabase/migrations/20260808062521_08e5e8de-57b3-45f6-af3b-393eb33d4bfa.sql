-- Seed member types
INSERT INTO public.member_types (name, description, sort_order)
SELECT v.name, v.descr, v.so
FROM (VALUES ('Founding & Executive','Founding and executive members',1),
             ('General','General members',2)) AS v(name, descr, so)
WHERE NOT EXISTS (SELECT 1 FROM public.member_types mt WHERE mt.name = v.name);

-- Seed funds
INSERT INTO public.funds (code, name, is_one_time, sort_order)
SELECT v.code, v.name, v.one_time, v.so
FROM (VALUES ('REGISTRATION','Registration Fee', true, 1),
             ('MONTHLY_FOUNDING','Monthly Founding', false, 2),
             ('MONTHLY_GENERAL','Monthly General', false, 3),
             ('MONTHLY_KOWMI','Monthly Kowmi Education', false, 4)) AS v(code, name, one_time, so)
WHERE NOT EXISTS (SELECT 1 FROM public.funds f WHERE f.code = v.code);

-- One canonical payment row per member / fund / month
CREATE UNIQUE INDEX IF NOT EXISTS transactions_member_fund_month_uniq
  ON public.transactions (member_id, fund_id, for_month)
  WHERE member_id IS NOT NULL AND for_month IS NOT NULL;

CREATE OR REPLACE FUNCTION public.import_reg_and_monthly(
  p_rows jsonb,
  p_file_name text DEFAULT NULL,
  p_batch_id uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r jsonb;
  pay jsonb;
  v_member_id uuid;
  v_type_id uuid;
  v_fund_reg uuid;
  v_fund_monthly uuid;
  v_month date;
  v_amount numeric;
  v_date date;
  v_existing public.transactions;
  v_txn_id uuid;
  v_members_created int := 0;
  v_members_updated int := 0;
  v_inserted int := 0;
  v_updated int := 0;
  v_unchanged int := 0;
  v_join date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'super_admin')) THEN
    RAISE EXCEPTION 'Only Admins may import financial data';
  END IF;

  SELECT id INTO v_fund_reg FROM public.funds WHERE code = 'REGISTRATION';

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    SELECT id INTO v_type_id FROM public.member_types
      WHERE name = (r->>'member_type') LIMIT 1;

    SELECT id INTO v_fund_monthly FROM public.funds
      WHERE code = (r->>'monthly_fund_code') LIMIT 1;
    IF v_fund_monthly IS NULL THEN
      RAISE EXCEPTION 'Unknown fund code % for member %', r->>'monthly_fund_code', r->>'member_no';
    END IF;

    v_join := (r->>'joining_date')::date;

    SELECT id INTO v_member_id FROM public.members
      WHERE member_no = (r->>'member_no')::int;

    IF v_member_id IS NULL THEN
      INSERT INTO public.members (member_no, full_name, reference_person, member_type_id,
                                  joining_date, monthly_fee, is_active)
      VALUES ((r->>'member_no')::int, r->>'full_name', r->>'reference_person', v_type_id,
              v_join, (r->>'monthly_fee')::numeric, true)
      RETURNING id INTO v_member_id;
      v_members_created := v_members_created + 1;
    ELSE
      UPDATE public.members
         SET full_name = r->>'full_name',
             reference_person = COALESCE(r->>'reference_person', reference_person),
             member_type_id = COALESCE(v_type_id, member_type_id),
             joining_date = LEAST(joining_date, v_join),
             monthly_fee = (r->>'monthly_fee')::numeric,
             updated_at = now()
       WHERE id = v_member_id;
      v_members_updated := v_members_updated + 1;
    END IF;

    -- Subscriptions (registration = one-time, plus the monthly fund)
    INSERT INTO public.member_fund_subscriptions (member_id, fund_id, monthly_amount, start_date, is_active)
    SELECT v_member_id, v_fund_reg, (r->>'registration_fee')::numeric, v_join, true
    WHERE v_fund_reg IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.member_fund_subscriptions s
                       WHERE s.member_id = v_member_id AND s.fund_id = v_fund_reg);

    INSERT INTO public.member_fund_subscriptions (member_id, fund_id, monthly_amount, start_date, is_active)
    SELECT v_member_id, v_fund_monthly, (r->>'monthly_fee')::numeric, v_join, true
    WHERE NOT EXISTS (SELECT 1 FROM public.member_fund_subscriptions s
                       WHERE s.member_id = v_member_id AND s.fund_id = v_fund_monthly);

    -- Payments: registration entry + one mirrored entry per month column
    FOR pay IN SELECT * FROM jsonb_array_elements(
                 COALESCE(r->'payments', '[]'::jsonb) ||
                 CASE WHEN (r->>'registration_fee') IS NULL OR v_fund_reg IS NULL THEN '[]'::jsonb
                      ELSE jsonb_build_array(jsonb_build_object(
                             'fund_id', v_fund_reg,
                             'for_month', to_char(v_join, 'YYYY-MM'),
                             'txn_date', r->>'registration_date',
                             'amount', (r->>'registration_fee')::numeric,
                             'kind', 'registration'))
                 END) LOOP

      v_month := (COALESCE(pay->>'for_month', to_char(v_join,'YYYY-MM')) || '-01')::date;
      v_amount := (pay->>'amount')::numeric;
      v_date := COALESCE((pay->>'txn_date')::date, v_month);

      SELECT * INTO v_existing FROM public.transactions t
       WHERE t.member_id = v_member_id
         AND t.fund_id = COALESCE((pay->>'fund_id')::uuid, v_fund_monthly)
         AND t.for_month = v_month;

      IF v_existing.id IS NULL THEN
        INSERT INTO public.transactions (member_id, fund_id, amount, txn_date, for_month,
                                         payment_method, description, created_by)
        VALUES (v_member_id, COALESCE((pay->>'fund_id')::uuid, v_fund_monthly), v_amount, v_date,
                v_month, 'cash',
                CASE WHEN pay->>'kind' = 'registration' THEN 'Registration fee (Excel import)'
                     ELSE 'Monthly contribution (Excel import)' END,
                v_uid)
        RETURNING id INTO v_txn_id;
        v_inserted := v_inserted + 1;

        INSERT INTO public.transaction_audit_logs (transaction_id, member_id, fund_id, fund_type,
          for_month, action, new_amount, new_data, updated_by_user_id, source_file, import_batch_id)
        VALUES (v_txn_id, v_member_id, COALESCE((pay->>'fund_id')::uuid, v_fund_monthly),
                pay->>'kind', v_month, 'insert', v_amount,
                jsonb_build_object('amount', v_amount, 'txn_date', v_date),
                v_uid, p_file_name, p_batch_id);

      ELSIF v_existing.amount <> v_amount OR v_existing.txn_date <> v_date THEN
        UPDATE public.transactions
           SET amount = v_amount, txn_date = v_date, updated_at = now()
         WHERE id = v_existing.id;
        v_updated := v_updated + 1;

        INSERT INTO public.transaction_audit_logs (transaction_id, member_id, fund_id, fund_type,
          for_month, action, previous_amount, new_amount, previous_data, new_data,
          updated_by_user_id, source_file, import_batch_id)
        VALUES (v_existing.id, v_member_id, v_existing.fund_id, pay->>'kind', v_month, 'update',
                v_existing.amount, v_amount,
                jsonb_build_object('amount', v_existing.amount, 'txn_date', v_existing.txn_date),
                jsonb_build_object('amount', v_amount, 'txn_date', v_date),
                v_uid, p_file_name, p_batch_id);
      ELSE
        v_unchanged := v_unchanged + 1;
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO public.audit_logs (user_id, action_type, file_name, records_processed, status,
                                 import_batch_id, details)
  VALUES (v_uid, 'excel_import', p_file_name,
          v_inserted + v_updated + v_unchanged, 'success', p_batch_id,
          jsonb_build_object('members_created', v_members_created,
                             'members_updated', v_members_updated,
                             'inserted', v_inserted,
                             'updated', v_updated,
                             'unchanged', v_unchanged));

  RETURN jsonb_build_object('batch_id', p_batch_id,
                            'members_created', v_members_created,
                            'members_updated', v_members_updated,
                            'inserted', v_inserted,
                            'updated', v_updated,
                            'unchanged', v_unchanged);
END;
$$;

REVOKE ALL ON FUNCTION public.import_reg_and_monthly(jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_reg_and_monthly(jsonb, text, uuid) TO authenticated;