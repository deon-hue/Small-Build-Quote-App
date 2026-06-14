-- Migration: cash payment tracking per job (no Xero sync)
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS job_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL,
  method       TEXT NOT NULL DEFAULT 'cash',  -- cash | cheque | bank_transfer | other
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE job_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own job payments"
  ON job_payments FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Portal RPC: get payments for a job the calling portal user has access to ──
CREATE OR REPLACE FUNCTION get_job_payments_for_portal(p_job_id UUID)
RETURNS JSON
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    TEXT;
  v_admin_id UUID;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN '[]'::JSON; END IF;

  -- Verify the portal user has access to this job (same logic as get_job_attachments_for_portal)
  SELECT j.user_id INTO v_admin_id
  FROM jobs j
  WHERE j.id = p_job_id
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.user_id = j.user_id
        AND LOWER(c.email) = LOWER(v_email)
        AND (
          LOWER(j.client) = LOWER(c.name)
          OR LOWER(j.client) = LOWER(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')))
          OR (c.last_name IS NOT NULL AND c.last_name <> ''
              AND LOWER(j.client) LIKE '%' || LOWER(c.last_name) || '%')
        )
    )
  LIMIT 1;

  IF v_admin_id IS NULL THEN RETURN '[]'::JSON; END IF;

  RETURN (
    SELECT COALESCE(json_agg(
      json_build_object(
        'id',           p.id,
        'amount',       p.amount,
        'payment_date', p.payment_date,
        'method',       p.method,
        'notes',        p.notes,
        'created_at',   p.created_at
      ) ORDER BY p.payment_date DESC
    ), '[]'::JSON)
    FROM job_payments p
    WHERE p.job_id = p_job_id
      AND p.user_id = v_admin_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_job_payments_for_portal(UUID) TO authenticated;
